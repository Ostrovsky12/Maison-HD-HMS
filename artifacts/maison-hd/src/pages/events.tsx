import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  PartyPopper, Calendar, Users, Building2, Plus, ChevronRight,
  Star, Briefcase, Cake, Monitor, Sparkles, Music2, UtensilsCrossed,
  Camera, Truck, BedDouble, DollarSign, CheckCircle2, Circle,
  ArrowLeft, Edit, Tag, Phone, RefreshCw,
  X, Check, Loader2, AlarmClock, BedSingle, UserCheck,
  Wine, Percent, TrendingUp,
  ListChecks, Route, Hotel, Users2, FileText,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/events";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ─── Constants ────────────────────────────────────────────────────────────────
const EVT_TYPE: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  wedding:     { label: "Весілля",       icon: Star,        color: "text-pink-700",   bg: "bg-pink-100" },
  corporate:   { label: "Корпоратив",    icon: Briefcase,   color: "text-blue-700",   bg: "bg-blue-100" },
  birthday:    { label: "Д. народження", icon: Cake,        color: "text-amber-700",  bg: "bg-amber-100" },
  conference:  { label: "Конференція",   icon: Monitor,     color: "text-indigo-700", bg: "bg-indigo-100" },
  seminar:     { label: "Семінар",       icon: Monitor,     color: "text-cyan-700",   bg: "bg-cyan-100" },
  gala:        { label: "Гала-вечір",    icon: Sparkles,    color: "text-purple-700", bg: "bg-purple-100" },
  private:     { label: "Приватний",     icon: PartyPopper, color: "text-gray-700",   bg: "bg-gray-100" },
  other:       { label: "Інший",         icon: PartyPopper, color: "text-gray-600",   bg: "bg-gray-100" },
};

const EVT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  inquiry:      { label: "Запит",            color: "text-gray-600",   bg: "bg-gray-100" },
  offer_sent:   { label: "КП надіслано",     color: "text-amber-700",  bg: "bg-amber-100" },
  confirmed:    { label: "Підтверджено",     color: "text-blue-700",   bg: "bg-blue-100" },
  deposit_paid: { label: "Депозит оплачено", color: "text-emerald-700",bg: "bg-emerald-100" },
  completed:    { label: "Проведено",        color: "text-green-700",  bg: "bg-green-100" },
  cancelled:    { label: "Скасовано",        color: "text-red-600",    bg: "bg-red-100" },
};

const SVC_CAT: Record<string, { label: string; icon: any }> = {
  catering:      { label: "Кейтеринг",  icon: UtensilsCrossed },
  decoration:    { label: "Декор",       icon: Sparkles },
  music:         { label: "Музика",      icon: Music2 },
  equipment:     { label: "Обладнання",  icon: Monitor },
  photo_video:   { label: "Фото/Відео", icon: Camera },
  transport:     { label: "Транспорт",   icon: Truck },
  accommodation: { label: "Проживання",  icon: BedDouble },
  other:         { label: "Інше",        icon: Tag },
};

const TIMING_CAT: Record<string, { label: string; color: string }> = {
  setup:         { label: "Підготовка",  color: "bg-gray-400" },
  guests:        { label: "Гості",       color: "bg-blue-400" },
  ceremony:      { label: "Церемонія",   color: "bg-pink-500" },
  photo:         { label: "Фото",        color: "bg-purple-400" },
  catering:      { label: "Кейтеринг",  color: "bg-orange-400" },
  banquet:       { label: "Банкет",      color: "bg-amber-500" },
  entertainment: { label: "Розваги",     color: "bg-indigo-400" },
  main:          { label: "Основна",     color: "bg-blue-500" },
  special:       { label: "Спеціальне",  color: "bg-rose-500" },
  cleanup:       { label: "Прибирання",  color: "bg-gray-300" },
  general:       { label: "Загальне",    color: "bg-slate-400" },
};

const ALLOC_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "Очікує",       color: "text-amber-700", bg: "bg-amber-100" },
  confirmed:  { label: "Підтверджено", color: "text-blue-700",  bg: "bg-blue-100" },
  checked_in: { label: "Заселено",     color: "text-green-700", bg: "bg-green-100" },
  cancelled:  { label: "Скасовано",    color: "text-red-600",   bg: "bg-red-100" },
};

const num = (v: any) => Number(v) || 0;
const fmt = (v: any, d = 0) => num(v).toLocaleString("uk-UA", { minimumFractionDigits: d, maximumFractionDigits: d });

const MAIN_TABS = [
  { id: "upcoming",  label: "Майбутні",   icon: Calendar },
  { id: "all",       label: "Всі заходи", icon: PartyPopper },
  { id: "calendar",  label: "Календар",   icon: AlarmClock },
  { id: "spaces",    label: "Зали",       icon: Building2 },
] as const;
type MainTab = "upcoming" | "all" | "calendar" | "spaces";

const DETAIL_TABS = [
  { id: "finance",    label: "Фінанси",    icon: DollarSign },
  { id: "services",   label: "Послуги",    icon: UtensilsCrossed },
  { id: "menu",       label: "Меню",       icon: UtensilsCrossed },
  { id: "tasks",      label: "Завдання",   icon: ListChecks },
  { id: "timing",     label: "Таймінг",    icon: Route },
  { id: "checkins",   label: "Розміщення", icon: Hotel },
  { id: "settlement", label: "Розрахунок", icon: DollarSign },
] as const;
type DetailTab = "finance" | "services" | "menu" | "tasks" | "timing" | "checkins" | "settlement";

