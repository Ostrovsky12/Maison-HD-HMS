import { useState, useEffect, useCallback } from "react";
import {
  Plus, Search, BedDouble, Wrench, Sparkles, Loader2, Calendar,
  CheckCircle2, XCircle, Eye, EyeOff, Wind, Maximize2, Edit2, Trash2,
  Building2, X, ChevronRight, RefreshCw, AlertTriangle, CheckSquare,
  Square, MousePointerClick,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_BASE = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API_BASE + path, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const HK_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  clean:       { label: "Чисто",      color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Sparkles },
  dirty:       { label: "Брудно",     color: "bg-rose-100 text-rose-800 border-rose-200",          icon: BedDouble },
  in_progress: { label: "В процесі",  color: "bg-amber-100 text-amber-800 border-amber-200",        icon: Wrench },
  inspected:   { label: "Перевірено", color: "bg-blue-100 text-blue-800 border-blue-200",           icon: CheckCircle2 },
};
const VIEW_LABELS: Record<string, string> = { park: "Парк", sea: "Море", city: "Місто", garden: "Сад", mountain: "Гори", pool: "Басейн" };
const CATEGORIES = ["standard", "deluxe", "suite", "cottage", "villa", "apartment", "bungalow", "room"];
const CAT_UA: Record<string, string> = { standard: "Стандарт", deluxe: "Делюкс", suite: "Сюїт", cottage: "Котедж", villa: "Вілла", apartment: "Апартаменти", bungalow: "Бунгало", room: "Кімната" };
const PROP_TYPES = ["hotel", "hostel", "house", "apartment", "villa", "resort", "campsite", "other"];
const PROP_TYPE_UA: Record<string, string> = { hotel: "Готель", hostel: "Хостел", house: "Будинок", apartment: "Апартаменти", villa: "Вілла", resort: "Курорт", campsite: "Кемпінг", other: "Інше" };

function getTodayStr() { return new Date().toISOString().split("T")[0]; }
function getTomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; }

