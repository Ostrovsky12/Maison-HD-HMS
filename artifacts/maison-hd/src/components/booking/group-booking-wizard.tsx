import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import {
  Building2, Check, ChevronLeft, ChevronRight, Loader2, Search,
  Users, BedDouble, Home, AlertTriangle, CircleCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const token = () => localStorage.getItem("hms_token") || "";
const authFetch = (path: string, options: RequestInit = {}) =>
  fetch(API + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

type WizardStep = 0 | 1 | 2 | 3;
type AvailableUnit = {
  id: number;
  name: string;
  category: string;
  propertyId: number;
  propertyName: string;
  propertyType: string;
  capacity: number;
  basePrice: number;
  isAvailable: boolean;
};
type Allocation = {
  unitId: number;
  adults: number;
  childrenOver6: number;
  childrenUnder6: number;
  totalAmount: number;
};
type Organization = { id: number; name: string };

export interface GroupBookingWizardProps {
  open: boolean;
  checkIn?: string;
  checkOut?: string;
  onClose: () => void;
  onSuccess?: (result: any) => void;
}

const STEP_LABELS = ["Деталі", "Юніти", "Розподіл", "Підтвердження"];
const currency = (value: number) => new Intl.NumberFormat("uk-UA", {
  style: "currency", currency: "UAH", maximumFractionDigits: 0,
}).format(value);

const emptyDetails = (checkIn?: string, checkOut?: string) => ({
  groupName: "",
  contactName: "",
  phone: "",
  company: "",
  notes: "",
  checkIn: checkIn || format(new Date(), "yyyy-MM-dd"),
  checkOut: checkOut || format(addDays(new Date(), 1), "yyyy-MM-dd"),
  adults: 1,
  childrenOver6: 0,
  childrenUnder6: 0,
  organizationId: "",
});

function groupContactName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "Контакт групи", lastName: parts.join(" ") };
}

