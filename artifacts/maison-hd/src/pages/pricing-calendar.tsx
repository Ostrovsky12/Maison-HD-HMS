import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X,
  CalendarRange, Moon, Sun, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

// ── Colour palette ────────────────────────────────────────────────────────────
const PALETTE = [
  "#6366f1","#3b82f6","#14b8a6","#10b981",
  "#f59e0b","#f97316","#ef4444","#ec4899",
  "#8b5cf6","#64748b",
];

// ── Day-of-week metadata (0 = Sunday … 6 = Saturday) ─────────────────────────
const DOW = [
  { id: 1, short: "Пн", label: "Понеділок" },
  { id: 2, short: "Вт", label: "Вівторок"  },
  { id: 3, short: "Ср", label: "Середа"    },
  { id: 4, short: "Чт", label: "Четвер"    },
  { id: 5, short: "Пт", label: "П'ятниця"  },
  { id: 6, short: "Сб", label: "Субота"    },
  { id: 0, short: "Нд", label: "Неділя"    },
];
const WEEKEND_DOW = new Set([0, 6]);

// ── Types ─────────────────────────────────────────────────────────────────────
interface PricingRule {
  id:               number;
  name:             string;
  color:            string;
  pricePerNight:    number;
  weekendPrice:     number | null;
  minNights:        number;
  minNightsWeekend: number;
  applyDays:        number[];
  dateFrom:         string | null;
  dateTo:           string | null;
  unitIds:          number[];
  isActive:         boolean;
}

interface Unit {
  id: number;
  name: string;
  propertyId: number;
  propertyName?: string;
}

interface Property {
  id: number;
  name: string;
}

const emptyForm = (): Omit<PricingRule, "id"> => ({
  name:             "",
  color:            PALETTE[0],
  pricePerNight:    0,
  weekendPrice:     null,
  minNights:        1,
  minNightsWeekend: 1,
  applyDays:        [0,1,2,3,4,5,6],
  dateFrom:         null,
  dateTo:           null,
  unitIds:          [],
  isActive:         true,
});