// ── UNIT FORM MODAL ────────────────────────────────────────────────────────────
function UnitModal({ unit, properties, onClose, onSaved }: { unit?: any; properties: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!unit;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: unit?.name || "",
    propertyId: String(unit?.propertyId || properties[0]?.id || ""),
    category: unit?.category || "standard",
    capacity: String(unit?.capacity || "2"),
    maxCapacity: String(unit?.maxCapacity || ""),
    baseGuests: String(unit?.baseGuests || "2"),
    basePrice: String(unit?.basePrice || ""),
    extraGuestPrice: String(unit?.extraGuestPrice || "0"),
    floor: unit?.floor || "",
    squareMeters: String(unit?.squareMeters || ""),
    hasBalcony: unit?.hasBalcony ?? false,
    hasView: unit?.hasView || "",
    description: unit?.description || "",
    status: unit?.status || "active",
  });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Вкажіть назву", variant: "destructive" }); return; }
    if (!form.propertyId) { toast({ title: "Оберіть об'єкт", variant: "destructive" }); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      propertyId: parseInt(form.propertyId),
      category: form.category,
      capacity: parseInt(form.capacity) || 2,
      maxCapacity: form.maxCapacity ? parseInt(form.maxCapacity) : null,
      baseGuests: parseInt(form.baseGuests) || 2,
      basePrice: form.basePrice ? parseFloat(form.basePrice) : null,
      extraGuestPrice: parseFloat(form.extraGuestPrice) || 0,
      floor: form.floor || null,
      squareMeters: form.squareMeters ? parseFloat(form.squareMeters) : null,
      hasBalcony: form.hasBalcony,
      hasView: form.hasView || null,
      description: form.description || null,
      status: form.status,
    };
    const r = isEdit
      ? await apiFetch(`/units/${unit.id}`, { method: "PUT", body: JSON.stringify(body) })
      : await apiFetch("/units", { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { const d = await r.json(); toast({ title: d.error || "Помилка", variant: "destructive" }); return; }
    toast({ title: isEdit ? "Юніт оновлено" : "Юніт створено" });
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">{isEdit ? `Редагувати: ${unit.name}` : "Новий юніт"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          {/* Row 1: name + property */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Назва *</label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Котедж 1, Стандарт 101..." />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Об'єкт *</label>
              <Select value={form.propertyId} onValueChange={v => set("propertyId", v)}>
                <SelectTrigger><SelectValue placeholder="Оберіть об'єкт" /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: category + status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Категорія</label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CAT_UA[c] || c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Статус</label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активний</SelectItem>
                  <SelectItem value="maintenance">Технічний стан</SelectItem>
                  <SelectItem value="inactive">Неактивний</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: capacity group */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Місткість (осн.)</label>
              <Input type="number" min="1" value={form.capacity} onChange={e => set("capacity", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Макс. місткість</label>
              <Input type="number" min="1" value={form.maxCapacity} onChange={e => set("maxCapacity", e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Гостей у ціні</label>
              <Input type="number" min="1" value={form.baseGuests} onChange={e => set("baseGuests", e.target.value)} />
            </div>
          </div>

          {/* Row 4: pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Ціна / ніч (₴)</label>
              <Input type="number" min="0" value={form.basePrice} onChange={e => set("basePrice", e.target.value)} placeholder="3500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Дод. гість / ніч (₴)</label>
              <Input type="number" min="0" value={form.extraGuestPrice} onChange={e => set("extraGuestPrice", e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Row 5: physical */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Поверх / будинок</label>
              <Input value={form.floor} onChange={e => set("floor", e.target.value)} placeholder="1, А, корпус 2..." />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Площа (м²)</label>
              <Input type="number" min="0" value={form.squareMeters} onChange={e => set("squareMeters", e.target.value)} placeholder="45" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Вид</label>
              <Select value={form.hasView || "none"} onValueChange={v => set("hasView", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без виду</SelectItem>
                  {Object.entries(VIEW_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Balcony checkbox */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.hasBalcony} onChange={e => set("hasBalcony", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-violet-600" />
            <span className="text-sm font-medium text-gray-700">Є балкон / тераса</span>
          </label>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Опис</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              rows={3} placeholder="Комфортний котедж з каміном..."
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose} className="flex-1">Скасувати</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdit ? "Зберегти" : "Створити юніт"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── PROPERTY FORM MODAL ────────────────────────────────────────────────────────
function PropertyModal({ property, onClose, onSaved }: { property?: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!property;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: property?.name || "",
    type: property?.type || "house",
    address: property?.address || "",
    description: property?.description || "",
    touristTaxRate: String(property?.tourist_tax_rate ?? property?.touristTaxRate ?? "0"),
  });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Вкажіть назву об'єкта", variant: "destructive" }); return; }
    setSaving(true);
    const body = { name: form.name.trim(), type: form.type, address: form.address || null, description: form.description || null, touristTaxRate: parseFloat(form.touristTaxRate) || 0 };
    const r = isEdit
      ? await apiFetch(`/properties/${property.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await apiFetch("/properties", { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { const d = await r.json(); toast({ title: d.error || "Помилка", variant: "destructive" }); return; }
    toast({ title: isEdit ? "Об'єкт оновлено" : "Об'єкт створено" });
    onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">{isEdit ? `Редагувати: ${property.name}` : "Новий об'єкт"}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Назва об'єкта *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Котеджний комплекс ДОГОДА..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Тип</label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROP_TYPES.map(t => <SelectItem key={t} value={t}>{PROP_TYPE_UA[t] || t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Туристичний збір (₴)</label>
              <Input type="number" min="0" value={form.touristTaxRate} onChange={e => set("touristTaxRate", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Адреса</label>
            <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="с. Шешори, вул. Головна 1..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Опис</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3}
              placeholder="Опишіть об'єкт..."
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose} className="flex-1">Скасувати</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdit ? "Зберегти" : "Створити"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── DELETE CONFIRM ─────────────────────────────────────────────────────────────
function DeleteConfirm({ label, onConfirm, onClose }: { label: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-lg">Видалити?</h3>
          <p className="text-sm text-gray-500 mt-1">{label}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Скасувати</Button>
          <Button onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-700 text-white">Видалити</Button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function UnitsPage() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<"units" | "properties">("units");
  const [unitViewMode, setUnitViewMode] = useState<"all" | "availability">("all");

  // Data
  const [units, setUnits] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [propFilter, setPropFilter] = useState<string>("all");

  // Dates for availability
  const [checkIn, setCheckIn] = useState(getTodayStr());
  const [checkOut, setCheckOut] = useState(getTomorrowStr());
  const [filterAvail, setFilterAvail] = useState<"all" | "available" | "busy">("all");

  // Visibility filter
  const [visFilter, setVisFilter] = useState<"visible" | "hidden" | "all">("visible");

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Search
  const [search, setSearch] = useState("");

  // Modals
  const [unitModal, setUnitModal] = useState<{ open: boolean; unit?: any }>({ open: false });
  const [propModal, setPropModal] = useState<{ open: boolean; property?: any }>({ open: false });
  const [deleteUnit, setDeleteUnit] = useState<any>(null);
  const [deleteProp, setDeleteProp] = useState<any>(null);

  const loadUnits = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/units");
    if (r.ok) { const d = await r.json(); setUnits(d); }
    setLoading(false);
  }, []);

  const loadProperties = useCallback(async () => {
    const r = await apiFetch("/properties");
    if (r.ok) { const d = await r.json(); setProperties(d); }
  }, []);

  const loadAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setLoading(true);
    const r = await apiFetch(`/units/availability?checkIn=${checkIn}&checkOut=${checkOut}`);
    if (r.ok) { const d = await r.json(); setAvailability(d); }
    setLoading(false);
  }, [checkIn, checkOut]);

  useEffect(() => { loadUnits(); loadProperties(); }, []);
  useEffect(() => { if (unitViewMode === "availability") loadAvailability(); }, [unitViewMode, loadAvailability]);

  const handleDeleteUnit = async (unit: any) => {
    const r = await apiFetch(`/units/${unit.id}`, { method: "DELETE" });
    if (!r.ok) {
      // No DELETE endpoint — mark as inactive instead
      const r2 = await apiFetch(`/units/${unit.id}`, { method: "PUT", body: JSON.stringify({ status: "inactive" }) });
      if (r2.ok) { toast({ title: "Юніт деактивовано" }); loadUnits(); }
      else toast({ title: "Помилка", variant: "destructive" });
    } else { toast({ title: "Юніт видалено" }); loadUnits(); }
    setDeleteUnit(null);
  };

  const handleDeleteProperty = async (prop: any) => {
    const r = await apiFetch(`/properties/${prop.id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); toast({ title: d.error || "Помилка", variant: "destructive" }); }
    else { toast({ title: "Об'єкт видалено" }); loadProperties(); loadUnits(); }
    setDeleteProp(null);
  };

  const handleHkStatus = async (unitId: number, status: string) => {
    const r = await apiFetch("/housekeeping/unit-statuses", { method: "PATCH", body: JSON.stringify({ unitId, housekeepingStatus: status }) });
    if (r.ok) { loadUnits(); toast({ title: "Статус оновлено" }); }
    else toast({ title: "Помилка оновлення статусу", variant: "destructive" });
  };

  const handleBulkVisibility = async (hide: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const r = await apiFetch("/units/bulk-visibility", { method: "PATCH", body: JSON.stringify({ ids, isHidden: hide }) });
    if (r.ok) {
      toast({ title: hide ? `Приховано ${ids.length} юнітів` : `Показано ${ids.length} юнітів` });
      setSelectedIds(new Set());
      setSelectMode(false);
      loadUnits();
    } else {
      toast({ title: "Помилка", variant: "destructive" });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (visibleIds: number[]) => {
    if (visibleIds.every(id => selectedIds.has(id))) {
      setSelectedIds(prev => { const n = new Set(prev); visibleIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); visibleIds.forEach(id => n.add(id)); return n; });
    }
  };

  // Filtered units
  const displayUnits = unitViewMode === "availability"
    ? (availability?.results || [])
        .filter((r: any) => { if (filterAvail === "available") return r.isAvailable; if (filterAvail === "busy") return !r.isAvailable; return true; })
        .filter((r: any) => r.unit.name.toLowerCase().includes(search.toLowerCase()) || r.unit.category.toLowerCase().includes(search.toLowerCase()))
        .filter((r: any) => propFilter === "all" || String(r.unit.propertyId) === propFilter)
        .map((r: any) => ({ ...r.unit, _available: r.isAvailable }))
    : units
        .filter(u => {
          if (visFilter === "visible") return !u.isHidden;
          if (visFilter === "hidden") return !!u.isHidden;
          return true;
        })
        .filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || (u.category || "").toLowerCase().includes(search.toLowerCase()))
        .filter(u => propFilter === "all" || String(u.propertyId) === propFilter);

  const hiddenCount = units.filter(u => !!u.isHidden).length;
  const visibleCount = units.filter(u => !u.isHidden).length;

  return (
    <AppLayout>
      {unitModal.open && (
        <UnitModal unit={unitModal.unit} properties={properties} onClose={() => setUnitModal({ open: false })}
          onSaved={() => { loadUnits(); loadProperties(); }} />
      )}
      {propModal.open && (
        <PropertyModal property={propModal.property} onClose={() => setPropModal({ open: false })}
          onSaved={() => { loadProperties(); loadUnits(); }} />
      )}
      {deleteUnit && (
        <DeleteConfirm label={`Юніт «${deleteUnit.name}» буде деактивовано.`}
          onConfirm={() => handleDeleteUnit(deleteUnit)} onClose={() => setDeleteUnit(null)} />
      )}
      {deleteProp && (
        <DeleteConfirm label={`Об'єкт «${deleteProp.name}». Видалення можливе лише якщо немає юнітів.`}
          onConfirm={() => handleDeleteProperty(deleteProp)} onClose={() => setDeleteProp(null)} />
      )}

      <div className="p-6 max-w-7xl mx-auto h-full flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Номерний фонд</h1>
            <p className="text-sm text-gray-500">Керування юнітами та об'єктами розміщення</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadUnits(); loadProperties(); }}><RefreshCw className="h-4 w-4" /></Button>
            {mainTab === "units"
              ? <Button size="sm" className="bg-violet-600 hover:bg-violet-700 gap-2" onClick={() => setUnitModal({ open: true })}><Plus className="h-4 w-4" />Додати юніт</Button>
              : <Button size="sm" className="bg-violet-600 hover:bg-violet-700 gap-2" onClick={() => setPropModal({ open: true })}><Plus className="h-4 w-4" />Додати об'єкт</Button>
            }
          </div>
        </div>

        {/* Main tabs */}
        <Tabs value={mainTab} onValueChange={v => setMainTab(v as any)}>
          <TabsList>
            <TabsTrigger value="units" className="gap-2"><BedDouble className="h-4 w-4" />Юніти ({units.length})</TabsTrigger>
            <TabsTrigger value="properties" className="gap-2"><Building2 className="h-4 w-4" />Об'єкти ({properties.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ── UNITS TAB ── */}
        {mainTab === "units" && (
          <>
            {/* Filters row 1: view mode + search + property */}
            <div className="flex flex-wrap gap-3 items-center">
              <Tabs value={unitViewMode} onValueChange={v => { setUnitViewMode(v as any); setSelectMode(false); setSelectedIds(new Set()); }}>
                <TabsList>
                  <TabsTrigger value="all">Список</TabsTrigger>
                  <TabsTrigger value="availability" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Доступність</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Пошук..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={propFilter} onValueChange={setPropFilter}>
                <SelectTrigger className="h-9 w-[170px] text-sm"><SelectValue placeholder="Всі об'єкти" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі об'єкти</SelectItem>
                  {properties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {unitViewMode === "availability" && (
                <>
                  <Input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="h-9 w-36 text-sm" />
                  <span className="text-gray-400">→</span>
                  <Input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} className="h-9 w-36 text-sm" />
                  <Button size="sm" variant="outline" onClick={loadAvailability}>Перевірити</Button>
                  <Select value={filterAvail} onValueChange={v => setFilterAvail(v as any)}>
                    <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Всі</SelectItem>
                      <SelectItem value="available">Тільки вільні</SelectItem>
                      <SelectItem value="busy">Тільки зайняті</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            {/* Filters row 2: visibility tabs + select mode (list view only) */}
            {unitViewMode === "all" && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-semibold">
                  {([
                    { key: "visible", label: `Видимі`, count: visibleCount },
                    { key: "hidden",  label: `Приховані`, count: hiddenCount },
                    { key: "all",     label: "Всі", count: units.length },
                  ] as const).map(({ key, label, count }) => (
                    <button key={key} onClick={() => setVisFilter(key)}
                      className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${visFilter === key ? "bg-violet-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      {key === "hidden" && <EyeOff className="h-3 w-3" />}
                      {key === "visible" && <Eye className="h-3 w-3" />}
                      {label}
                      <span className={`rounded-full px-1.5 text-[10px] ${visFilter === key ? "bg-white/20" : "bg-gray-100 text-gray-400"}`}>{count}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setSelectMode(v => !v); if (selectMode) setSelectedIds(new Set()); }}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold border transition-colors ${selectMode ? "bg-violet-100 border-violet-300 text-violet-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {selectMode ? "Завершити вибір" : "Обрати"}
                </button>
                {selectMode && displayUnits.length > 0 && (
                  <button
                    onClick={() => toggleSelectAll((displayUnits as any[]).map((u: any) => u.id))}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {(displayUnits as any[]).every((u: any) => selectedIds.has(u.id))
                      ? <><CheckSquare className="h-3.5 w-3.5 text-violet-500" />Скасувати все</>
                      : <><Square className="h-3.5 w-3.5" />Обрати всі</>
                    }
                  </button>
                )}
              </div>
            )}

            {/* Bulk action toolbar */}
            {selectMode && selectedIds.size > 0 && (
              <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
                <span className="text-sm font-semibold text-violet-800">Обрано: {selectedIds.size}</span>
                <div className="flex gap-2 ml-auto">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-violet-300 text-violet-700 hover:bg-violet-100"
                    onClick={() => handleBulkVisibility(true)}>
                    <EyeOff className="h-3.5 w-3.5" />Приховати
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-violet-300 text-violet-700 hover:bg-violet-100"
                    onClick={() => handleBulkVisibility(false)}>
                    <Eye className="h-3.5 w-3.5" />Показати
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-500"
                    onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}>
                    Скасувати
                  </Button>
                </div>
              </div>
            )}

            {/* Availability summary */}
            {unitViewMode === "availability" && availability && (
              <div className="flex items-center gap-4 text-sm p-3 bg-gray-50 rounded-xl border">
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium"><CheckCircle2 className="h-4 w-4" />{availability.availableCount} вільних</span>
                <span className="flex items-center gap-1.5 text-rose-700 font-medium"><XCircle className="h-4 w-4" />{(availability.totalCount || 0) - (availability.availableCount || 0)} зайнятих</span>
                <span className="text-gray-400">· {availability.nights} ніч(і)</span>
              </div>
            )}

            {/* Units grid */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>
            ) : displayUnits.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <BedDouble className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">{visFilter === "hidden" ? "Немає прихованих юнітів" : "Немає юнітів"}</p>
                {visFilter === "hidden" && <p className="text-sm mt-1">Приховані юніти не відображаються у шахматці та бронюваннях</p>}
                {visFilter !== "hidden" && <p className="text-sm">Натисніть "Додати юніт" щоб створити перший</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(displayUnits as any[]).map(unit => {
                  const hk = HK_CONFIG[unit.housekeepingStatus] || HK_CONFIG.dirty;
                  const HkIcon = hk.icon;
                  const propName = properties.find(p => p.id === unit.propertyId)?.name;
                  const isHidden = !!unit.isHidden;
                  const isSelected = selectedIds.has(unit.id);
                  return (
                    <Card key={unit.id}
                      onClick={selectMode ? () => toggleSelect(unit.id) : undefined}
                      className={`flex flex-col overflow-hidden transition-all hover:shadow-md group relative ${
                        isHidden ? "opacity-60 bg-gray-50" : ""
                      } ${selectMode ? "cursor-pointer" : ""} ${
                        isSelected ? "ring-2 ring-violet-500 ring-offset-1" : ""
                      }`}
                    >
                      {/* Checkbox in select mode */}
                      {selectMode && (
                        <div className="absolute top-2 left-2 z-10">
                          {isSelected
                            ? <CheckSquare className="h-5 w-5 text-violet-600 bg-white rounded" />
                            : <Square className="h-5 w-5 text-gray-400 bg-white rounded" />
                          }
                        </div>
                      )}
                      {/* Hidden overlay badge */}
                      {isHidden && (
                        <div className="absolute top-2 right-2 z-10">
                          <span className="flex items-center gap-1 text-[10px] font-bold bg-gray-700 text-white px-1.5 py-0.5 rounded-full">
                            <EyeOff className="h-2.5 w-2.5" />Приховано
                          </span>
                        </div>
                      )}
                      <div className={`h-1.5 w-full ${isHidden ? "bg-gray-300" : unitViewMode === "availability" ? (unit._available ? "bg-emerald-400" : "bg-rose-400") : unit.status === "maintenance" ? "bg-amber-400" : "bg-violet-400"}`} />
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex justify-between items-start gap-2">
                          <div className={`min-w-0 ${selectMode ? "pl-6" : ""}`}>
                            <CardTitle className={`text-base font-bold truncate ${isHidden ? "text-gray-500" : ""}`}>{unit.name}</CardTitle>
                            <p className="text-xs text-gray-400 truncate">{propName || "—"}</p>
                          </div>
                          {!selectMode && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button onClick={e => { e.stopPropagation(); setUnitModal({ open: true, unit }); }}
                                className="p-1.5 hover:bg-violet-100 rounded-lg text-violet-600"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={async e => { e.stopPropagation(); const r = await apiFetch(`/units/${unit.id}`, { method: "PUT", body: JSON.stringify({ isHidden: !isHidden }) }); if (r.ok) { loadUnits(); toast({ title: isHidden ? "Юніт показано" : "Юніт приховано" }); } }}
                                className={`p-1.5 rounded-lg ${isHidden ? "hover:bg-emerald-100 text-emerald-600" : "hover:bg-gray-100 text-gray-500"}`} title={isHidden ? "Показати" : "Приховати"}>
                                {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                              <button onClick={e => { e.stopPropagation(); setDeleteUnit(unit); }}
                                className="p-1.5 hover:bg-red-100 rounded-lg text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 px-4 pb-2 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-xs">{CAT_UA[unit.category] || unit.category}</Badge>
                          {unit.status === "maintenance" && <Badge className="bg-amber-100 text-amber-700 text-xs">Ремонт</Badge>}
                          {unitViewMode === "availability" && (
                            <Badge className={`text-xs ${unit._available ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {unit._available ? "Вільний" : "Зайнятий"}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 text-xs text-gray-600">
                          <div className="flex justify-between"><span className="text-gray-400">Місць:</span><span className="font-medium">{unit.capacity}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Ціна:</span><span className="font-medium">{unit.basePrice ? `${Number(unit.basePrice).toLocaleString()} ₴` : "—"}</span></div>
                          {unit.floor && <div className="flex justify-between"><span className="text-gray-400">Поверх:</span><span className="font-medium">{unit.floor}</span></div>}
                          {unit.squareMeters && <div className="flex justify-between"><span className="text-gray-400">Площа:</span><span className="font-medium">{unit.squareMeters} м²</span></div>}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {unit.hasBalcony && <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded px-1.5 py-0.5 flex items-center gap-1"><Wind className="h-3 w-3" />Балкон</span>}
                          {unit.hasView && <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5 flex items-center gap-1"><Eye className="h-3 w-3" />{VIEW_LABELS[unit.hasView] || unit.hasView}</span>}
                          {unit.squareMeters && !unit.hasView && !unit.hasBalcony && <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 flex items-center gap-1"><Maximize2 className="h-3 w-3" />{unit.squareMeters} м²</span>}
                        </div>
                      </CardContent>
                      {!isHidden && (
                        <CardFooter className="px-4 py-3 border-t bg-gray-50/60">
                          <div className="w-full flex items-center justify-between gap-2">
                            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${hk.color}`}>
                              <HkIcon className="h-3 w-3" />{hk.label}
                            </div>
                            <Select value={unit.housekeepingStatus || "dirty"} onValueChange={v => handleHkStatus(unit.id, v)}>
                              <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="clean">Чисто</SelectItem>
                                <SelectItem value="dirty">Брудно</SelectItem>
                                <SelectItem value="in_progress">Прибирають</SelectItem>
                                <SelectItem value="inspected">Перевірено</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </CardFooter>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── PROPERTIES TAB ── */}
        {mainTab === "properties" && (
          <div className="space-y-3">
            {properties.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">Немає об'єктів</p>
                <Button size="sm" className="mt-3 bg-violet-600 hover:bg-violet-700" onClick={() => setPropModal({ open: true })}><Plus className="h-4 w-4 mr-1" />Створити перший об'єкт</Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {properties.map(p => (
                  <Card key={p.id} className="group hover:shadow-md transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-6 w-6 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-gray-900 text-base">{p.name}</h3>
                            <Badge variant="outline" className="text-xs">{PROP_TYPE_UA[p.type] || p.type}</Badge>
                            <Badge className="bg-violet-100 text-violet-700 text-xs">{p.unitCount} юнітів</Badge>
                          </div>
                          {p.address && <p className="text-sm text-gray-500 mt-0.5 truncate">{p.address}</p>}
                          {p.description && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{p.description}</p>}
                          <div className="flex gap-4 mt-2 text-xs text-gray-500">
                            {(p.tourist_tax_rate > 0 || p.touristTaxRate > 0) && (
                              <span>Туристичний збір: <strong>{p.tourist_tax_rate ?? p.touristTaxRate} ₴</strong></span>
                            )}
                            <span>ID: {p.id}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setPropModal({ open: true, property: p })}>
                            <Edit2 className="h-3.5 w-3.5" />Редагувати
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => setDeleteProp(p)} disabled={p.unitCount > 0} title={p.unitCount > 0 ? "Спочатку видаліть усі юніти" : ""}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Sub-units list */}
                      {p.unitCount > 0 && (
                        <div className="mt-4 border-t pt-3">
                          <p className="text-xs font-semibold text-gray-500 mb-2">Юніти цього об'єкта:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {units.filter(u => u.propertyId === p.id).map(u => (
                              <button key={u.id} onClick={() => setUnitModal({ open: true, unit: u })}
                                className="flex items-center gap-1.5 text-xs bg-gray-50 hover:bg-violet-50 border border-gray-200 hover:border-violet-300 rounded-lg px-2.5 py-1 transition-colors">
                                <BedDouble className="h-3 w-3 text-gray-400" />
                                <span className="font-medium">{u.name}</span>
                                <span className="text-gray-400">{u.basePrice ? `${Number(u.basePrice).toLocaleString()} ₴` : ""}</span>
                                <Edit2 className="h-2.5 w-2.5 text-violet-400" />
                              </button>
                            ))}
                            <button onClick={() => setUnitModal({ open: true })}
                              className="flex items-center gap-1 text-xs bg-violet-50 border border-violet-200 text-violet-600 rounded-lg px-2.5 py-1 hover:bg-violet-100 transition-colors">
                              <Plus className="h-3 w-3" />Додати
                            </button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