// ══════════════════════════════════════════════════════════════════════════════
export default function EventsPage() {
  const [mainTab, setMainTab] = useState<MainTab>("upcoming");
  const [detailTab, setDetailTab] = useState<DetailTab>("finance");
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [timings, setTimings] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [allocSummary, setAllocSummary] = useState<any>({});
  const [availUnits, setAvailUnits] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showAddTiming, setShowAddTiming] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddAlloc, setShowAddAlloc] = useState(false);
  const [showFeesEditor, setShowFeesEditor] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 }; });
  const [calEvents, setCalEvents] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  // Settlement state
  const [settlement, setSettlement] = useState<any>(null);
  const [settleModal, setSettleModal] = useState(false);
  const [settleForm, setSettleForm] = useState({ payment_method: 'cash', notes: '' });

  // Banquet menu state
  const [menuOptions, setMenuOptions] = useState<any[]>([]);
  const [restaurantMenuItems, setRestaurantMenuItems] = useState<any[]>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [nMenu, setNMenu] = useState({ name: '', description: '', price: '', quantity: '', unit: 'особа', notes: '' });

  // Lead form state
  const [nLead, setNLead] = useState({ name: '', clientName: '', clientPhone: '', clientEmail: '', eventType: 'wedding', eventDate: '', guestCount: '50', notes: '' });

  const [nEv, setNEv] = useState({ name: "", eventType: "wedding", clientName: "", clientPhone: "", clientEmail: "", eventDate: "", startTime: "14:00", endTime: "23:00", guestCount: "50", spaceId: "", venuePrice: "", notes: "" });
  const [nTim, setNTim] = useState({ timeStart: "", timeEnd: "", title: "", category: "general", assignedTo: "", description: "" });
  const [nGrp, setNGrp] = useState({ groupName: "", arrivalDate: "", arrivalTime: "14:00", departureDate: "", departureTime: "12:00", totalGuests: "2", notes: "" });
  const [nAlc, setNAlc] = useState({ guestName: "", guestPhone: "", guestsCount: "1", relationToEvent: "", unitId: "", checkInDate: "", checkOutDate: "", notes: "" });
  const [fees, setFees] = useState({ banquetMinimum: "0", serviceFeeP: "0", corkFeePerBottle: "0", corkFeeBottles: "0" });

  // ── Load list ──────────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [sR, eR, spR] = await Promise.all([
        apiFetch("/stats"), apiFetch(`/?status=${statusFilter}&type=${typeFilter}`), apiFetch("/spaces"),
      ]);
      const [sD, eD, spD] = await Promise.all([sR.json(), eR.json(), spR.json()]);
      setStats(sD); setEvents(eD.events || []); setSpaces(spD.spaces || []);
    } finally { setLoading(false); }
  }, [statusFilter, typeFilter]);

  useEffect(() => { loadList(); setSelected(null); }, [mainTab, statusFilter, typeFilter]);

  // ── Load detail ────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const [detR, timR, grpR, alcR, unitR] = await Promise.all([
        apiFetch(`/${id}`), apiFetch(`/${id}/timings`), apiFetch(`/${id}/group-checkins`),
        apiFetch(`/${id}/allocations`), apiFetch(`/${id}/available-units`),
      ]);
      const [det, timD, grpD, alcD, unitD] = await Promise.all([detR.json(), timR.json(), grpR.json(), alcR.json(), unitR.json()]);
      setSelected(det.event); setServices(det.services || []); setTasks(det.tasks || []);
      setTimings(timD.timings || []); setGroups(grpD.groups || []);
      setAllocations(alcD.allocations || []); setAllocSummary(alcD.summary || {});
      setAvailUnits(unitD.units || []);
      setFees({
        banquetMinimum: String(det.event?.banquet_minimum || "0"),
        serviceFeeP: String(det.event?.service_fee_pct || "0"),
        corkFeePerBottle: String(det.event?.cork_fee_per_bottle || "0"),
        corkFeeBottles: String(det.event?.cork_fee_bottles || "0"),
      });
    } finally { setDetailLoading(false); }
  }, []);

  const selectEvent = (ev: any) => { setDetailTab("finance"); loadDetail(ev.id); };
  const back = () => { setSelected(null); loadList(); };

  // ── Calendar loader ────────────────────────────────────────────────────────
  const loadCalendar = useCallback(async (year: number, month: number) => {
    setCalLoading(true);
    try {
      const r = await apiFetch(`/calendar/${year}/${month}`);
      const d = await r.json();
      setCalEvents(d.events || []);
    } catch {} finally { setCalLoading(false); }
  }, []);

  useEffect(() => {
    if (mainTab === "calendar") loadCalendar(calMonth.year, calMonth.month);
  }, [mainTab, calMonth]);

  // ── Settlement loader ──────────────────────────────────────────────────────
  const loadSettlement = useCallback(async (id: number) => {
    try {
      const r = await apiFetch(`/${id}/settlement`);
      const d = await r.json();
      setSettlement(d.settlement || null);
    } catch {}
  }, []);

  useEffect(() => {
    if (selected && detailTab === "settlement") loadSettlement(selected.id);
  }, [detailTab, selected]);

  const doSettle = async () => {
    if (!selected) return;
    await apiFetch(`/${selected.id}/settle`, { method: 'POST', body: JSON.stringify(settleForm) });
    setSettleModal(false);
    await loadDetail(selected.id);
    loadSettlement(selected.id);
    toast({ title: "Захід розрахований!" });
  };

  // ── Banquet menu loader ────────────────────────────────────────────────────
  const loadMenuOptions = useCallback(async (id: number) => {
    try {
      const r = await apiFetch(`/${id}/menu-options`);
      const d = await r.json();
      setMenuOptions(d.options || []);
      setRestaurantMenuItems(d.menuItems || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (selected && detailTab === "menu") loadMenuOptions(selected.id);
  }, [detailTab, selected]);

  const addMenuOption = async () => {
    if (!selected || !nMenu.name) return;
    await apiFetch(`/${selected.id}/menu-options`, {
      method: 'POST',
      body: JSON.stringify({ name: nMenu.name, description: nMenu.description, price: parseFloat(nMenu.price) || 0, quantity: parseInt(nMenu.quantity) || selected.guestCount, unit: nMenu.unit, notes: nMenu.notes })
    });
    setShowAddMenu(false);
    setNMenu({ name: '', description: '', price: '', quantity: '', unit: 'особа', notes: '' });
    loadMenuOptions(selected.id);
    toast({ title: "Позицію меню додано!" });
  };

  // ── Lead inquiry ──────────────────────────────────────────────────────────
  const submitLead = async () => {
    if (!nLead.clientName || !nLead.eventDate) { toast({ title: "Заповніть обов'язкові поля", variant: "destructive" }); return; }
    const r = await apiFetch("/lead", { method: 'POST', body: JSON.stringify({ ...nLead, guestCount: parseInt(nLead.guestCount) || 50 }) });
    if (r.ok) {
      setShowLeadForm(false);
      setNLead({ name: '', clientName: '', clientPhone: '', clientEmail: '', eventType: 'wedding', eventDate: '', guestCount: '50', notes: '' });
      loadList();
      toast({ title: "Запит надіслано!" });
    }
  };

  const createEvent = async () => {
    if (!nEv.name || !nEv.clientName || !nEv.eventDate) { toast({ title: "Заповніть обов'язкові поля", variant: "destructive" }); return; }
    const r = await apiFetch("/", { method: "POST", body: JSON.stringify({
      eventType: nEv.eventType, name: nEv.name, clientName: nEv.clientName,
      clientPhone: nEv.clientPhone, clientEmail: nEv.clientEmail,
      eventDate: nEv.eventDate, startTime: nEv.startTime, endTime: nEv.endTime,
      guestCount: parseInt(nEv.guestCount) || 50,
      eventSpaceId: nEv.spaceId ? parseInt(nEv.spaceId) : undefined,
      venuePrice: nEv.venuePrice ? parseFloat(nEv.venuePrice) : 0,
      notes: nEv.notes, status: "inquiry",
    }) });
    if (r.ok) { setShowNewEvent(false); loadList(); toast({ title: "Захід створено!" }); }
  };

  const updateStatus = async (ns: string) => {
    if (!selected) return;
    await apiFetch(`/${selected.id}`, { method: "PATCH", body: JSON.stringify({ status: ns }) });
    setSelected((s: any) => ({ ...s, status: ns }));
    toast({ title: `Статус → ${EVT_STATUS[ns]?.label}` });
  };

  const toggleTask = async (id: number, cur: string) => {
    const next = cur === "done" ? "pending" : "done";
    await apiFetch(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status: next } : t));
  };

  const toggleService = async (id: number, cur: boolean) => {
    await apiFetch(`/services/${id}`, { method: "PATCH", body: JSON.stringify({ isConfirmed: !cur }) });
    setServices(s => s.map(sv => sv.id === id ? { ...sv, isConfirmed: !cur } : sv));
  };

  const addTiming = async () => {
    if (!nTim.timeStart || !nTim.title) { toast({ title: "Вкажіть час та назву", variant: "destructive" }); return; }
    const r = await apiFetch(`/${selected.id}/timings`, { method: "POST", body: JSON.stringify({
      timeStart: nTim.timeStart, timeEnd: nTim.timeEnd || undefined, title: nTim.title,
      description: nTim.description || undefined, category: nTim.category,
      assignedTo: nTim.assignedTo || undefined, sortOrder: timings.length + 1,
    }) });
    const data = await r.json();
    setTimings(t => [...t, data.timing]);
    setShowAddTiming(false);
    setNTim({ timeStart: "", timeEnd: "", title: "", category: "general", assignedTo: "", description: "" });
    toast({ title: "Пункт додано!" });
  };

  const toggleTiming = async (id: number, cur: boolean) => {
    await apiFetch(`/timings/${id}`, { method: "PATCH", body: JSON.stringify({ isConfirmed: !cur }) });
    setTimings(t => t.map(x => x.id === id ? { ...x, is_confirmed: !cur } : x));
  };

  const deleteTiming = async (id: number) => {
    await apiFetch(`/timings/${id}`, { method: "DELETE" });
    setTimings(t => t.filter(x => x.id !== id));
  };

  const addGroup = async () => {
    if (!nGrp.groupName || !nGrp.arrivalDate) { toast({ title: "Вкажіть назву та дату", variant: "destructive" }); return; }
    const r = await apiFetch(`/${selected.id}/group-checkins`, { method: "POST", body: JSON.stringify({
      groupName: nGrp.groupName, arrivalDate: nGrp.arrivalDate, arrivalTime: nGrp.arrivalTime,
      departureDate: nGrp.departureDate || undefined, departureTime: nGrp.departureTime,
      totalGuests: parseInt(nGrp.totalGuests) || 2, notes: nGrp.notes || undefined,
    }) });
    const data = await r.json();
    setGroups(g => [...g, { ...data.group, allocated_count: 0, checked_in_count: 0 }]);
    setShowAddGroup(false);
    setNGrp({ groupName: "", arrivalDate: "", arrivalTime: "14:00", departureDate: "", departureTime: "12:00", totalGuests: "2", notes: "" });
    toast({ title: "Групу заїзду додано!" });
  };

  const checkInGroup = async (id: number) => {
    await apiFetch(`/group-checkins/${id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });
    setGroups(g => g.map(x => x.id === id ? { ...x, status: "confirmed" } : x));
    toast({ title: "Підтверджено!" });
  };

  const addAlloc = async () => {
    if (!nAlc.guestName) { toast({ title: "Вкажіть гостя", variant: "destructive" }); return; }
    const r = await apiFetch(`/${selected.id}/allocations`, { method: "POST", body: JSON.stringify({
      guestName: nAlc.guestName, guestPhone: nAlc.guestPhone || undefined,
      guestsCount: parseInt(nAlc.guestsCount) || 1,
      relationToEvent: nAlc.relationToEvent || undefined,
      unitId: nAlc.unitId || undefined,
      checkInDate: nAlc.checkInDate || undefined, checkOutDate: nAlc.checkOutDate || undefined,
      notes: nAlc.notes || undefined,
    }) });
    const data = await r.json();
    if (data.allocation) {
      const unit = availUnits.find((u: any) => u.id === parseInt(nAlc.unitId));
      setAllocations(a => [...a, { ...data.allocation, unit_name: unit?.name, unit_number: unit?.unit_number }]);
      setShowAddAlloc(false);
      setNAlc({ guestName: "", guestPhone: "", guestsCount: "1", relationToEvent: "", unitId: "", checkInDate: "", checkOutDate: "", notes: "" });
      toast({ title: "Гостя поселено!" });
    }
  };

  const checkInGuest = async (id: number) => {
    await apiFetch(`/allocations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "checked_in" }) });
    setAllocations(a => a.map(x => x.id === id ? { ...x, status: "checked_in" } : x));
    toast({ title: "Гостя заселено!" });
  };

  const saveFees = async () => {
    const r = await apiFetch(`/${selected.id}/fees`, { method: "PATCH", body: JSON.stringify({
      banquetMinimum: num(fees.banquetMinimum),
      serviceFeeP: num(fees.serviceFeeP),
      corkFeePerBottle: num(fees.corkFeePerBottle),
      corkFeeBottles: parseInt(fees.corkFeeBottles) || 0,
    }) });
    const data = await r.json();
    setSelected((s: any) => ({ ...s, banquet_minimum: fees.banquetMinimum, service_fee_pct: fees.serviceFeeP, service_fee_amount: data.svcAmt, cork_fee_per_bottle: fees.corkFeePerBottle, cork_fee_bottles: fees.corkFeeBottles, cork_fee_total: data.corkTotal, grand_total: data.grandTotal, balance_due: data.balanceDue }));
    setShowFeesEditor(false);
    toast({ title: "Збори оновлено!" });
  };

  const displayList = mainTab === "upcoming"
    ? events.filter(e => e.eventDate >= new Date().toISOString().slice(0, 10) && !["cancelled","completed"].includes(e.status))
    : events;

  // ── Fees preview calc ──────────────────────────────────────────────────────
  const feePreviewSvc = num(selected?.total_price) * num(fees.serviceFeeP) / 100;
  const feePreviewCork = num(fees.corkFeePerBottle) * (parseInt(fees.corkFeeBottles) || 0);
  const feePreviewTotal = num(selected?.total_price) + feePreviewSvc + feePreviewCork;

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">

        {/* ════════════════ EVENT DETAIL VIEW ════════════════ */}
        {selected && (
          <div className="min-h-full">
            <div className="bg-white dark:bg-gray-800 border-b sticky top-0 z-20">
              {/* Top bar */}
              <div className="px-6 py-3 flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={back} className="gap-1 text-gray-500 shrink-0">
                  <ArrowLeft className="w-4 h-4" />Назад
                </Button>
                <div className="h-5 w-px bg-gray-200 dark:bg-gray-600" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {(() => { const m = EVT_TYPE[selected.eventType] || EVT_TYPE.other; return <m.icon className={`w-5 h-5 ${m.color} shrink-0`} />; })()}
                  <span className="font-semibold text-gray-900 dark:text-white truncate">{selected.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${EVT_STATUS[selected.status]?.bg} ${EVT_STATUS[selected.status]?.color}`}>{EVT_STATUS[selected.status]?.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={selected.status} onChange={e => updateStatus(e.target.value)} className="h-8 px-2 border rounded-md text-xs bg-white dark:bg-gray-800 dark:text-white">
                    {Object.entries(EVT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => loadDetail(selected.id)} disabled={detailLoading}>
                    <RefreshCw className={`w-4 h-4 ${detailLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              {/* Meta */}
              <div className="px-6 py-2 flex items-center gap-3 text-xs text-gray-500 border-t bg-gray-50 dark:bg-gray-700/50 flex-wrap">
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{selected.eventDate && format(new Date(selected.eventDate + "T12:00:00"), "d MMMM yyyy", { locale: uk })}</span>
                <span>{selected.startTime}–{selected.endTime}</span>
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{selected.guestCount} гостей</span>
                {selected.spaceName && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{selected.spaceName}</span>}
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selected.clientName}{selected.clientPhone ? ` · ${selected.clientPhone}` : ""}</span>
              </div>
              {/* Detail tabs */}
              <div className="px-6 flex">
                {DETAIL_TABS.map(t => (
                  <button key={t.id} onClick={() => setDetailTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    <t.icon className="w-4 h-4" />{t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {/* ── ФІНАНСИ ──────────────────────────────────── */}
              {detailTab === "finance" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {([
                      { label: "Базова вартість", val: selected.total_price, icon: DollarSign, color: "text-gray-700" },
                      { label: "Сервісний збір", val: selected.service_fee_amount, sub: `${fmt(selected.service_fee_pct)}%`, icon: Percent, color: "text-blue-600" },
                      { label: "Cork fee", val: selected.cork_fee_total, sub: `${selected.cork_fee_bottles || 0} пл. × ${fmt(selected.cork_fee_per_bottle)} ₴`, icon: Wine, color: "text-purple-600" },
                      { label: "РАЗОМ", val: selected.grand_total || selected.total_price, icon: TrendingUp, color: "text-green-600", hi: true },
                    ] as any[]).map((k: any) => (
                      <div key={k.label} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${k.hi ? "border-green-300" : ""}`}>
                        <div className="flex items-center gap-2 mb-1"><k.icon className={`w-4 h-4 ${k.color}`} /><span className="text-xs text-gray-500">{k.label}</span></div>
                        <p className={`text-xl font-bold ${k.color}`}>{fmt(k.val)} ₴</p>
                        {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Розрахунки</h3>
                      <Button size="sm" variant="outline" onClick={() => setShowFeesEditor(true)} className="gap-1"><Edit className="w-3.5 h-3.5" />Збори</Button>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4 mb-4">
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">Депозит</p>
                        <p className="text-xl font-bold">{fmt(selected.depositAmount)} ₴</p>
                        <p className={`text-xs mt-1 ${selected.depositPaid ? "text-green-600" : "text-red-500"}`}>{selected.depositPaid ? "✓ Оплачено" : "✗ Не оплачено"}</p>
                      </div>
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100">
                        <p className="text-xs text-gray-500 mb-1">Залишок</p>
                        <p className="text-xl font-bold text-amber-600">{fmt(selected.balance_due != null ? selected.balance_due : num(selected.grand_total || selected.total_price) - num(selected.depositAmount))} ₴</p>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">Банкетний мінімум</p>
                        <p className="text-xl font-bold">{fmt(selected.banquet_minimum)} ₴</p>
                        {num(selected.banquet_minimum) > 0 && (
                          <p className={`text-xs mt-1 ${num(selected.total_price) >= num(selected.banquet_minimum) ? "text-green-600" : "text-red-500"}`}>
                            {num(selected.total_price) >= num(selected.banquet_minimum) ? "✓ Виконано" : "✗ Нижче мінімуму"}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Деталізація рахунку</p>
                      {[
                        { label: "Оренда залу", val: selected.venuePrice },
                        { label: "Послуги (кейтеринг, декор...)", val: selected.servicesPrice },
                        { label: `Сервісний збір (${fmt(selected.service_fee_pct)}%)`, val: selected.service_fee_amount },
                        { label: `Cork fee (${selected.cork_fee_bottles || 0} пл. × ${fmt(selected.cork_fee_per_bottle)} ₴)`, val: selected.cork_fee_total },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between text-sm mb-2">
                          <span className="text-gray-500">{row.label}</span>
                          <span className="font-medium">{fmt(row.val)} ₴</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm font-bold border-t pt-2">
                        <span>Разом</span>
                        <span className="text-green-600">{fmt(selected.grand_total || selected.total_price)} ₴</span>
                      </div>
                    </div>
                  </div>

                  {selected.notes && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-medium text-amber-800 mb-1">Нотатки</p>
                      <p className="text-sm text-amber-700">{selected.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── ПОСЛУГИ ──────────────────────────────────── */}
              {detailTab === "services" && (
                <div className="space-y-4">
                  {Object.entries(SVC_CAT).map(([cat, meta]) => {
                    const catSvc = services.filter(s => s.category === cat);
                    if (!catSvc.length) return null;
                    return (
                      <div key={cat} className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50 dark:bg-gray-700/50">
                          <meta.icon className="w-4 h-4 text-purple-600" />
                          <span className="font-medium text-sm">{meta.label}</span>
                          <span className="text-xs text-gray-400 ml-auto">{catSvc.length} поз. · {fmt(catSvc.reduce((a, s) => a + num(s.totalPrice), 0))} ₴</span>
                        </div>
                        {catSvc.map(s => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                            <button onClick={() => toggleService(s.id, s.isConfirmed)}>
                              {s.isConfirmed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-gray-300" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{s.name}</p>
                              {s.vendorName && <p className="text-xs text-gray-400">{s.vendorName}{s.vendorPhone ? ` · ${s.vendorPhone}` : ""}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-semibold text-sm">{fmt(s.totalPrice)} ₴</p>
                              {s.quantity > 1 && <p className="text-xs text-gray-400">{s.quantity} × {fmt(s.unitPrice)} ₴</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border p-4 flex justify-between items-center">
                    <span className="font-semibold">Разом послуги</span>
                    <span className="text-xl font-bold text-purple-600">{fmt(services.reduce((a, s) => a + num(s.totalPrice), 0))} ₴</span>
                  </div>
                </div>
              )}

              {/* ── ЗАВДАННЯ ─────────────────────────────────── */}
              {detailTab === "tasks" && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2"><ListChecks className="w-4 h-4 text-purple-600" />Завдання</h3>
                    <span className="text-sm text-gray-400">{tasks.filter(t => t.status === "done").length}/{tasks.length} виконано</span>
                  </div>
                  {tasks.map(task => (
                    <div key={task.id} className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 ${task.status === "done" ? "opacity-60" : ""}`}>
                      <button onClick={() => toggleTask(task.id, task.status)} className="mt-0.5">
                        {task.status === "done" ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-gray-300 hover:text-purple-400 transition-colors" />}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-gray-400" : "text-gray-900 dark:text-white"}`}>{task.title}</p>
                        {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {task.assignedTo && <span>👤 {task.assignedTo}</span>}
                          {task.dueDate && <span>📅 {format(new Date(task.dueDate + "T12:00:00"), "d MMM", { locale: uk })}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!tasks.length && <div className="px-4 py-10 text-center text-gray-400 text-sm">Завдань немає</div>}
                </div>
              )}

              {/* ── ТАЙМІНГ ──────────────────────────────────── */}
              {detailTab === "timing" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Route className="w-4 h-4 text-purple-600" />Run-of-show / Таймінг</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{timings.filter(t => t.is_confirmed).length}/{timings.length} підтверджено</p>
                    </div>
                    <Button size="sm" onClick={() => setShowAddTiming(true)} className="gap-1 bg-purple-600 hover:bg-purple-700">
                      <Plus className="w-4 h-4" />Додати пункт
                    </Button>
                  </div>

                  {timings.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border">
                      <Route className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                      <p className="text-gray-400 text-sm mb-3">Таймінг ще не складено</p>
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowAddTiming(true)}><Plus className="w-4 h-4 mr-1" />Почати таймінг</Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-[68px] top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                      <div className="space-y-2">
                        {timings.map(t => {
                          const cm = TIMING_CAT[t.category] || TIMING_CAT.general;
                          return (
                            <div key={t.id} className="flex items-start gap-3">
                              <div className="w-16 shrink-0 text-right pt-1.5">
                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{t.time_start}</span>
                                {t.time_end && <span className="text-xs text-gray-400 block">–{t.time_end}</span>}
                              </div>
                              <div className={`w-3 h-3 rounded-full mt-2.5 shrink-0 z-10 ${t.is_confirmed ? "bg-green-500" : cm.color}`} />
                              <div className={`flex-1 bg-white dark:bg-gray-800 rounded-xl border p-3 mb-2 ${t.is_confirmed ? "border-green-200" : ""}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                      <span className="font-medium text-sm text-gray-900 dark:text-white">{t.title}</span>
                                      <span className={`text-xs px-1.5 py-0.5 rounded text-white ${cm.color}`}>{cm.label}</span>
                                    </div>
                                    {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                                    {t.assigned_to && <p className="text-xs text-gray-400 mt-1">👤 {t.assigned_to}</p>}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => toggleTiming(t.id, t.is_confirmed)} title={t.is_confirmed ? "Зняти" : "Підтвердити"}>
                                      {t.is_confirmed ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-gray-300 hover:text-green-400" />}
                                    </button>
                                    <button onClick={() => deleteTiming(t.id)} className="text-gray-300 hover:text-red-400"><X className="w-4 h-4" /></button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── РОЗМІЩЕННЯ ───────────────────────────────── */}
              {detailTab === "checkins" && (
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Записів гостей", value: allocSummary?.total || 0, color: "text-gray-700" },
                      { label: "Всього гостей", value: allocSummary?.total_guests || 0, color: "text-blue-600" },
                      { label: "Підтверджено", value: allocSummary?.confirmed || 0, color: "text-green-600" },
                      { label: "Заселено", value: allocSummary?.checked_in || 0, color: "text-purple-600" },
                    ].map(k => (
                      <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border p-4 text-center">
                        <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{k.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Group check-ins */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <h3 className="font-semibold flex items-center gap-2"><Users2 className="w-4 h-4 text-purple-600" />Групові заїзди</h3>
                      <Button size="sm" variant="outline" onClick={() => setShowAddGroup(true)} className="gap-1"><Plus className="w-3.5 h-3.5" />Нова група</Button>
                    </div>
                    {groups.map(g => (
                      <div key={g.id} className="px-4 py-3 border-b last:border-0 flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-sm">{g.group_name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.status === "confirmed" ? "bg-blue-100 text-blue-700" : g.status === "checked_in" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                              {g.status === "confirmed" ? "Підтверджено" : g.status === "checked_in" ? "Заселено" : "Очікує"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                            <span>📅 {g.arrival_date} о {g.arrival_time}</span>
                            {g.departure_date && <span>→ {g.departure_date} о {g.departure_time}</span>}
                            <span><Users className="w-3 h-3 inline mr-0.5" />{g.total_guests} ос. · Поселено: {g.allocated_count || 0}</span>
                          </div>
                          {g.notes && <p className="text-xs text-gray-400 italic mt-0.5">{g.notes}</p>}
                        </div>
                        {g.status === "pending" && (
                          <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => checkInGroup(g.id)}>
                            <Check className="w-3.5 h-3.5 mr-1" />Підтвердити
                          </Button>
                        )}
                      </div>
                    ))}
                    {!groups.length && <div className="px-4 py-8 text-center text-gray-400 text-sm">Групових заїздів немає</div>}
                  </div>

                  {/* Guest allocations */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <h3 className="font-semibold flex items-center gap-2"><Hotel className="w-4 h-4 text-purple-600" />Поселення гостей по об'єктах</h3>
                      <Button size="sm" variant="outline" onClick={() => setShowAddAlloc(true)} className="gap-1"><Plus className="w-3.5 h-3.5" />Поселити</Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/50 border-b text-xs">
                          <tr>{["Гість", "Об'єкт", "Дати", "Ос.", "Роль", "Статус", ""].map(h => <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                          {allocations.map(a => (
                            <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-gray-900 dark:text-white">{a.guest_name}</div>
                                <div className="text-xs text-gray-400">{a.guest_phone}</div>
                              </td>
                              <td className="px-3 py-2.5">
                                {a.unit_name
                                  ? <div className="flex items-center gap-1 text-sm"><BedSingle className="w-3.5 h-3.5 text-purple-500" />{a.unit_name}{a.unit_number ? ` #${a.unit_number}` : ""}</div>
                                  : <span className="text-gray-400 text-xs italic">Не призначено</span>}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{a.check_in_date || "—"}{a.check_out_date ? ` → ${a.check_out_date}` : ""}</td>
                              <td className="px-3 py-2.5 text-center">{a.guests_count}</td>
                              <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[110px] truncate">{a.relation_to_event || "—"}</td>
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ALLOC_STATUS[a.status]?.bg} ${ALLOC_STATUS[a.status]?.color}`}>{ALLOC_STATUS[a.status]?.label}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                {a.status !== "checked_in" && (
                                  <Button size="sm" variant="ghost" className="text-xs text-green-600 h-7 px-2 whitespace-nowrap" onClick={() => checkInGuest(a.id)}>
                                    <UserCheck className="w-3.5 h-3.5 mr-1" />Заселити
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!allocations.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">Гостів ще не поселено</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── БАНКЕТНЕ МЕНЮ ──────────────────────────────── */}
              {detailTab === "menu" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Банкетне меню</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{selected.guestCount} гостей · Позицій: {menuOptions.length}</p>
                    </div>
                    <Button size="sm" className="bg-purple-600 hover:bg-purple-700 gap-1" onClick={() => setShowAddMenu(true)}>
                      <Plus className="w-3.5 h-3.5" />Додати позицію
                    </Button>
                  </div>

                  {menuOptions.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border p-12 text-center">
                      <UtensilsCrossed className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400">Меню ще не сформовано</p>
                      <p className="text-xs text-gray-400 mt-1">Додайте страви, пакети та напої для цього заходу</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {menuOptions.map((opt: any) => (
                        <div key={opt.id} className="bg-white dark:bg-gray-800 rounded-xl border p-4 flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{opt.service_name}</div>
                            {opt.description && <p className="text-sm text-gray-500 mt-0.5">{opt.description}</p>}
                            {opt.notes && <p className="text-xs text-gray-400 italic mt-0.5">{opt.notes}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-semibold text-gray-900">{fmt(opt.price)} ₴ / {opt.unit || 'особа'}</div>
                            <div className="text-xs text-gray-400">× {opt.quantity} = {fmt(Number(opt.price) * Number(opt.quantity))} ₴</div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${opt.is_confirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {opt.is_confirmed ? 'Підтверджено' : 'Пропозиція'}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 flex items-center justify-between">
                        <span className="font-semibold text-purple-800">Разом по меню:</span>
                        <span className="text-xl font-bold text-purple-700">
                          {fmt(menuOptions.reduce((s: number, o: any) => s + Number(o.price) * Number(o.quantity), 0))} ₴
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Restaurant menu quick add */}
                  {restaurantMenuItems.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border p-4">
                      <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><UtensilsCrossed className="w-4 h-4 text-purple-500" />Обрати з меню ресторану</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                        {restaurantMenuItems.slice(0, 18).map((mi: any) => (
                          <button key={mi.id} onClick={() => { setNMenu({ name: mi.name, description: mi.description || '', price: String(mi.price), quantity: String(selected.guestCount), unit: 'особа', notes: '' }); setShowAddMenu(true); }}
                            className="text-left p-2 border border-gray-100 rounded-lg hover:border-purple-200 hover:bg-purple-50 transition-all text-xs">
                            <div className="font-medium text-gray-800 truncate">{mi.name}</div>
                            <div className="text-gray-400 mt-0.5">{fmt(mi.price)} ₴ · {mi.category_name || '—'}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add menu option modal */}
                  {showAddMenu && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-5 border-b flex items-center justify-between">
                          <h3 className="font-semibold flex items-center gap-2"><UtensilsCrossed className="w-4 h-4 text-purple-600" />Позиція меню</h3>
                          <button onClick={() => setShowAddMenu(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                          <div><label className="text-xs text-gray-500 mb-1 block">Назва *</label><Input value={nMenu.name} onChange={e => setNMenu(f => ({ ...f, name: e.target.value }))} placeholder="Банкетне меню «Класик»" /></div>
                          <div><label className="text-xs text-gray-500 mb-1 block">Опис</label><Input value={nMenu.description} onChange={e => setNMenu(f => ({ ...f, description: e.target.value }))} placeholder="3 страви + салат + десерт" /></div>
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="text-xs text-gray-500 mb-1 block">Ціна (₴)</label><Input type="number" value={nMenu.price} onChange={e => setNMenu(f => ({ ...f, price: e.target.value }))} placeholder="0" /></div>
                            <div><label className="text-xs text-gray-500 mb-1 block">Кількість</label><Input type="number" value={nMenu.quantity} onChange={e => setNMenu(f => ({ ...f, quantity: e.target.value }))} placeholder={String(selected.guestCount)} /></div>
                            <div><label className="text-xs text-gray-500 mb-1 block">Одиниця</label>
                              <select value={nMenu.unit} onChange={e => setNMenu(f => ({ ...f, unit: e.target.value }))} className="w-full h-10 px-2 border rounded-md text-sm">
                                <option value="особа">особа</option><option value="страва">страва</option><option value="пляшка">пляшка</option><option value="кг">кг</option><option value="порція">порція</option>
                              </select>
                            </div>
                          </div>
                          <div><label className="text-xs text-gray-500 mb-1 block">Нотатки</label><Input value={nMenu.notes} onChange={e => setNMenu(f => ({ ...f, notes: e.target.value }))} placeholder="Алергени, особливості..." /></div>
                        </div>
                        <div className="p-5 border-t flex gap-3">
                          <Button variant="outline" className="flex-1" onClick={() => setShowAddMenu(false)}>Скасувати</Button>
                          <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={addMenuOption}>Додати</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── РОЗРАХУНОК (SETTLEMENT) ────────────────────── */}
              {detailTab === "settlement" && (
                <div className="space-y-5">
                  {/* Settlement summary */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                    <div className="px-5 py-4 border-b flex items-center justify-between">
                      <h3 className="font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-600" />Фінальний розрахунок</h3>
                      {selected.status !== 'completed' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={() => setSettleModal(true)}>
                          <Check className="w-3.5 h-3.5" />Закрити захід
                        </Button>
                      )}
                    </div>
                    {settlement ? (
                      <div className="p-5 space-y-3">
                        {[
                          { label: "Оренда залу", value: settlement.venue_price },
                          { label: "Послуги (підтверджено)", value: settlement.services_subtotal },
                          { label: `Сервісний збір (${settlement.service_fee_pct}%)`, value: settlement.service_fee_amount },
                          { label: `Cork fee (${settlement.cork_fee_bottles || 0} пл.)`, value: settlement.cork_fee_total },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{row.label}</span>
                            <span className="font-medium text-gray-800">{fmt(row.value)} ₴</span>
                          </div>
                        ))}
                        <div className="border-t pt-3 flex items-center justify-between">
                          <span className="font-semibold text-gray-700">Сума до оплати</span>
                          <span className="text-xl font-bold text-gray-900">{fmt(settlement.grand_total)} ₴</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500">Депозит</div>
                            <div className="font-bold text-lg">{fmt(settlement.deposit_amount)} ₴</div>
                            <div className={`text-xs font-medium ${settlement.deposit_paid ? 'text-green-600' : 'text-red-500'}`}>
                              {settlement.deposit_paid ? '✓ Отримано' : '✗ Очікується'}
                            </div>
                          </div>
                          <div className={`rounded-lg p-3 ${settlement.balance_due > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                            <div className="text-xs text-gray-500">Залишок до оплати</div>
                            <div className={`font-bold text-lg ${settlement.balance_due > 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(settlement.balance_due)} ₴</div>
                            <div className={`text-xs font-medium ${settlement.balance_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {settlement.balance_due > 0 ? 'До оплати' : '✓ Розраховано'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Завантаження...
                      </div>
                    )}
                  </div>

                  {/* Contract placeholder */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                    <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500" />Договір та документи
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { icon: FileText, label: "Договір оренди", color: "text-blue-600 bg-blue-50" },
                        { icon: DollarSign, label: "Рахунок-фактура", color: "text-green-600 bg-green-50" },
                        { icon: UtensilsCrossed, label: "Меню-замовлення", color: "text-purple-600 bg-purple-50" },
                        { icon: Users, label: "Список гостей", color: "text-amber-600 bg-amber-50" },
                        { icon: Tag, label: "Кошторис", color: "text-rose-600 bg-rose-50" },
                        { icon: Check, label: "Акт виконання", color: "text-teal-600 bg-teal-50" },
                      ].map((doc, i) => (
                        <button key={i} className={`flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 transition-colors text-left group`}>
                          <div className={`p-1.5 rounded-lg ${doc.color}`}><doc.icon className="w-3.5 h-3.5" /></div>
                          <span className="text-sm text-gray-600 group-hover:text-gray-800">{doc.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">Функція генерації документів буде доступна після підключення шаблонів</p>
                  </div>

                  {/* Staff notes */}
                  {selected.staff_notes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h4 className="font-medium text-amber-800 mb-2 text-sm flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />Внутрішні нотатки</h4>
                      <p className="text-sm text-amber-700 whitespace-pre-line">{selected.staff_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lead Form Modal */}
        {showLeadForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto">
              <div className="p-5 border-b flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><PartyPopper className="w-4 h-4 text-purple-600" />Новий запит / Lead</h3>
                <button onClick={() => setShowLeadForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Назва заходу</label><Input value={nLead.name} onChange={e => setNLead(f => ({ ...f, name: e.target.value }))} placeholder="Весілля Іванченків" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Тип заходу</label>
                  <select value={nLead.eventType} onChange={e => setNLead(f => ({ ...f, eventType: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white">
                    {Object.entries(EVT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Ім'я клієнта *</label><Input value={nLead.clientName} onChange={e => setNLead(f => ({ ...f, clientName: e.target.value }))} placeholder="Олена Петренко" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500 mb-1 block">Телефон</label><Input value={nLead.clientPhone} onChange={e => setNLead(f => ({ ...f, clientPhone: e.target.value }))} placeholder="+380..." /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Email</label><Input type="email" value={nLead.clientEmail} onChange={e => setNLead(f => ({ ...f, clientEmail: e.target.value }))} placeholder="email@..." /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500 mb-1 block">Дата заходу *</label><Input type="date" value={nLead.eventDate} onChange={e => setNLead(f => ({ ...f, eventDate: e.target.value }))} /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Кількість гостей</label><Input type="number" value={nLead.guestCount} onChange={e => setNLead(f => ({ ...f, guestCount: e.target.value }))} min={1} /></div>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Побажання</label><Textarea value={nLead.notes} onChange={e => setNLead(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Особливі вимоги..." /></div>
              </div>
              <div className="p-5 border-t flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowLeadForm(false)}>Скасувати</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={submitLead}>Зберегти запит</Button>
              </div>
            </div>
          </div>
        )}

        {/* Settle Modal */}
        {settleModal && settlement && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="p-5 border-b flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-600" />Закрити захід</h3>
                <button onClick={() => setSettleModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-sm text-gray-500">До оплати</div>
                  <div className="text-2xl font-bold text-green-700">{fmt(settlement.balance_due)} ₴</div>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Спосіб оплати</label>
                  <select value={settleForm.payment_method} onChange={e => setSettleForm(f => ({ ...f, payment_method: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm">
                    <option value="cash">Готівка</option>
                    <option value="card">Картка</option>
                    <option value="bank_transfer">Банківський переказ</option>
                    <option value="mixed">Змішана оплата</option>
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Нотатки</label><Input value={settleForm.notes} onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))} placeholder="Додаткова інформація..." /></div>
              </div>
              <div className="p-5 border-t flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setSettleModal(false)}>Скасувати</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={doSettle}>Підтвердити оплату</Button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ LIST VIEW ════════════════ */}
        {!selected && (
          <div>
            <div className="bg-white dark:bg-gray-800 border-b sticky top-0 z-20">
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-2"><PartyPopper className="w-6 h-6 text-purple-600" />Events & Banquet</h1>
                  <p className="text-sm text-gray-500">Весілля · Корпоративи · Конференції · Приватні заходи</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={loadList}><RefreshCw className="w-4 h-4" /></Button>
                  {mainTab !== "spaces" && <Button size="sm" className="bg-purple-600 hover:bg-purple-700 gap-1" onClick={() => setShowNewEvent(true)}><Plus className="w-4 h-4" />Новий захід</Button>}
                </div>
              </div>
              <div className="px-6 flex">
                {MAIN_TABS.map(t => (
                  <button key={t.id} onClick={() => setMainTab(t.id as MainTab)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${mainTab === t.id ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    <t.icon className="w-4 h-4" />{t.label}
                    {t.id !== "spaces" && stats && (
                      <span className="bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded-full">{t.id === "upcoming" ? stats.upcoming : stats.total}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Майбутніх заходів", value: stats.upcoming, sub: `Цього тижня: ${stats.thisWeek}`, color: "text-purple-600" },
                    { label: "Підтверджено", value: stats.confirmed, sub: `Проведено: ${stats.completed}`, color: "text-blue-600" },
                    { label: "Виручка (факт)", value: `${fmt(stats.totalRevenue)} ₴`, sub: "Проведені заходи", color: "text-green-600" },
                    { label: "Очіків. виручка", value: `${fmt(stats.upcomingRevenue)} ₴`, sub: "Майбутні заходи", color: "text-emerald-600" },
                  ].map(k => (
                    <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border p-4">
                      <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                      <p className="text-sm text-gray-500 mt-1">{k.label}</p>
                      <p className="text-xs text-gray-400">{k.sub}</p>
                    </div>
                  ))}
                </div>
              )}

              {(mainTab === "upcoming" || mainTab === "all") && (
                <div className="flex flex-wrap gap-2 bg-white dark:bg-gray-800 border rounded-xl p-3">
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 px-3 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white">
                    <option value="all">Всі статуси</option>
                    {Object.entries(EVT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-9 px-3 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white">
                    <option value="all">Всі типи</option>
                    {Object.entries(EVT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button onClick={() => setShowLeadForm(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors">
                    <Plus className="w-3.5 h-3.5" />Запит
                  </button>
                  <span className="text-sm text-gray-400 self-center">{displayList.length} заходів</span>
                </div>
              )}

              {(mainTab === "upcoming" || mainTab === "all") && (
                <div className="space-y-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
                  ) : displayList.length === 0 ? (
                    <div className="text-center py-16 text-gray-400"><PartyPopper className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>Заходів немає</p></div>
                  ) : displayList.map(ev => {
                    const meta = EVT_TYPE[ev.eventType] || EVT_TYPE.other;
                    const daysLeft = differenceInDays(new Date(ev.eventDate + "T12:00:00"), new Date());
                    return (
                      <div key={ev.id} className="bg-white dark:bg-gray-800 rounded-xl border p-4 hover:shadow-md cursor-pointer transition-all" onClick={() => selectEvent(ev)}>
                        <div className="flex items-start gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${meta.bg}`}><meta.icon className={`w-6 h-6 ${meta.color}`} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-gray-900 dark:text-white">{ev.name}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EVT_STATUS[ev.status]?.bg} ${EVT_STATUS[ev.status]?.color}`}>{EVT_STATUS[ev.status]?.label}</span>
                              {ev.depositPaid && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Депозит ✓</span>}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(ev.eventDate + "T12:00:00"), "d MMMM yyyy", { locale: uk })}{daysLeft > 0 && daysLeft <= 30 && <span className="text-orange-600 font-medium ml-1">({daysLeft} дн.)</span>}{daysLeft <= 0 && daysLeft > -2 && <span className="text-blue-600 font-medium ml-1">(сьогодні)</span>}</span>
                              <span>{ev.startTime}–{ev.endTime}</span>
                              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{ev.guestCount} гостей</span>
                              {ev.spaceName && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{ev.spaceName}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-sm text-gray-500">{ev.clientName}</span>
                              <span className="font-bold text-purple-700 text-sm">{fmt(ev.totalPrice)} ₴</span>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-300 shrink-0 mt-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── CALENDAR VIEW ── */}
              {mainTab === "calendar" && (() => {
                const MONTHS_UA = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
                const DAYS_UA = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
                const firstDay = new Date(calMonth.year, calMonth.month - 1, 1);
                const daysInMonth = new Date(calMonth.year, calMonth.month, 0).getDate();
                const startWeekday = (firstDay.getDay() + 6) % 7; // Mon = 0
                const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
                while (cells.length % 7 !== 0) cells.push(null);
                const evByDay: Record<number, any[]> = {};
                calEvents.forEach(ev => {
                  const d = new Date(ev.event_date + "T12:00:00").getDate();
                  if (!evByDay[d]) evByDay[d] = [];
                  evByDay[d].push(ev);
                });
                const today = new Date(); const isCurrentMonth = today.getFullYear() === calMonth.year && today.getMonth() + 1 === calMonth.month;
                const prevMonth = () => setCalMonth(m => m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 });
                const nextMonth = () => setCalMonth(m => m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 });
                return (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border overflow-hidden">
                    {/* Calendar header */}
                    <div className="px-4 py-3 flex items-center justify-between border-b">
                      <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-900">{MONTHS_UA[calMonth.month - 1]} {calMonth.year}</span>
                        {calLoading && <Loader2 className="w-4 h-4 animate-spin text-purple-500" />}
                      </div>
                      <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                    {/* Day headers */}
                    <div className="grid grid-cols-7 border-b">
                      {DAYS_UA.map(d => (
                        <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>
                      ))}
                    </div>
                    {/* Calendar grid */}
                    <div className="grid grid-cols-7">
                      {cells.map((day, i) => {
                        const isToday = isCurrentMonth && day === today.getDate();
                        const dayEvents = day ? evByDay[day] || [] : [];
                        return (
                          <div key={i} className={`min-h-[90px] border-r border-b p-1.5 ${!day ? 'bg-gray-50' : isToday ? 'bg-purple-50' : 'hover:bg-gray-50'} ${i % 7 === 6 ? 'border-r-0' : ''}`}>
                            {day && (
                              <>
                                <div className={`w-6 h-6 flex items-center justify-center rounded-full text-sm mb-1 font-medium ${isToday ? 'bg-purple-600 text-white' : 'text-gray-700'}`}>{day}</div>
                                <div className="space-y-0.5">
                                  {dayEvents.slice(0, 2).map((ev: any) => {
                                    const meta = EVT_TYPE[ev.event_type] || EVT_TYPE.other;
                                    return (
                                      <button key={ev.id} onClick={() => selectEvent({ ...ev, eventDate: ev.event_date, eventType: ev.event_type, guestCount: ev.guest_count, startTime: ev.start_time, endTime: ev.end_time, clientName: ev.client_name, spaceName: ev.space_name, totalPrice: ev.grand_total })}
                                        className={`w-full text-left px-1.5 py-0.5 rounded text-xs truncate font-medium ${meta.bg} ${meta.color}`}>
                                        {ev.name}
                                      </button>
                                    );
                                  })}
                                  {dayEvents.length > 2 && <div className="text-xs text-gray-400 pl-1">+{dayEvents.length - 2} ще</div>}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div className="px-4 py-2 border-t flex flex-wrap gap-2">
                      {Object.entries(EVT_TYPE).map(([k, v]) => (
                        <div key={k} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${v.bg} ${v.color}`}>
                          <v.icon className="w-3 h-3" />{v.label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {mainTab === "spaces" && (
                <div className="grid md:grid-cols-2 gap-4">
                  {spaces.map(sp => (
                    <div key={sp.id} className="bg-white dark:bg-gray-800 rounded-xl border p-5">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: sp.color + "20" }}>
                          <Building2 className="w-6 h-6" style={{ color: sp.color }} />
                        </div>
                        <div><h3 className="font-semibold">{sp.name}</h3>{sp.description && <p className="text-sm text-gray-500 mt-0.5">{sp.description}</p>}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                          <p className="text-xs text-gray-400">Місткість</p>
                          <p className="font-bold">{sp.capacityMin}–{sp.capacityMax} ос.</p>
                          {sp.areaSqm && <p className="text-xs text-gray-400">{sp.areaSqm} м²</p>}
                        </div>
                        <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                          <p className="text-xs text-gray-400">Оренда</p>
                          <p className="font-bold text-purple-600">{fmt(sp.pricePerDay)} ₴/день</p>
                          <p className="text-xs text-gray-400">{fmt(sp.pricePerHour)} ₴/год</p>
                        </div>
                      </div>
                      {/* Banquet minimums */}
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1"><DollarSign className="w-3 h-3" />Банкетні мінімалки</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Весілля",     val: sp.banquet_min_wedding },
                            { label: "Корпоратив",  val: sp.banquet_min_corporate },
                            { label: "Д. народж.",  val: sp.banquet_min_birthday },
                            { label: "Конференція", val: sp.banquet_min_conference },
                          ].filter(bm => num(bm.val) > 0).map(bm => (
                            <div key={bm.label} className="flex justify-between px-2 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs">
                              <span className="text-gray-600 dark:text-gray-400">{bm.label}</span>
                              <span className="font-bold text-purple-700">{fmt(bm.val)} ₴</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs mb-3 flex-wrap">
                        <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg"><Percent className="w-3 h-3" />Сервіс {fmt(sp.default_service_fee_pct)}%</span>
                        <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded-lg"><Wine className="w-3 h-3" />Cork {fmt(sp.cork_fee_per_bottle)} ₴/пл.</span>
                      </div>
                      {Array.isArray(sp.amenities) && sp.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {sp.amenities.map((a: string) => <span key={a} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-xs rounded-full text-gray-600">{a}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════════════════ */}

      {/* New Event */}
      {showNewEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="p-5 border-b flex items-center justify-between"><h3 className="font-semibold">Новий захід</h3><button onClick={() => setShowNewEvent(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Тип *</label>
                  <select value={nEv.eventType} onChange={e => setNEv(f => ({ ...f, eventType: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white">
                    {Object.entries(EVT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Зал</label>
                  <select value={nEv.spaceId} onChange={e => setNEv(f => ({ ...f, spaceId: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white">
                    <option value="">— без залу —</option>
                    {spaces.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Назва *</label><Input value={nEv.name} onChange={e => setNEv(f => ({ ...f, name: e.target.value }))} placeholder="Весілля Іванна & Олексій" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Клієнт *</label><Input value={nEv.clientName} onChange={e => setNEv(f => ({ ...f, clientName: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Телефон</label><Input value={nEv.clientPhone} onChange={e => setNEv(f => ({ ...f, clientPhone: e.target.value }))} placeholder="+380..." /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Дата *</label><Input type="date" value={nEv.eventDate} onChange={e => setNEv(f => ({ ...f, eventDate: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Початок</label><Input type="time" value={nEv.startTime} onChange={e => setNEv(f => ({ ...f, startTime: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Кінець</label><Input type="time" value={nEv.endTime} onChange={e => setNEv(f => ({ ...f, endTime: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Гостей</label><Input type="number" value={nEv.guestCount} onChange={e => setNEv(f => ({ ...f, guestCount: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Ціна залу (₴)</label><Input type="number" value={nEv.venuePrice} onChange={e => setNEv(f => ({ ...f, venuePrice: e.target.value }))} /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Нотатки</label><Textarea value={nEv.notes} onChange={e => setNEv(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowNewEvent(false)}>Скасувати</Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={createEvent}>Створити</Button>
            </div>
          </div>
        </div>
      )}

      {/* Fees editor */}
      {showFeesEditor && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b flex items-center justify-between"><h3 className="font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-purple-600" />Збори та мінімалки</h3><button onClick={() => setShowFeesEditor(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="p-5 space-y-4">
              <div><label className="text-xs text-gray-500 mb-1 block">Банкетний мінімум (₴)</label><Input type="number" value={fees.banquetMinimum} onChange={e => setFees(f => ({ ...f, banquetMinimum: e.target.value }))} /><p className="text-xs text-gray-400 mt-0.5">Мінімальна сума замовлення</p></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Сервісний збір (%)</label><Input type="number" value={fees.serviceFeeP} onChange={e => setFees(f => ({ ...f, serviceFeeP: e.target.value }))} min={0} max={50} /><p className="text-xs text-gray-400 mt-0.5">% від загальної суми</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Cork fee / пляшку (₴)</label><Input type="number" value={fees.corkFeePerBottle} onChange={e => setFees(f => ({ ...f, corkFeePerBottle: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Пляшок</label><Input type="number" value={fees.corkFeeBottles} onChange={e => setFees(f => ({ ...f, corkFeeBottles: e.target.value }))} min={0} /></div>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-sm space-y-2">
                <div className="flex justify-between"><span className="text-gray-600">Сервісний збір:</span><span className="font-medium">{fmt(feePreviewSvc)} ₴</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Cork fee:</span><span className="font-medium">{fmt(feePreviewCork)} ₴</span></div>
                <div className="flex justify-between font-bold border-t border-purple-200 pt-2"><span>Разом:</span><span className="text-green-600">{fmt(feePreviewTotal)} ₴</span></div>
              </div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowFeesEditor(false)}>Скасувати</Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={saveFees}>Зберегти</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Timing */}
      {showAddTiming && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b flex items-center justify-between"><h3 className="font-semibold flex items-center gap-2"><AlarmClock className="w-4 h-4 text-purple-600" />Пункт таймінгу</h3><button onClick={() => setShowAddTiming(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Початок *</label><Input type="time" value={nTim.timeStart} onChange={e => setNTim(f => ({ ...f, timeStart: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Кінець</label><Input type="time" value={nTim.timeEnd} onChange={e => setNTim(f => ({ ...f, timeEnd: e.target.value }))} /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Назва *</label><Input value={nTim.title} onChange={e => setNTim(f => ({ ...f, title: e.target.value }))} placeholder="Реєстрація гостей" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Категорія</label>
                  <select value={nTim.category} onChange={e => setNTim(f => ({ ...f, category: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white">
                    {Object.entries(TIMING_CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Відповідальний</label><Input value={nTim.assignedTo} onChange={e => setNTim(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Координатор" /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Деталі</label><Textarea value={nTim.description} onChange={e => setNTim(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddTiming(false)}>Скасувати</Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={addTiming}>Додати</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Group */}
      {showAddGroup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b flex items-center justify-between"><h3 className="font-semibold flex items-center gap-2"><Users2 className="w-4 h-4 text-purple-600" />Новий груповий заїзд</h3><button onClick={() => setShowAddGroup(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="p-5 space-y-4">
              <div><label className="text-xs text-gray-500 mb-1 block">Назва групи *</label><Input value={nGrp.groupName} onChange={e => setNGrp(f => ({ ...f, groupName: e.target.value }))} placeholder="Сім'я нареченої" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Дата заїзду *</label><Input type="date" value={nGrp.arrivalDate} onChange={e => setNGrp(f => ({ ...f, arrivalDate: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Час заїзду</label><Input type="time" value={nGrp.arrivalTime} onChange={e => setNGrp(f => ({ ...f, arrivalTime: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Дата виїзду</label><Input type="date" value={nGrp.departureDate} onChange={e => setNGrp(f => ({ ...f, departureDate: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Час виїзду</label><Input type="time" value={nGrp.departureTime} onChange={e => setNGrp(f => ({ ...f, departureTime: e.target.value }))} /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Гостей</label><Input type="number" value={nGrp.totalGuests} onChange={e => setNGrp(f => ({ ...f, totalGuests: e.target.value }))} min={1} /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Нотатки</label><Textarea value={nGrp.notes} onChange={e => setNGrp(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddGroup(false)}>Скасувати</Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={addGroup}>Додати</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Allocation */}
      {showAddAlloc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="p-5 border-b flex items-center justify-between"><h3 className="font-semibold flex items-center gap-2"><BedSingle className="w-4 h-4 text-purple-600" />Поселити гостя</h3><button onClick={() => setShowAddAlloc(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Ім'я гостя *</label><Input value={nAlc.guestName} onChange={e => setNAlc(f => ({ ...f, guestName: e.target.value }))} placeholder="Іванна Мороз" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Телефон</label><Input value={nAlc.guestPhone} onChange={e => setNAlc(f => ({ ...f, guestPhone: e.target.value }))} placeholder="+380..." /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Роль / зв'язок</label><Input value={nAlc.relationToEvent} onChange={e => setNAlc(f => ({ ...f, relationToEvent: e.target.value }))} placeholder="Батьки нареченої" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Гостей</label><Input type="number" value={nAlc.guestsCount} onChange={e => setNAlc(f => ({ ...f, guestsCount: e.target.value }))} min={1} /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Об'єкт розміщення</label>
                <select value={nAlc.unitId} onChange={e => setNAlc(f => ({ ...f, unitId: e.target.value }))} className="w-full h-10 px-3 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white">
                  <option value="">— оберіть об'єкт —</option>
                  {availUnits.map((u: any) => <option key={u.id} value={u.id}>{u.property_name} › {u.name}{u.unit_number ? ` #${u.unit_number}` : ""}{parseInt(u.already_allocated || "0") > 0 ? " (вже використ.)" : ""}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Заїзд</label><Input type="date" value={nAlc.checkInDate} onChange={e => setNAlc(f => ({ ...f, checkInDate: e.target.value }))} /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Виїзд</label><Input type="date" value={nAlc.checkOutDate} onChange={e => setNAlc(f => ({ ...f, checkOutDate: e.target.value }))} /></div>
              </div>
              <div><label className="text-xs text-gray-500 mb-1 block">Нотатки</label><Textarea value={nAlc.notes} onChange={e => setNAlc(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddAlloc(false)}>Скасувати</Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={addAlloc}>Поселити</Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