const fmt = (n: number) =>
  n.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₴";

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Returns the highest-priority (last-created = highest) active rule for a unit × date */
function ruleForCell(
  rules: PricingRule[],
  unitId: number,
  dateStr: string,
  dow: number,
): PricingRule | undefined {
  // rules are ordered newest-first from the API; take the first match
  return rules.find(r => {
    if (!r.isActive) return false;
    if (!r.unitIds.includes(unitId)) return false;
    if (!r.applyDays.includes(dow)) return false;
    if (r.dateFrom && dateStr < r.dateFrom) return false;
    if (r.dateTo   && dateStr > r.dateTo)   return false;
    return true;
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PricingCalendarPage() {
  const { toast } = useToast();
  const qc        = useQueryClient();

  // ── Calendar navigation ───────────────────────────────────────────────────
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const monthLabel = new Date(year, month, 1).toLocaleString("uk-UA", { month: "long", year: "numeric" });

  // ── Data loading ──────────────────────────────────────────────────────────
  const { data: rules = [] } = useQuery<PricingRule[]>({
    queryKey: ["pricing-rules"],
    queryFn:  async () => {
      const r = await apiFetch("/pricing-rules");
      return r.ok ? r.json() : [];
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn:  async () => {
      const r = await apiFetch("/properties");
      return r.ok ? r.json() : [];
    },
  });

  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: ["units-all"],
    queryFn:  async () => {
      const results: Unit[] = [];
      for (const p of properties) {
        const r = await apiFetch(`/units?property_id=${p.id}&limit=200`);
        if (!r.ok) continue;
        const units = await r.json();
        units.forEach((u: Unit) => results.push({ ...u, propertyName: p.name }));
      }
      return results;
    },
    enabled: properties.length > 0,
  });

  // Group units by property
  const unitsByProp = useMemo(() => {
    const map = new Map<number, { property: Property; units: Unit[] }>();
    for (const p of properties) map.set(p.id, { property: p, units: [] });
    for (const u of allUnits) {
      const group = map.get(u.propertyId);
      if (group) group.units.push(u);
    }
    return [...map.values()].filter(g => g.units.length > 0);
  }, [properties, allUnits]);

  // ── Rule editor state ─────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm]           = useState<Omit<PricingRule, "id">>(emptyForm());

  const f = useCallback(<K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  const openNew = () => {
    setForm(emptyForm());
    setEditingId("new");
  };

  const openEdit = (rule: PricingRule) => {
    setForm({
      name:             rule.name,
      color:            rule.color,
      pricePerNight:    rule.pricePerNight,
      weekendPrice:     rule.weekendPrice,
      minNights:        rule.minNights,
      minNightsWeekend: rule.minNightsWeekend,
      applyDays:        [...rule.applyDays],
      dateFrom:         rule.dateFrom,
      dateTo:           rule.dateTo,
      unitIds:          [...rule.unitIds],
      isActive:         rule.isActive,
    });
    setEditingId(rule.id);
  };

  const cancelEdit = () => setEditingId(null);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: async (data: Omit<PricingRule, "id">) => {
      const r = await apiFetch("/pricing-rules", {
        method: "POST", body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-rules"] });
      setEditingId(null);
      toast({ title: "Правило створено" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<PricingRule> }) => {
      const r = await apiFetch(`/pricing-rules/${id}`, {
        method: "PUT", body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-rules"] });
      setEditingId(null);
      toast({ title: "Правило оновлено" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/pricing-rules/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Помилка видалення");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-rules"] });
      toast({ title: "Правило видалено" });
    },
  });

  const toggleActive = (rule: PricingRule) =>
    updateMut.mutate({ id: rule.id, data: { isActive: !rule.isActive } });

  const handleSave = () => {
    if (!form.name.trim())      return toast({ title: "Вкажіть назву", variant: "destructive" });
    if (!form.pricePerNight)    return toast({ title: "Вкажіть ціну", variant: "destructive" });
    if (!form.unitIds.length)   return toast({ title: "Оберіть хоча б один юніт", variant: "destructive" });
    if (!form.applyDays.length) return toast({ title: "Оберіть хоча б один день", variant: "destructive" });

    if (editingId === "new") createMut.mutate(form);
    else if (typeof editingId === "number") updateMut.mutate({ id: editingId, data: form });
  };

  const toggleDay = (dow: number) => {
    f("applyDays", form.applyDays.includes(dow)
      ? form.applyDays.filter(d => d !== dow)
      : [...form.applyDays, dow]);
  };

  const toggleUnit = (unitId: number) => {
    f("unitIds", form.unitIds.includes(unitId)
      ? form.unitIds.filter(id => id !== unitId)
      : [...form.unitIds, unitId]);
  };

  const toggleAllProp = (propId: number) => {
    const propUnits = unitsByProp.find(g => g.property.id === propId)?.units || [];
    const ids = propUnits.map(u => u.id);
    const allSelected = ids.every(id => form.unitIds.includes(id));
    if (allSelected) f("unitIds", form.unitIds.filter(id => !ids.includes(id)));
    else f("unitIds", [...new Set([...form.unitIds, ...ids])]);
  };

  // ── Calendar pre-computation ───────────────────────────────────────────────
  const calendarData = useMemo(() => {
    return days.map(d => ({
      date:    d,
      str:     isoDate(d),
      dow:     d.getDay(),
      isWknd:  WEEKEND_DOW.has(d.getDay()),
    }));
  }, [days]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-screen bg-gray-50">
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Ціновий календар</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Прив'язуйте тарифні правила до юнітів по датах і днях тижня
            </p>
          </div>
          {editingId === null && (
            <Button onClick={openNew} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Нове правило
            </Button>
          )}
        </div>

        {/* ── Two-panel layout ─────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT: Rule list / editor ─────────────────────────────────── */}
          <div className="w-80 min-w-[320px] bg-white border-r flex flex-col overflow-hidden">

            {editingId === null ? (
              /* ── Rule list ────────────────────────────────────────────── */
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {rules.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <CalendarRange className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Немає тарифних правил</p>
                    <p className="text-xs mt-1">Натисніть «Нове правило»</p>
                  </div>
                )}
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className={cn(
                      "rounded-lg border p-3 transition-all",
                      rule.isActive ? "bg-white" : "bg-gray-50 opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {/* Color swatch */}
                      <div
                        className="w-3 h-full min-h-[40px] rounded-full mt-0.5 shrink-0"
                        style={{ backgroundColor: rule.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{rule.name}</span>
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={() => toggleActive(rule)}
                            className="scale-75"
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span>{fmt(rule.pricePerNight)}/ніч</span>
                            {rule.weekendPrice != null && (
                              <span className="text-amber-600">
                                {fmt(rule.weekendPrice)} вих.
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {DOW.filter(d => rule.applyDays.includes(d.id)).map(d => (
                              <span
                                key={d.id}
                                className={cn(
                                  "px-1 rounded text-[10px] font-medium",
                                  WEEKEND_DOW.has(d.id)
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-gray-100 text-gray-600",
                                )}
                              >{d.short}</span>
                            ))}
                          </div>
                          {(rule.dateFrom || rule.dateTo) && (
                            <div className="text-[11px]">
                              {rule.dateFrom || "∞"} → {rule.dateTo || "∞"}
                            </div>
                          )}
                          <div className="text-[11px]">
                            {rule.unitIds.length} {rule.unitIds.length === 1 ? "юніт" : "юніти"}
                            {rule.minNights > 1 && ` · мін. ${rule.minNights}н.`}
                            {rule.minNightsWeekend > 1 && ` · вих. мін. ${rule.minNightsWeekend}н.`}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => openEdit(rule)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => {
                            if (confirm("Видалити правило?")) deleteMut.mutate(rule.id);
                          }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Rule editor ──────────────────────────────────────────── */
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">
                    {editingId === "new" ? "Нове правило" : "Редагування"}
                  </h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Назва *</Label>
                    <Input
                      value={form.name}
                      onChange={e => f("name", e.target.value)}
                      placeholder="Напр. Літній тариф"
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Color */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Колір на календарі</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {PALETTE.map(c => (
                        <button
                          key={c}
                          onClick={() => f("color", c)}
                          className={cn(
                            "w-6 h-6 rounded-full transition-all",
                            form.color === c
                              ? "ring-2 ring-offset-2 ring-gray-800 scale-110"
                              : "hover:scale-110",
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Prices */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Sun className="w-3 h-3" /> Буднівна ціна *
                      </Label>
                      <Input
                        type="number" min={0}
                        value={form.pricePerNight || ""}
                        onChange={e => f("pricePerNight", Number(e.target.value))}
                        placeholder="1500"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Moon className="w-3 h-3 text-amber-500" /> Вихідна ціна
                      </Label>
                      <Input
                        type="number" min={0}
                        value={form.weekendPrice ?? ""}
                        onChange={e => f("weekendPrice", e.target.value ? Number(e.target.value) : null)}
                        placeholder="2000"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  {/* Min nights */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Мін. ночей (будні)</Label>
                      <Input
                        type="number" min={1}
                        value={form.minNights}
                        onChange={e => f("minNights", Math.max(1, Number(e.target.value)))}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Мін. ночей (вихідні)</Label>
                      <Input
                        type="number" min={1}
                        value={form.minNightsWeekend}
                        onChange={e => f("minNightsWeekend", Math.max(1, Number(e.target.value)))}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  {/* Days of week */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Дні тижня</Label>
                    <div className="flex gap-1">
                      {DOW.map(d => (
                        <button
                          key={d.id}
                          onClick={() => toggleDay(d.id)}
                          className={cn(
                            "flex-1 py-1 rounded text-[11px] font-medium transition-all border",
                            form.applyDays.includes(d.id)
                              ? WEEKEND_DOW.has(d.id)
                                ? "bg-amber-100 border-amber-300 text-amber-800"
                                : "bg-indigo-100 border-indigo-300 text-indigo-800"
                              : "bg-white border-gray-200 text-gray-400",
                          )}
                        >
                          {d.short}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date range */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Діапазон дат (якщо не заповнено — діє завжди)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={form.dateFrom || ""}
                        onChange={e => f("dateFrom", e.target.value || null)}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="date"
                        value={form.dateTo || ""}
                        onChange={e => f("dateTo", e.target.value || null)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Unit selection */}
                  <div className="space-y-2">
                    <Label className="text-xs">Юніти *</Label>
                    {unitsByProp.map(({ property, units }) => {
                      const allSel = units.every(u => form.unitIds.includes(u.id));
                      const someSel = units.some(u => form.unitIds.includes(u.id));
                      return (
                        <div key={property.id}>
                          {/* Property header with "select all" */}
                          <button
                            onClick={() => toggleAllProp(property.id)}
                            className="w-full flex items-center gap-2 text-xs font-semibold text-gray-700 py-1 hover:text-indigo-600 transition-colors"
                          >
                            <div className={cn(
                              "w-3.5 h-3.5 rounded border flex items-center justify-center",
                              allSel
                                ? "bg-indigo-600 border-indigo-600"
                                : someSel
                                ? "bg-indigo-200 border-indigo-400"
                                : "border-gray-300",
                            )}>
                              {(allSel || someSel) && (
                                <div className={cn("w-1.5 h-1.5 rounded-sm",
                                  allSel ? "bg-white" : "bg-indigo-600")} />
                              )}
                            </div>
                            {property.name}
                          </button>
                          <div className="pl-2 space-y-0.5">
                            {units.map(u => (
                              <label
                                key={u.id}
                                className="flex items-center gap-2 cursor-pointer py-0.5 text-xs text-gray-600 hover:text-gray-900"
                              >
                                <input
                                  type="checkbox"
                                  checked={form.unitIds.includes(u.id)}
                                  onChange={() => toggleUnit(u.id)}
                                  className="accent-indigo-600"
                                />
                                {u.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Save / cancel footer for editor */}
            {editingId !== null && (
              <div className="p-4 border-t flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={createMut.isPending || updateMut.isPending}
                  size="sm" className="flex-1"
                >
                  {createMut.isPending || updateMut.isPending ? "Збереження…" : "Зберегти"}
                </Button>
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  Скасувати
                </Button>
              </div>
            )}
          </div>

          {/* ── RIGHT: Calendar grid ─────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Month navigation */}
            <div className="flex items-center gap-3 px-6 py-3 bg-white border-b">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-medium text-sm capitalize w-44 text-center">{monthLabel}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="ml-4 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-amber-50 border border-amber-200" />
                  вихідний день
                </span>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3.5 h-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Колір клітинки показує перше активне правило.<br />
                    Якщо кілька правил перетинаються — відображається найновіше.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto p-4">
              {unitsByProp.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Немає юнітів. Спочатку додайте об'єкти та номери.
                </div>
              ) : (
                <table className="border-collapse text-xs w-full">
                  <thead>
                    <tr>
                      {/* Unit name column header */}
                      <th className="text-left font-medium text-gray-500 py-1 pr-3 w-40 min-w-[140px] sticky left-0 bg-gray-50 z-10 border-b border-gray-200">
                        Юніт
                      </th>
                      {calendarData.map(({ date, str, dow, isWknd }) => (
                        <th
                          key={str}
                          className={cn(
                            "w-8 min-w-[32px] text-center py-1 border-b border-gray-200",
                            isWknd ? "bg-amber-50" : "bg-gray-50",
                          )}
                        >
                          <div className={cn(
                            "font-semibold",
                            isWknd ? "text-amber-700" : "text-gray-600",
                          )}>
                            {date.getDate()}
                          </div>
                          <div className={cn(
                            "text-[10px]",
                            isWknd ? "text-amber-500" : "text-gray-400",
                          )}>
                            {DOW.find(d => d.id === dow)?.short ?? ""}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unitsByProp.map(({ property, units }) => (
                      <>
                        {/* Property group header */}
                        <tr key={`prop-${property.id}`}>
                          <td
                            colSpan={days.length + 1}
                            className="bg-gray-100 text-gray-600 font-semibold py-1 px-2 text-[11px] uppercase tracking-wide sticky left-0"
                          >
                            {property.name}
                          </td>
                        </tr>
                        {/* Unit rows */}
                        {units.map(unit => (
                          <tr key={unit.id} className="group hover:bg-indigo-50/30 transition-colors">
                            <td className="py-0.5 pr-3 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-white group-hover:bg-indigo-50/30 z-10 border-r border-gray-100">
                              {unit.name}
                            </td>
                            {calendarData.map(({ str, dow, isWknd }) => {
                              const rule = ruleForCell(rules, unit.id, str, dow);
                              const price = rule
                                ? (isWknd && rule.weekendPrice != null ? rule.weekendPrice : rule.pricePerNight)
                                : null;

                              return (
                                <Tooltip key={str}>
                                  <TooltipTrigger asChild>
                                    <td
                                      className={cn(
                                        "py-0.5 h-7 transition-all cursor-default",
                                        isWknd ? "bg-amber-50/40" : "",
                                        rule ? "opacity-100" : "opacity-100",
                                      )}
                                    >
                                      {rule ? (
                                        <div
                                          className="mx-0.5 h-5 rounded-sm flex items-center justify-center text-[9px] font-semibold text-white truncate px-0.5"
                                          style={{ backgroundColor: rule.color }}
                                          title={`${rule.name}: ${fmt(price!)}`}
                                        >
                                          {price != null ? Math.round(price / 100) * 100 === price
                                            ? `${Math.round(price / 1000)}k`
                                            : "" : ""}
                                        </div>
                                      ) : (
                                        <div className={cn(
                                          "mx-0.5 h-5 rounded-sm",
                                          isWknd ? "bg-amber-50" : "bg-gray-50",
                                        )} />
                                      )}
                                    </td>
                                  </TooltipTrigger>
                                  {rule && (
                                    <TooltipContent side="top" className="text-xs">
                                      <div className="font-semibold">{rule.name}</div>
                                      <div>{fmt(price!)}/ніч</div>
                                      {rule.minNights > 1 && <div>Мін. {isWknd && rule.minNightsWeekend > 1 ? rule.minNightsWeekend : rule.minNights} ночей</div>}
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Legend bar */}
            {rules.filter(r => r.isActive).length > 0 && (
              <div className="border-t bg-white px-4 py-2 flex gap-3 flex-wrap">
                {rules.filter(r => r.isActive).map(r => (
                  <div key={r.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
