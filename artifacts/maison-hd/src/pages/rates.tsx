import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Tag, Loader2, AlertCircle, StopCircle, Gift, CalendarRange, Home, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmtMoney = (n: number) => Math.round(n).toLocaleString("uk-UA") + " ₴";
const fmtDate  = (s?: string | null) => s ? format(new Date(s + "T00:00"), "dd MMM yyyy", { locale: uk }) : null;

interface Unit {
  id: number;
  name: string;
  category: string;
  capacity: number;
  basePrice: number;
  propertyId: number;
}

interface Rate {
  id: number;
  propertyId: number;
  name: string;
  unitCategory?: string | null;
  pricePerNight: number;
  minNights?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  isStopSale?: boolean;
  promoCode?: string | null;
  discountPercent?: number | null;
  unitPrices?: Record<string, number> | null;
}

interface Property { id: number; name: string; }

const emptyForm = (propertyId?: number) => ({
  propertyId: propertyId || 0,
  name: "",
  minNights: 1,
  dateFrom: null as string | null,
  dateTo: null as string | null,
  isStopSale: false,
  promoCode: null as string | null,
  discountPercent: null as number | null,
  unitPrices: {} as Record<string, string>,
});

export default function RatesPage() {
  const { toast } = useToast();
  const [rates, setRates] = useState<Rate[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterProp, setFilterProp] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRate, setEditRate] = useState<Rate | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedRate, setExpandedRate] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [rr, pr] = await Promise.all([
      apiFetch("/rates").then(r => r.ok ? r.json() : []),
      apiFetch("/properties").then(r => r.ok ? r.json() : []),
    ]);
    setRates(Array.isArray(rr) ? rr : []);
    setProperties(Array.isArray(pr) ? pr : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadUnits = useCallback(async (propertyId: number) => {
    if (!propertyId) { setUnits([]); return; }
    setLoadingUnits(true);
    const r = await apiFetch(`/units?property_id=${propertyId}&limit=200`);
    if (r.ok) {
      const d = await r.json();
      setUnits(Array.isArray(d) ? d : (d.units || []));
    }
    setLoadingUnits(false);
  }, []);

  const openCreate = (propertyId?: number) => {
    const pid = propertyId || properties[0]?.id || 0;
    setEditRate(null);
    setForm(emptyForm(pid));
    setDialogOpen(true);
    loadUnits(pid);
  };

  const openEdit = (r: Rate) => {
    setEditRate(r);
    const unitPricesStr: Record<string, string> = {};
    if (r.unitPrices) {
      Object.entries(r.unitPrices).forEach(([k, v]) => {
        unitPricesStr[k] = String(v);
      });
    }
    setForm({
      propertyId: r.propertyId,
      name: r.name,
      minNights: r.minNights || 1,
      dateFrom: r.dateFrom || null,
      dateTo: r.dateTo || null,
      isStopSale: r.isStopSale || false,
      promoCode: r.promoCode || null,
      discountPercent: r.discountPercent || null,
      unitPrices: unitPricesStr,
    });
    setDialogOpen(true);
    loadUnits(r.propertyId);
  };

  const fv = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const setUnitPrice = (unitId: number, price: string) => {
    setForm(prev => ({
      ...prev,
      unitPrices: { ...prev.unitPrices, [String(unitId)]: price },
    }));
  };

  const onPropertyChange = (pid: number) => {
    fv("propertyId", pid);
    setForm(prev => ({ ...prev, propertyId: pid, unitPrices: {} }));
    loadUnits(pid);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Вкажіть назву тарифу", variant: "destructive" }); return; }
    if (!form.propertyId) { toast({ title: "Оберіть об'єкт", variant: "destructive" }); return; }

    const unitPricesNum: Record<string, number> = {};
    let hasAnyPrice = false;
    Object.entries(form.unitPrices).forEach(([k, v]) => {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) {
        unitPricesNum[k] = n;
        hasAnyPrice = true;
      }
    });

    if (!hasAnyPrice && !form.isStopSale) {
      toast({ title: "Вкажіть ціну хоча б для одного юніту", variant: "destructive" });
      return;
    }

    const minPrice = hasAnyPrice ? Math.min(...Object.values(unitPricesNum)) : 0;

    setSaving(true);
    try {
      const body = JSON.stringify({
        propertyId: form.propertyId,
        name: form.name.trim(),
        pricePerNight: minPrice,
        minNights: form.minNights ? Number(form.minNights) : 1,
        discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
        dateFrom: form.dateFrom || null,
        dateTo: form.dateTo || null,
        isStopSale: form.isStopSale,
        promoCode: form.promoCode?.trim() || null,
        unitPrices: hasAnyPrice ? unitPricesNum : null,
        unitCategory: null,
      });
      let res;
      if (editRate) {
        res = await apiFetch(`/rates/${editRate.id}`, { method: "PUT", body });
      } else {
        res = await apiFetch("/rates", { method: "POST", body });
      }
      if (!res.ok) throw new Error(await res.text());
      toast({ title: editRate ? "Тариф оновлено ✓" : "Тариф створено ✓" });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteRate = async (id: number) => {
    if (!confirm("Видалити тариф?")) return;
    setDeletingId(id);
    await apiFetch(`/rates/${id}`, { method: "DELETE" });
    toast({ title: "Тариф видалено" });
    setDeletingId(null);
    load();
  };

  const propName = (id: number) => properties.find(p => p.id === id)?.name || `Об'єкт #${id}`;

  const filtered = filterProp === "all" ? rates : rates.filter(r => String(r.propertyId) === filterProp);

  const grouped = filtered.reduce((acc, r) => {
    const key = String(r.propertyId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {} as Record<string, Rate[]>);

  const getRatePriceSummary = (r: Rate) => {
    if (!r.unitPrices || Object.keys(r.unitPrices).length === 0) {
      return fmtMoney(r.pricePerNight);
    }
    const prices = Object.values(r.unitPrices);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return fmtMoney(min);
    return `${fmtMoney(min)} – ${fmtMoney(max)}`;
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Tag className="w-6 h-6 text-indigo-500" /> Тарифи
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Прайс-листи, сезонні ціни, промокоди та стоп-сейл
            </p>
          </div>
          <Button onClick={() => openCreate()} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Новий тариф
          </Button>
        </div>

        {/* Filter */}
        {properties.length > 1 && (
          <div className="mb-4 flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterProp("all")}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterProp === "all" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              Всі об'єкти
            </button>
            {properties.map(p => (
              <button
                key={p.id}
                onClick={() => setFilterProp(String(p.id))}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterProp === String(p.id) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Тарифів ще немає</p>
            <p className="text-sm mt-1">Натисніть «Новий тариф» щоб створити перший</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([propId, propRates]) => (
              <div key={propId}>
                {Object.keys(grouped).length > 1 && (
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-sm font-bold text-gray-700">{propName(Number(propId))}</h2>
                    <div className="flex-1 border-t border-gray-200" />
                    <button
                      onClick={() => openCreate(Number(propId))}
                      className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Додати тариф
                    </button>
                  </div>
                )}
                <div className="grid gap-2">
                  {propRates.map(r => {
                    const isExpanded = expandedRate === r.id;
                    const unitPricesEntries = r.unitPrices ? Object.entries(r.unitPrices) : [];
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border bg-white transition-shadow hover:shadow-sm ${r.isStopSale ? "border-red-200" : "border-gray-200"}`}
                      >
                        {/* Main row */}
                        <div className="flex items-center gap-3 p-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${r.isStopSale ? "bg-red-100" : r.promoCode ? "bg-amber-100" : "bg-indigo-100"}`}>
                            {r.isStopSale ? "🚫" : r.promoCode ? "🎁" : "💰"}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-900">{r.name}</span>
                              {r.isStopSale && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Стоп-сейл</Badge>}
                              {r.promoCode && <Badge className="text-[10px] py-0 px-1.5 bg-amber-100 text-amber-700 border-amber-200">{r.promoCode}</Badge>}
                              {unitPricesEntries.length > 0 && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-indigo-600 border-indigo-200">
                                  {unitPricesEntries.length} юніт{unitPricesEntries.length === 1 ? '' : unitPricesEntries.length < 5 ? 'и' : 'ів'}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                              {r.minNights && r.minNights > 1 && (
                                <span>мін. {r.minNights} ноч{r.minNights === 1 ? 'і' : r.minNights < 5 ? 'і' : 'ей'}</span>
                              )}
                              {(r.dateFrom || r.dateTo) && (
                                <span className="flex items-center gap-1">
                                  <CalendarRange className="w-3 h-3" />
                                  {fmtDate(r.dateFrom) || "—"} – {fmtDate(r.dateTo) || "—"}
                                </span>
                              )}
                              {r.discountPercent && (
                                <span className="text-emerald-600">знижка {r.discountPercent}%</span>
                              )}
                            </div>
                          </div>

                          {/* Price summary */}
                          <div className="text-right shrink-0">
                            {!r.isStopSale && (
                              <>
                                <div className="font-bold text-gray-900">{getRatePriceSummary(r)}</div>
                                <div className="text-[10px] text-gray-400">за ніч</div>
                              </>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 shrink-0">
                            {unitPricesEntries.length > 0 && (
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8 text-gray-400"
                                onClick={() => setExpandedRate(isExpanded ? null : r.id)}
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                              disabled={deletingId === r.id}
                              onClick={() => deleteRate(r.id)}
                            >
                              {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>

                        {/* Expanded unit prices */}
                        {isExpanded && unitPricesEntries.length > 0 && (
                          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 rounded-b-xl">
                            <div className="text-xs font-medium text-gray-500 mb-2">Ціни по юнітах</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                              {unitPricesEntries.map(([unitId, price]) => (
                                <div key={unitId} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-2.5 py-2 text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0 text-gray-700 truncate">
                                    <Home className="w-3 h-3 text-gray-400 shrink-0" />
                                    <span className="truncate">Юніт #{unitId}</span>
                                  </div>
                                  <span className="font-semibold text-gray-900 shrink-0 ml-1">{fmtMoney(price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-500" />
                {editRate ? "Редагувати тариф" : "Новий тариф"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Property */}
              <div className="space-y-1.5">
                <Label>Об'єкт *</Label>
                <Select
                  value={String(form.propertyId || "")}
                  onValueChange={v => onPropertyChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть об'єкт" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Name + Min nights */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Назва тарифу *</Label>
                  <Input
                    placeholder="напр. Базовий, Вихідні, Ранній птах..."
                    value={form.name}
                    onChange={e => fv("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Мін. ночей</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    value={form.minNights || ""}
                    onChange={e => fv("minNights", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Unit Prices */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5" />
                  Ціна за ніч по юнітах (₴)
                </Label>

                {loadingUnits ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Завантаження юнітів...
                  </div>
                ) : units.length === 0 ? (
                  <div className="py-4 text-sm text-gray-400 text-center bg-gray-50 rounded-xl border border-dashed">
                    Немає юнітів для обраного об'єкта
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_140px] text-xs font-medium text-gray-500 bg-gray-50 px-3 py-2 border-b border-gray-100">
                      <span>Юніт</span>
                      <span className="text-right">Ціна за ніч (₴)</span>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                      {units.map(u => (
                        <div key={u.id} className="grid grid-cols-[1fr_140px] items-center px-3 py-2.5 gap-3 hover:bg-gray-50">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{u.name}</div>
                            <div className="text-xs text-gray-400">
                              {u.capacity} ос. · базова {fmtMoney(u.basePrice)}
                            </div>
                          </div>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              placeholder={String(u.basePrice || 0)}
                              value={form.unitPrices[String(u.id)] || ""}
                              onChange={e => setUnitPrice(u.id, e.target.value)}
                              className="text-right pr-6 h-8 text-sm"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">₴</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                      Залиште поле порожнім якщо ціна для юніту не встановлена
                    </div>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Діє з</Label>
                  <Input type="date" value={form.dateFrom || ""} onChange={e => fv("dateFrom", e.target.value || null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Діє до</Label>
                  <Input type="date" value={form.dateTo || ""} onChange={e => fv("dateTo", e.target.value || null)} />
                </div>
              </div>

              {/* Promo + Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Gift className="w-3.5 h-3.5" /> Промокод</Label>
                  <Input
                    placeholder="PROMO2026"
                    value={form.promoCode || ""}
                    onChange={e => fv("promoCode", e.target.value || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Знижка (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={form.discountPercent || ""}
                    onChange={e => fv("discountPercent", e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>

              {/* Stop-Sale */}
              <div
                onClick={() => fv("isStopSale", !form.isStopSale)}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-colors ${form.isStopSale ? "border-red-300 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${form.isStopSale ? "bg-red-500" : "border-2 border-gray-300"}`}>
                  {form.isStopSale && <StopCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <div>
                  <div className="text-sm font-medium">Стоп-сейл</div>
                  <div className="text-xs text-gray-500">Блокує продажі на вказані дати</div>
                </div>
              </div>

              {form.isStopSale && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  Стоп-сейл блокує онлайн-продажі на вказаний період. Ручне бронювання залишається доступним.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Скасувати</Button>
              <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Збереження...</> : editRate ? "Зберегти" : "Створити тариф"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