export function GroupBookingWizard({
  open, checkIn, checkOut, onClose, onSuccess,
}: GroupBookingWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>(0);
  const [details, setDetails] = useState(() => emptyDetails(checkIn, checkOut));
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [units, setUnits] = useState<AvailableUnit[]>([]);
  const [allocations, setAllocations] = useState<Record<number, Allocation>>({});
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const nights = Math.max(0, differenceInCalendarDays(new Date(details.checkOut), new Date(details.checkIn)));
  const totalGuests = Math.max(0, Number(details.adults || 0) + Number(details.childrenOver6 || 0) + Number(details.childrenUnder6 || 0));
  const selectedIds = Object.keys(allocations).map(Number);
  const selectedUnits = useMemo(
    () => units.filter(unit => selectedIds.includes(unit.id)),
    [units, selectedIds.join(",")],
  );
  const selectedCapacity = selectedUnits.reduce((sum, unit) => sum + unit.capacity, 0);
  const allocatedAdults = selectedIds.reduce((sum, id) => sum + (allocations[id]?.adults || 0), 0);
  const allocatedOver6 = selectedIds.reduce((sum, id) => sum + (allocations[id]?.childrenOver6 || 0), 0);
  const allocatedUnder6 = selectedIds.reduce((sum, id) => sum + (allocations[id]?.childrenUnder6 || 0), 0);
  const allocatedGuests = allocatedAdults + allocatedOver6 + allocatedUnder6;
  const totalAmount = selectedIds.reduce((sum, id) => sum + Number(allocations[id]?.totalAmount || 0), 0);
  const allocationComplete = selectedUnits.length > 0
    && allocatedAdults === Number(details.adults || 0)
    && allocatedOver6 === Number(details.childrenOver6 || 0)
    && allocatedUnder6 === Number(details.childrenUnder6 || 0)
    && selectedUnits.every(unit => {
      const allocation = allocations[unit.id];
      return allocation && allocation.adults + allocation.childrenOver6 + allocation.childrenUnder6 <= unit.capacity;
    });

  const properties = useMemo(() => {
    const values = new Map<number, string>();
    units.forEach(unit => values.set(unit.propertyId, unit.propertyName));
    return [...values.entries()].map(([id, name]) => ({ id, name }));
  }, [units]);
  const visibleUnits = useMemo(() => units.filter(unit => {
    const query = search.trim().toLowerCase();
    return unit.isAvailable
      && (propertyFilter === "all" || String(unit.propertyId) === propertyFilter)
      && (typeFilter === "all" || unit.propertyType === typeFilter)
      && (!query || `${unit.name} ${unit.category} ${unit.propertyName}`.toLowerCase().includes(query));
  }), [units, search, propertyFilter, typeFilter]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDetails(emptyDetails(checkIn, checkOut));
    setUnits([]);
    setAllocations({});
    setSearch("");
    setPropertyFilter("all");
    setTypeFilter("all");

    authFetch("/organizations")
      .then(async response => response.ok ? response.json() : [])
      .then(data => {
        const availableOrganizations = Array.isArray(data)
          ? data.map((organization: any) => ({ id: Number(organization.id), name: organization.name }))
          : [];
        setOrganizations(availableOrganizations);
        if (availableOrganizations.length === 1) {
          setDetails(current => ({ ...current, organizationId: String(availableOrganizations[0].id) }));
        }
      })
      .catch(() => setOrganizations([]));
  }, [open, checkIn, checkOut]);

  const resetSelectionForAvailabilityChange = (patch: Partial<typeof details>) => {
    setDetails(current => ({ ...current, ...patch }));
    if ("checkIn" in patch || "checkOut" in patch || "organizationId" in patch) {
      setUnits([]);
      setAllocations({});
    }
  };

  const loadAvailability = async () => {
    if (!details.checkIn || !details.checkOut || nights < 1) {
      toast({ title: "Вкажіть коректні дати", description: "Дата виїзду має бути після дати заїзду.", variant: "destructive" });
      return false;
    }
    if (!details.groupName.trim()) {
      toast({ title: "Вкажіть назву групи", variant: "destructive" });
      return false;
    }
    if (!details.contactName.trim()) {
      toast({ title: "Вкажіть контактну особу", variant: "destructive" });
      return false;
    }
    if (totalGuests < 1) {
      toast({ title: "Вкажіть кількість гостей", variant: "destructive" });
      return false;
    }
    if (organizations.length > 0 && !details.organizationId) {
      toast({ title: "Оберіть організацію", description: "Super Admin має вказати готель, для якого створюється бронювання.", variant: "destructive" });
      return false;
    }

    setLoadingUnits(true);
    try {
      const query = new URLSearchParams({ checkIn: details.checkIn, checkOut: details.checkOut });
      if (details.organizationId) query.set("organizationId", details.organizationId);
      const response = await authFetch(`/bookings/group-availability?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не вдалося завантажити доступність");
      setUnits(Array.isArray(data.units) ? data.units : []);
      setAllocations({});
      setStep(1);
      return true;
    } catch (error: any) {
      toast({ title: "Не вдалося завантажити юніти", description: error.message, variant: "destructive" });
      return false;
    } finally {
      setLoadingUnits(false);
    }
  };

  const toggleUnit = (unit: AvailableUnit) => {
    setAllocations(current => {
      if (current[unit.id]) {
        const { [unit.id]: _removed, ...rest } = current;
        return rest;
      }
      return {
        ...current,
        [unit.id]: {
          unitId: unit.id,
          adults: 0,
          childrenOver6: 0,
          childrenUnder6: 0,
          totalAmount: Math.round(unit.basePrice * nights * 100) / 100,
        },
      };
    });
  };

  const selectVisible = () => {
    setAllocations(current => {
      const next = { ...current };
      visibleUnits.forEach(unit => {
        if (!next[unit.id]) {
          next[unit.id] = {
            unitId: unit.id, adults: 0, childrenOver6: 0, childrenUnder6: 0,
            totalAmount: Math.round(unit.basePrice * nights * 100) / 100,
          };
        }
      });
      return next;
    });
  };

  const updateAllocation = (unitId: number, key: keyof Omit<Allocation, "unitId">, value: number) => {
    setAllocations(current => ({
      ...current,
      [unitId]: { ...current[unitId], [key]: Math.max(0, Number.isFinite(value) ? value : 0) },
    }));
  };

  const autoAllocate = () => {
    let remainingAdults = Number(details.adults || 0);
    let remainingOver6 = Number(details.childrenOver6 || 0);
    let remainingUnder6 = Number(details.childrenUnder6 || 0);
    const next = { ...allocations };
    selectedUnits.forEach(unit => {
      const takeAdults = Math.min(unit.capacity, remainingAdults);
      remainingAdults -= takeAdults;
      const afterAdults = unit.capacity - takeAdults;
      const takeOver6 = Math.min(afterAdults, remainingOver6);
      remainingOver6 -= takeOver6;
      const takeUnder6 = Math.min(afterAdults - takeOver6, remainingUnder6);
      remainingUnder6 -= takeUnder6;
      next[unit.id] = {
        ...next[unit.id],
        adults: takeAdults,
        childrenOver6: takeOver6,
        childrenUnder6: takeUnder6,
      };
    });
    setAllocations(next);
  };

  const submit = async () => {
    if (!allocationComplete) {
      toast({ title: "Завершіть розподіл гостей", description: "Кількість гостей за типами має відповідати введеним даним.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const contact = groupContactName(details.contactName);
      const response = await authFetch("/bookings/group", {
        method: "POST",
        body: JSON.stringify({
          organizationId: details.organizationId ? Number(details.organizationId) : undefined,
          groupName: details.groupName.trim(),
          checkIn: details.checkIn,
          checkOut: details.checkOut,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: details.phone.trim() || undefined,
          source: "corporate",
          status: "confirmed",
          totalGuests,
          notes: [
            details.company.trim() ? `Компанія: ${details.company.trim()}` : "",
            details.notes.trim(),
          ].filter(Boolean).join("\n") || undefined,
          units: selectedUnits.map(unit => allocations[unit.id]),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не вдалося створити групове бронювання");
      toast({
        title: "Групове бронювання створено",
        description: `${data.bookings?.length || selectedUnits.length} юнітів · ${totalGuests} гостей · ${currency(Number(data.totalAmount || totalAmount))}`,
      });
      onSuccess?.(data);
      onClose();
    } catch (error: any) {
      toast({ title: "Бронювання не створено", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === 0) {
      await loadAvailability();
      return;
    }
    if (step === 1) {
      if (selectedUnits.length === 0) {
        toast({ title: "Оберіть щонайменше один юніт", variant: "destructive" });
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!allocationComplete) {
        toast({ title: "Розподіл гостей не завершено", description: "Перевірте кількість гостей та місткість вибраних юнітів.", variant: "destructive" });
        return;
      }
      setStep(3);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-4 border-b border-slate-200 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-violet-600" /> Майстер групового бронювання
          </DialogTitle>
          <p className="text-sm text-slate-500">Розмістіть групу в будинках і номерах одним бронюванням.</p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden md:block w-48 border-r border-slate-200 bg-slate-50 p-4 shrink-0">
            <ol className="space-y-1">
              {STEP_LABELS.map((label, index) => {
                const active = step === index;
                const done = step > index;
                return (
                  <li key={label} className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm ${active ? "bg-violet-100 text-violet-800 font-semibold" : done ? "text-emerald-700" : "text-slate-400"}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-emerald-500 text-white" : active ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                      {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ol>
          </aside>

          <section className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="md:hidden flex gap-1 mb-5">
              {STEP_LABELS.map((label, index) => (
                <div key={label} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-violet-600" : "bg-slate-200"}`} />
              ))}
            </div>

            {step === 0 && (
              <div className="max-w-3xl mx-auto space-y-6">
                <div>
                  <h3 className="font-semibold text-slate-900">Група та період</h3>
                  <p className="text-sm text-slate-500 mt-1">Дати визначають доступність усіх будинків і номерів.</p>
                </div>
                {organizations.length > 0 && (
                  <div>
                    <Label>Організація / готель *</Label>
                    <select value={details.organizationId} onChange={event => resetSelectionForAvailabilityChange({ organizationId: event.target.value })}
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm bg-white">
                      <option value="">Оберіть організацію</option>
                      {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div><Label>Назва групи *</Label><Input className="mt-1" placeholder="Корпоратив компанії" value={details.groupName} onChange={event => resetSelectionForAvailabilityChange({ groupName: event.target.value })} /></div>
                  <div><Label>Компанія / організатор</Label><Input className="mt-1" placeholder="Назва компанії" value={details.company} onChange={event => resetSelectionForAvailabilityChange({ company: event.target.value })} /></div>
                  <div><Label>Дата заїзду *</Label><Input className="mt-1" type="date" value={details.checkIn} onChange={event => resetSelectionForAvailabilityChange({ checkIn: event.target.value })} /></div>
                  <div><Label>Дата виїзду *</Label><Input className="mt-1" type="date" min={details.checkIn} value={details.checkOut} onChange={event => resetSelectionForAvailabilityChange({ checkOut: event.target.value })} /></div>
                  <div><Label>Контактна особа *</Label><Input className="mt-1" placeholder="Ім'я та прізвище" value={details.contactName} onChange={event => resetSelectionForAvailabilityChange({ contactName: event.target.value })} /></div>
                  <div><Label>Телефон</Label><Input className="mt-1" type="tel" placeholder="+380…" value={details.phone} onChange={event => resetSelectionForAvailabilityChange({ phone: event.target.value })} /></div>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                  <div className="flex items-center gap-2 text-violet-900 font-semibold"><Users className="h-4 w-4" /> Склад групи: {totalGuests} гостей</div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div><Label>Дорослі</Label><Input className="mt-1 bg-white" min="0" type="number" value={details.adults} onChange={event => resetSelectionForAvailabilityChange({ adults: Math.max(0, Number(event.target.value) || 0) })} /></div>
                    <div><Label>Діти 6+</Label><Input className="mt-1 bg-white" min="0" type="number" value={details.childrenOver6} onChange={event => resetSelectionForAvailabilityChange({ childrenOver6: Math.max(0, Number(event.target.value) || 0) })} /></div>
                    <div><Label>Діти до 6</Label><Input className="mt-1 bg-white" min="0" type="number" value={details.childrenUnder6} onChange={event => resetSelectionForAvailabilityChange({ childrenUnder6: Math.max(0, Number(event.target.value) || 0) })} /></div>
                  </div>
                </div>
                <div><Label>Внутрішня примітка</Label><Textarea className="mt-1" rows={3} placeholder="Побажання групи, час прибуття, харчування…" value={details.notes} onChange={event => resetSelectionForAvailabilityChange({ notes: event.target.value })} /></div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                  <div><h3 className="font-semibold text-slate-900">Оберіть юніти</h3><p className="text-sm text-slate-500 mt-1">Показані лише доступні на {nights} {nights === 1 ? "ніч" : "ночі"} юніти.</p></div>
                  <div className="text-sm font-medium text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">{selectedUnits.length} юнітів · місткість {selectedCapacity}</div>
                </div>
                <div className="grid md:grid-cols-[1fr_auto_auto_auto] gap-2">
                  <div className="relative"><Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" /><Input className="pl-9" placeholder="Пошук будинку чи номера" value={search} onChange={event => setSearch(event.target.value)} /></div>
                  <select value={propertyFilter} onChange={event => setPropertyFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"><option value="all">Усі об'єкти</option>{properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                  <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"><option value="all">Усі типи</option><option value="house">Будинки</option><option value="hotel">Готель</option></select>
                  <Button type="button" variant="outline" onClick={selectVisible}>Вибрати видимі</Button>
                </div>
                {loadingUnits ? <div className="h-40 grid place-items-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div> : visibleUnits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">На ці дати немає доступних юнітів за обраними фільтрами.</div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="hidden md:grid grid-cols-[36px_1fr_1fr_96px_120px] gap-3 px-4 py-2 bg-slate-50 text-xs text-slate-500 font-medium"><span /><span>Юніт</span><span>Об'єкт</span><span>Місткість</span><span>Стандартна ціна</span></div>
                    {visibleUnits.map(unit => {
                      const selected = Boolean(allocations[unit.id]);
                      const UnitIcon = unit.propertyType === "hotel" ? BedDouble : Home;
                      return (
                        <button type="button" key={unit.id} onClick={() => toggleUnit(unit)}
                          className={`w-full text-left grid md:grid-cols-[36px_1fr_1fr_96px_120px] gap-2 md:gap-3 items-center px-4 py-3 border-t border-slate-100 transition ${selected ? "bg-violet-50" : "hover:bg-slate-50"}`}>
                          <span className={`w-5 h-5 rounded border flex items-center justify-center ${selected ? "bg-violet-600 border-violet-600 text-white" : "border-slate-300 bg-white"}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>
                          <span className="font-medium text-sm text-slate-900 flex items-center gap-2"><UnitIcon className="h-4 w-4 text-slate-400" />{unit.name}<span className="md:hidden text-xs text-slate-500">· {unit.propertyName}</span></span>
                          <span className="hidden md:block text-sm text-slate-600">{unit.propertyName}<span className="text-slate-400"> · {unit.category}</span></span>
                          <span className="text-sm text-slate-700"><Users className="inline h-3.5 w-3.5 mr-1 text-slate-400" />{unit.capacity}</span>
                          <span className="font-mono text-sm text-slate-700">{currency(unit.basePrice * nights)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div><h3 className="font-semibold text-slate-900">Розподіліть гостей і суму</h3><p className="text-sm text-slate-500 mt-1">Не можна перевищити місткість юніта.</p></div>
                  <Button type="button" variant="outline" onClick={autoAllocate}><Users className="h-4 w-4 mr-1.5" /> Розподілити автоматично</Button>
                </div>
                <div className={`rounded-xl border p-3 flex flex-wrap gap-x-5 gap-y-1 text-sm ${allocationComplete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <span className="font-semibold">{allocationComplete ? "Розподіл завершено" : "Потрібен розподіл"}</span>
                  <span>Усього: {totalGuests}</span><span>Розподілено: {allocatedGuests}</span><span>Місткість: {selectedCapacity}</span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="hidden lg:grid grid-cols-[1fr_88px_92px_92px_92px_130px] gap-3 px-4 py-2 bg-slate-50 text-xs text-slate-500 font-medium"><span>Юніт</span><span>Місткість</span><span>Дорослі</span><span>Діти 6+</span><span>До 6</span><span>Сума, ₴</span></div>
                  {selectedUnits.map(unit => {
                    const allocation = allocations[unit.id];
                    const allocated = allocation.adults + allocation.childrenOver6 + allocation.childrenUnder6;
                    const overflow = allocated > unit.capacity;
                    return (
                      <div key={unit.id} className={`grid lg:grid-cols-[1fr_88px_92px_92px_92px_130px] gap-2 lg:gap-3 items-end lg:items-center px-4 py-3 border-t border-slate-100 ${overflow ? "bg-red-50" : ""}`}>
                        <div><div className="font-medium text-sm text-slate-900">{unit.name}</div><div className="text-xs text-slate-500">{unit.propertyName}</div></div>
                        <div className={`text-sm ${overflow ? "text-red-700 font-semibold" : "text-slate-600"}`}>{allocated}/{unit.capacity}</div>
                        <div><Label className="lg:hidden">Дорослі</Label><Input min="0" type="number" value={allocation.adults} onChange={event => updateAllocation(unit.id, "adults", Number(event.target.value))} /></div>
                        <div><Label className="lg:hidden">Діти 6+</Label><Input min="0" type="number" value={allocation.childrenOver6} onChange={event => updateAllocation(unit.id, "childrenOver6", Number(event.target.value))} /></div>
                        <div><Label className="lg:hidden">До 6</Label><Input min="0" type="number" value={allocation.childrenUnder6} onChange={event => updateAllocation(unit.id, "childrenUnder6", Number(event.target.value))} /></div>
                        <div><Label className="lg:hidden">Сума, ₴</Label><Input min="0" step="50" type="number" value={allocation.totalAmount} onChange={event => updateAllocation(unit.id, "totalAmount", Number(event.target.value))} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="max-w-4xl mx-auto space-y-5">
                <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4"><CircleCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" /><div><h3 className="font-semibold text-emerald-900">Готово до підтвердження</h3><p className="text-sm text-emerald-800 mt-1">Усі {totalGuests} гостей розподілені по {selectedUnits.length} юнітах.</p></div></div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 p-4"><span className="text-xs text-slate-500">Група</span><p className="font-semibold mt-1">{details.groupName}</p><p className="text-sm text-slate-500 mt-1">{details.contactName}</p></div>
                  <div className="rounded-xl border border-slate-200 p-4"><span className="text-xs text-slate-500">Період</span><p className="font-semibold mt-1">{details.checkIn} — {details.checkOut}</p><p className="text-sm text-slate-500 mt-1">{nights} ночей</p></div>
                  <div className="rounded-xl border border-slate-200 p-4"><span className="text-xs text-slate-500">Разом</span><p className="font-mono font-semibold mt-1">{currency(totalAmount)}</p><p className="text-sm text-slate-500 mt-1">{selectedUnits.length} юнітів · {totalGuests} гостей</p></div>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  {selectedUnits.map(unit => {
                    const allocation = allocations[unit.id];
                    return <div key={unit.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 border-t first:border-t-0 border-slate-100 text-sm"><div><p className="font-medium">{unit.name}</p><p className="text-xs text-slate-500">{unit.propertyName} · {allocation.adults + allocation.childrenOver6 + allocation.childrenUnder6} гостей</p></div><span className="text-slate-600">{allocation.adults} дор. · {allocation.childrenOver6 + allocation.childrenUnder6} діт.</span><span className="font-mono font-medium">{currency(allocation.totalAmount)}</span></div>;
                  })}
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-500"><AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500" /> Під час збереження сервер повторно перевірить доступність кожного юніта. Якщо хоча б один вже зайнятий, жодне бронювання не буде створене.</div>
              </div>
            )}
          </section>
        </div>

        <footer className="shrink-0 border-t border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between bg-white">
          <Button type="button" variant="outline" onClick={() => step === 0 ? onClose() : setStep((step - 1) as WizardStep)} disabled={saving}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {step === 0 ? "Скасувати" : "Назад"}
          </Button>
          {step < 3 ? <Button type="button" className="bg-violet-600 hover:bg-violet-700" onClick={next} disabled={loadingUnits}>{loadingUnits ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Далі <ChevronRight className="h-4 w-4 ml-1" /></>}</Button> : <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Зберігаю</> : <><Check className="h-4 w-4 mr-1" /> Підтвердити бронювання</>}</Button>}
        </footer>
      </DialogContent>
    </Dialog>
  );
}