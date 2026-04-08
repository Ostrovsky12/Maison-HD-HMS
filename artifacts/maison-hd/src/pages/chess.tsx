import {
  useState, useMemo, useRef, useEffect, useCallback, memo,
} from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookingDialog } from "@/components/booking/booking-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, subDays, parseISO, differenceInDays, startOfWeek, endOfWeek } from "date-fns";
import { uk } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, Maximize2, Minimize2, Filter, X,
  Layers, Home, BedDouble, TreePine, Building2, Star, Tent, MapPin,
  Calendar, CalendarDays, Search, Loader2, LogIn, LogOut, Banknote,
  Sparkles, Wrench, Lock, Users, Eye, RefreshCw, ZoomIn, ZoomOut,
  Sun, Moon, AlertCircle, Hammer,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const SIDEBAR_W = 48;
const HEADER_H = 76;
const MIN_DAY_W = 16;
const MAX_DAY_W = 110;
const ROW_H_COMPACT = 34;
const ROW_H_NORMAL = 52;
const ROW_H_EXTENDED = 68;
const CAT_H = 30;

const ds = (d: Date | string) => typeof d === "string" ? d : format(d, "yyyy-MM-dd");
const dp = (s: string) => parseISO(s);
const fmtDay = (s: string) => format(dp(s), "d", { locale: uk });
const fmtWeekday = (s: string) => format(dp(s), "EEE", { locale: uk });
const fmtMonth = (s: string) => format(dp(s), "LLL", { locale: uk });
const fmtMoney = (n: number) => Math.round(n).toLocaleString("uk-UA");

// ─── Status definitions ────────────────────────────────────────────────────────
type BookingStatus =
  | "inquiry" | "tentative" | "pending" | "confirmed"
  | "partial" | "paid" | "checked_in" | "checked_out"
  | "cancelled" | "no_show" | "blocked" | "maintenance" | "owner";

const STATUS_DEF: Record<string, { label: string; bg: string; text: string; border: string; pattern?: string }> = {
  inquiry:     { label: "Запит",        bg: "bg-gray-100",    text: "text-gray-700",   border: "border-gray-400 border-dashed" },
  tentative:   { label: "Tentative",   bg: "bg-yellow-100",  text: "text-yellow-900", border: "border-yellow-400 border-dashed" },
  pending:     { label: "Очікує",      bg: "bg-amber-200",   text: "text-amber-900",  border: "border-amber-400" },
  confirmed:   { label: "Підтверджено", bg: "bg-blue-500",    text: "text-white",      border: "border-blue-600" },
  partial:     { label: "Часткова оплата", bg: "bg-orange-400", text: "text-white",   border: "border-orange-600" },
  paid:        { label: "Оплачено",    bg: "bg-emerald-500", text: "text-white",      border: "border-emerald-600" },
  checked_in:  { label: "Проживає",   bg: "bg-green-600",   text: "text-white",      border: "border-green-700" },
  checked_out: { label: "Виїхав",     bg: "bg-slate-300",   text: "text-slate-700",  border: "border-slate-400" },
  cancelled:   { label: "Скасовано",  bg: "bg-red-100",     text: "text-red-400",    border: "border-red-300 border-dashed", pattern: "cancelled" },
  no_show:     { label: "No-show",    bg: "bg-red-700",     text: "text-white",      border: "border-red-800" },
  blocked:     { label: "Заблоковано", bg: "bg-gray-500",   text: "text-white",      border: "border-gray-600", pattern: "striped" },
  maintenance: { label: "Ремонт",     bg: "bg-orange-300",  text: "text-orange-900", border: "border-orange-400", pattern: "striped" },
  owner:       { label: "Власник",    bg: "bg-purple-400",  text: "text-white",      border: "border-purple-500" },
};

const getStatusFromBooking = (b: any): string => {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "checked_in") return "checked_in";
  if (b.status === "checked_out") return "checked_out";
  if (b.status === "pending") return b.paymentStatus === "partial" ? "partial" : "pending";
  if (b.status === "confirmed") {
    if (b.paymentStatus === "paid") return "paid";
    if (b.paymentStatus === "partial") return "partial";
    return "confirmed";
  }
  return b.status || "inquiry";
};

// ─── Overlays ─────────────────────────────────────────────────────────────────
type Overlay = "none" | "heatmap" | "housekeeping" | "payment" | "maintenance";
const OVERLAY_LABELS: Record<Overlay, string> = {
  none: "Вимкнено", heatmap: "Завантаженість", housekeeping: "Прибирання",
  payment: "Оплата", maintenance: "Ремонт",
};

// ─── Property type icons ──────────────────────────────────────────────────────
const PROP_ICON: Record<string, any> = {
  hotel: BedDouble, house: Home, villa: Star, apartment: Building2,
  glamping: TreePine, camping: MapPin, bungalow: Tent, other: Home,
};

// ─── Main Chess Page ──────────────────────────────────────────────────────────
export default function ChessPage() {
  const { toast } = useToast();
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ── View state ──
  const [startDate, setStartDate] = useState(() => ds(new Date()));
  const [days, setDays] = useState(21);
  const [dayW, setDayW] = useState(32);
  const [rowMode, setRowMode] = useState<"compact" | "normal" | "extended">("normal");
  const [compact, setCompact] = useState(false);
  const rowH = compact ? ROW_H_COMPACT : rowMode === "compact" ? ROW_H_COMPACT : rowMode === "extended" ? ROW_H_EXTENDED : ROW_H_NORMAL;

  // ── Filters ──
  const [filterProp, setFilterProp] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("none");

  // ── Data ──
  const [calData, setCalData] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Drag/create ──
  const drag = useRef<{ unitId: number; start: string; end: string; active: boolean } | null>(null);
  const [dragVis, setDragVis] = useState<{ unitId: number; start: string; end: string } | null>(null);

  // ── Dialogs ──
  const [newBk, setNewBk] = useState<{ open: boolean; unitId?: number; checkIn?: string; checkOut?: string }>({ open: false });
  const [detailBk, setDetailBk] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGroups, setShowGroups] = useState(false);

  const today = ds(new Date());

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const p = new URLSearchParams({ startDate, days: String(days) });
    if (filterProp !== "all") p.set("propertyId", filterProp);
    if (filterCat !== "all") p.set("category", filterCat);
    const [calR, blkR] = await Promise.all([
      apiFetch(`/bookings/calendar?${p}`),
      apiFetch("/accommodation/blocks"),
    ]);
    if (calR.ok) setCalData(await calR.json());
    if (blkR.ok) { const d = await blkR.json(); setBlocks(d.blocks || []); }
    setLoading(false); setRefreshing(false);
  }, [startDate, days, filterProp, filterCat]);

  useEffect(() => { loadData(); }, [loadData]);

  // Sync scroll between header and grid
  const onGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (headerRef.current) headerRef.current.scrollLeft = el.scrollLeft;
    if (sidebarRef.current) sidebarRef.current.scrollTop = el.scrollTop;
  }, []);

  // ── Data derived ──
  const units: any[] = calData?.units || [];
  const bookings: any[] = calData?.bookings || [];
  const dates: string[] = calData?.dates || [];

  const properties = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach(u => m.set(String(u.propertyId), u.propertyName));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [units]);

  const categories = useMemo(() => {
    const s = new Set(units.map(u => u.category).filter(Boolean));
    return Array.from(s);
  }, [units]);

  const filteredUnits = useMemo(() => {
    let list = units;
    if (filterProp !== "all") list = list.filter(u => String(u.propertyId) === filterProp);
    if (filterCat !== "all") list = list.filter(u => u.category === filterCat);
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.propertyName.toLowerCase().includes(q));
    }
    return list;
  }, [units, filterProp, filterCat, filterSearch]);

  const bookingMap = useMemo(() => {
    const m = new Map<number, any[]>();
    bookings.forEach(b => {
      if (!m.has(b.unitId)) m.set(b.unitId, []);
      m.get(b.unitId)!.push(b);
    });
    return m;
  }, [bookings]);

  // Group units by property, sorted by propertySortOrder then unitSortOrder
  type Row = { type: "group"; label: string; propId: number; propType?: string } | { type: "unit"; unit: any };
  const rows = useMemo<Row[]>(() => {
    const res: Row[] = [];
    // Sort: first by propertySortOrder, then by unitSortOrder, then name
    const sorted = [...filteredUnits].sort((a, b) => {
      if (a.propertySortOrder !== b.propertySortOrder) return (a.propertySortOrder ?? 0) - (b.propertySortOrder ?? 0);
      if (a.propertyId !== b.propertyId) return a.propertyId - b.propertyId;
      if (a.unitSortOrder !== b.unitSortOrder) return (a.unitSortOrder ?? 0) - (b.unitSortOrder ?? 0);
      return a.name.localeCompare(b.name);
    });
    const seen = new Set<number>();
    sorted.forEach(u => {
      if (!seen.has(u.propertyId)) {
        seen.add(u.propertyId);
        res.push({ type: "group", label: u.propertyName || "Без групи", propId: u.propertyId });
      }
      res.push({ type: "unit", unit: u });
    });
    return res;
  }, [filteredUnits]);

  // ── Occupancy for heatmap ──
  const occupancyByDate = useMemo(() => {
    const m = new Map<string, number>();
    const total = filteredUnits.length || 1;
    dates.forEach(d => {
      const occupied = bookings.filter(b =>
        filteredUnits.some(u => u.id === b.unitId) &&
        b.checkIn <= d && b.checkOut > d &&
        b.status !== "cancelled"
      ).length;
      m.set(d, occupied / total);
    });
    return m;
  }, [dates, bookings, filteredUnits]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") navigate(-7);
      if (e.key === "ArrowRight") navigate(7);
      if (e.key === "t" || e.key === "T") goToday();
      if (e.key === "+" || e.key === "=") zoomIn();
      if (e.key === "-") zoomOut();
      if (e.key === "c" || e.key === "C") setCompact(v => !v);
      if (e.key === "Escape") { setDetailBk(null); setNewBk({ open: false }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [startDate]);

  const navigate = (delta: number) => setStartDate(ds(addDays(dp(startDate), delta)));
  const goToday = () => setStartDate(ds(new Date()));
  const zoomIn = () => setDayW(w => Math.min(MAX_DAY_W, w + 10));
  const zoomOut = () => setDayW(w => Math.max(MIN_DAY_W, w - 10));

  // ── Presets ──
  const presets = [
    { label: "7 д", days: 7 }, { label: "14 д", days: 14 },
    { label: "21 д", days: 21 }, { label: "30 д", days: 30 },
    { label: "60 д", days: 60 },
  ];

  // ── Booking on a unit for a date ──
  const getBookingAt = (unitId: number, date: string): any | null => {
    const list = bookingMap.get(unitId) || [];
    return list.find(b => b.checkIn <= date && b.checkOut > date) || null;
  };

  const getBlockAt = (unitId: number, date: string): any | null => {
    return blocks.find(bl =>
      bl.start_date <= date && bl.end_date > date &&
      Array.isArray(bl.units_detail) && bl.units_detail.some((u: any) => u.id === unitId)
    ) || null;
  };

  // ── Mouse handlers for drag-to-create ──
  const onCellDown = (unitId: number, date: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    drag.current = { unitId, start: date, end: date, active: true };
    setDragVis({ unitId, start: date, end: date });
  };
  const onCellEnter = (unitId: number, date: string) => {
    if (!drag.current?.active || drag.current.unitId !== unitId) return;
    drag.current.end = date;
    setDragVis({ unitId, start: drag.current.start, end: date });
  };
  const onCellUp = (_unitId: number, _date: string) => {
    if (!drag.current?.active) return;
    const { unitId: dragUnitId, start, end } = drag.current;
    drag.current = null;
    setDragVis(null);
    const a = start <= end ? start : end;
    const b = start <= end ? end : start;
    setNewBk({ open: true, unitId: dragUnitId, checkIn: a, checkOut: b });
  };
  useEffect(() => {
    const up = () => { if (drag.current) { drag.current.active = false; drag.current = null; setDragVis(null); } };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const isCellDrag = (uid: number, date: string) => {
    if (!dragVis || dragVis.unitId !== uid) return false;
    const a = dragVis.start <= dragVis.end ? dragVis.start : dragVis.end;
    const b = dragVis.start <= dragVis.end ? dragVis.end : dragVis.start;
    return date >= a && date <= b;
  };

  // ── Quick actions ──
  const doCheckin = async (id: number) => {
    await apiFetch(`/bookings/${id}/checkin`, { method: "POST" });
    toast({ title: "Check-in виконано ✓" }); loadData(true); setDetailBk(null);
  };
  const doCheckout = async (id: number) => {
    await apiFetch(`/bookings/${id}/checkout`, { method: "POST" });
    toast({ title: "Check-out виконано ✓" }); loadData(true); setDetailBk(null);
  };
  const doCancel = async (id: number) => {
    if (!confirm("Скасувати бронювання?")) return;
    await apiFetch(`/bookings/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "" }) });
    toast({ title: "Скасовано", variant: "destructive" }); loadData(true); setDetailBk(null);
  };
  const doPayment = async (id: number, amount: number, payMethod?: string, viaRegister?: boolean) => {
    await apiFetch(`/console/booking/${id}/payment`, { method: "POST", body: JSON.stringify({ amount, method: payMethod || "cash", viaRegister: viaRegister || false }) });
    const label = payMethod === "card" ? "Картка" : "Готівка";
    const reg = viaRegister ? " (через касу)" : "";
    toast({ title: `Оплата ${fmtMoney(amount)} ₴ зарахована — ${label}${reg}` }); loadData(true); setDetailBk(null);
  };

  const totalW = dates.length * dayW;

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden bg-white">

        {/* ─── TOOLBAR ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Navigate */}
            <button onClick={() => navigate(-days)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 hover:bg-gray-50">Сьогодні</button>
            <button onClick={() => navigate(days)} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>

            {/* Date display */}
            <button onClick={() => setShowDatePicker(true)} className="flex items-center gap-1 px-2.5 py-1 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50">
              <Calendar className="h-4 w-4 text-gray-400" />
              {format(dp(startDate), "dd MMM", { locale: uk })} – {format(addDays(dp(startDate), days - 1), "dd MMM yyyy", { locale: uk })}
            </button>

            <div className="h-5 w-px bg-gray-200 mx-0.5" />

            {/* Range presets */}
            <div className="flex gap-0.5">
              {presets.map(p => (
                <button key={p.days} onClick={() => setDays(p.days)}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition ${days === p.days ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-gray-200 mx-0.5" />

            {/* Zoom */}
            <button onClick={zoomOut} className="p-1.5 rounded-lg hover:bg-gray-100" title="Zoom out (-)"><ZoomOut className="h-4 w-4" /></button>
            <span className="text-xs text-gray-400 w-7 text-center">{dayW}px</span>
            <button onClick={zoomIn} className="p-1.5 rounded-lg hover:bg-gray-100" title="Zoom in (+)"><ZoomIn className="h-4 w-4" /></button>

            <div className="h-5 w-px bg-gray-200 mx-0.5" />

            {/* Row density */}
            <div className="flex gap-0.5">
              {(["compact","normal","extended"] as const).map(m => (
                <button key={m} onClick={() => setRowMode(m)}
                  className={`px-2 py-1 text-xs rounded-md transition ${rowMode === m && !compact ? "bg-gray-700 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  {m === "compact" ? "S" : m === "normal" ? "M" : "L"}
                </button>
              ))}
            </div>

            {/* Filters */}
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition ${showFilters ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}>
              <Filter className="h-3.5 w-3.5" /> Фільтри
              {(filterProp !== "all" || filterCat !== "all" || filterStatus !== "all") && (
                <span className="bg-blue-600 text-white text-[9px] rounded-full px-1">!</span>
              )}
            </button>

            {/* Groups settings */}
            <button onClick={() => setShowGroups(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition ${showGroups ? "bg-violet-50 text-violet-700" : "text-gray-500 hover:bg-gray-100"}`}>
              <Layers className="h-3.5 w-3.5" /> Групи
            </button>

            {/* Overlay */}
            <Select value={overlay} onValueChange={v => setOverlay(v as Overlay)}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <Layers className="h-3.5 w-3.5 mr-1 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(OVERLAY_LABELS) as [Overlay, string][]).map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Refresh */}
            <button onClick={() => loadData(true)} className="p-1.5 rounded-lg hover:bg-gray-100 ml-auto">
              <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
            </button>

            {/* Add booking */}
            <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => setNewBk({ open: true })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Бронювання
            </Button>
          </div>

          {/* Filters row */}
          {showFilters && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                <Input className="pl-7 h-7 text-xs w-36" placeholder="Пошук номеру…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
              </div>
              <Select value={filterProp} onValueChange={setFilterProp}>
                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Всі об'єкти" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Всі об'єкти</SelectItem>
                  {properties.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Категорія" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Всі категорії</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {(filterProp !== "all" || filterCat !== "all" || filterSearch) && (
                <button onClick={() => { setFilterProp("all"); setFilterCat("all"); setFilterStatus("all"); setFilterSearch(""); }}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                  <X className="h-3 w-3" /> Скинути
                </button>
              )}
              <span className="text-xs text-gray-400 ml-auto">{filteredUnits.length} об'єктів</span>
            </div>
          )}
        </div>

        {/* ─── CHESS GRID ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex relative">

          {/* Sticky left sidebar */}
          <div className="flex-shrink-0 z-20" style={{ width: SIDEBAR_W }}>
            {/* Corner */}
            <div className="bg-gray-50 border-b border-r border-gray-200 flex items-end px-1 pb-2" style={{ height: HEADER_H }}>
              <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide truncate">№</span>
            </div>
            {/* Unit names — scrollable vertically but synced */}
            <div ref={sidebarRef} className="overflow-hidden border-r border-gray-200 bg-white" style={{ height: `calc(100% - ${HEADER_H}px)` }}>
              {rows.map((row, i) => {
                if (row.type === "group") {
                  return (
                    <div key={i} className="flex items-center px-1 bg-gray-50 border-b border-gray-200" style={{ height: CAT_H }}>
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tight truncate">{row.label}</span>
                    </div>
                  );
                }
                const u = row.unit;
                return (
                  <div key={i} className="flex items-center gap-0.5 px-1 border-b border-gray-100 hover:bg-blue-50/30 transition-colors cursor-default" style={{ height: rowH }}>
                    <p className="text-[10px] font-semibold text-gray-800 truncate leading-tight flex-1 min-w-0" title={u.name}>{u.name}</p>
                    {overlay === "housekeeping" && (
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${u.housekeepingStatus === "clean" ? "bg-green-400" : u.housekeepingStatus === "dirty" ? "bg-red-400" : u.housekeepingStatus === "in_progress" ? "bg-amber-400" : "bg-gray-300"}`} title={u.housekeepingStatus} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable grid area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Date header */}
            <div ref={headerRef} className="overflow-hidden flex-shrink-0 border-b border-gray-200 bg-gray-50" style={{ height: HEADER_H }}>
              <div className="flex" style={{ width: totalW }}>
                {dates.map((d, i) => {
                  const isToday = d === today;
                  const isWeekend = [0, 6].includes(dp(d).getDay());
                  const occ = overlay === "heatmap" ? (occupancyByDate.get(d) || 0) : 0;
                  const isMonthStart = dp(d).getDate() === 1 || i === 0;
                  return (
                    <div key={d} className={`flex-shrink-0 flex flex-col items-center justify-end pb-2 border-r border-gray-200 transition-colors relative ${isWeekend && !isToday ? "bg-rose-50/30" : ""}`}
                      style={{ width: dayW }}>
                      {isMonthStart && dayW >= 36 && (
                        <span className="absolute top-1 left-0 right-0 text-center text-[8px] font-bold text-gray-400 uppercase tracking-wide truncate px-0.5">{fmtMonth(d)}</span>
                      )}
                      {isToday && <div className="absolute top-0 left-0 right-0 bottom-0 bg-blue-50/80 border-x border-blue-300" />}
                      {overlay === "heatmap" && occ > 0 && (
                        <div className="absolute bottom-0 left-0 right-0" style={{ height: `${occ * 100}%`, background: `rgba(239,68,68,${occ * 0.5})`, opacity: 0.5 }} />
                      )}
                      <span className={`text-[8px] font-medium leading-none relative z-10 ${isToday ? "text-blue-500 font-semibold" : isWeekend ? "text-rose-400" : "text-gray-400"}`}>{fmtWeekday(d)}</span>
                      <span className={`text-sm font-bold leading-none mt-0.5 relative z-10 ${isToday ? "text-blue-700" : isWeekend ? "text-rose-600" : "text-gray-700"}`}>{fmtDay(d)}</span>
                      {isToday && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-20" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid body */}
            <div ref={gridRef} className="flex-1 overflow-auto" onScroll={onGridScroll}>
              <div style={{ width: totalW, position: "relative" }}>
                {rows.map((row, ri) => {
                  if (row.type === "group") {
                    return (
                      <div key={ri} className="flex bg-gray-50 border-b border-gray-200 sticky left-0" style={{ height: CAT_H }}>
                        <div style={{ width: totalW }} className="flex items-center px-2">
                          {/* Month markers in group row */}
                        </div>
                      </div>
                    );
                  }
                  const u = row.unit;
                  const unitBookings = bookingMap.get(u.id) || [];

                  return (
                    <div key={ri} className="relative border-b border-gray-100 hover:bg-blue-50/20 group"
                      style={{ height: rowH }}>
                      {/* Day cells */}
                      <div className="flex h-full absolute inset-0" style={{ width: totalW }}>
                        {dates.map(d => {
                          const isToday = d === today;
                          const isWeekend = [0, 6].includes(dp(d).getDay());
                          const isDrag = isCellDrag(u.id, d);
                          const block = getBlockAt(u.id, d);
                          const bk = getBookingAt(u.id, d);
                          const occPct = overlay === "heatmap" ? (occupancyByDate.get(d) || 0) : 0;
                          return (
                            <div key={d}
                              className={`flex-shrink-0 h-full border-r border-gray-100 cursor-cell select-none relative transition-colors ${isToday ? "bg-blue-50/40" : isWeekend ? "bg-rose-50/25" : ""} ${isDrag ? "bg-blue-100" : ""}`}
                              style={{ width: dayW }}
                              onMouseDown={!bk && !block ? (e) => onCellDown(u.id, d, e) : undefined}
                              onMouseEnter={() => onCellEnter(u.id, d)}
                              onMouseUp={() => onCellUp(u.id, d)}
                            >
                              {overlay === "heatmap" && occPct > 0 && !bk && (
                                <div className="absolute inset-0" style={{ background: `rgba(239,68,68,${occPct * 0.25})` }} />
                              )}
                              {overlay === "maintenance" && block?.block_type === "renovation" && (
                                <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "repeating-linear-gradient(45deg,#f97316 0,#f97316 2px,transparent 0,transparent 50%)", backgroundSize: "8px 8px" }} />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Booking blocks rendered as absolute positioned bars */}
                      {unitBookings.map(b => {
                        const bStart = b.checkIn > startDate ? b.checkIn : startDate;
                        const endDate = ds(addDays(dp(startDate), days));
                        const bEnd = b.checkOut < endDate ? b.checkOut : endDate;
                        if (bStart >= bEnd) return null;
                        const startIdx = dates.indexOf(bStart);
                        const endIdx = dates.indexOf(bEnd);
                        if (startIdx === -1) return null;
                        const w = (endIdx === -1 ? dates.length : endIdx) - startIdx;
                        if (w <= 0) return null;
                        const status = getStatusFromBooking(b);
                        const def = STATUS_DEF[status] || STATUS_DEF.confirmed;
                        const isOverflow = b.checkIn < startDate;
                        const isUnderflow = b.checkOut > endDate;
                        const paid = overlay === "payment";
                        const paymentBg = paid ? (b.paymentStatus === "paid" ? "bg-emerald-500" : b.paymentStatus === "partial" ? "bg-orange-400" : "bg-red-400") : "";

                        return (
                          <div key={b.id}
                            className={`absolute top-1 bottom-1 rounded-md border cursor-pointer select-none overflow-hidden flex items-center transition-all hover:brightness-90 hover:shadow-md z-10
                              ${paid ? paymentBg + " text-white border-transparent" : `${def.bg} ${def.text} ${def.border}`}
                              ${b.status === "cancelled" ? "opacity-50" : ""}
                              ${isOverflow ? "rounded-l-none" : ""} ${isUnderflow ? "rounded-r-none" : ""}`}
                            style={{ left: startIdx * dayW + 2, width: w * dayW - 4 }}
                            onClick={(e) => { e.stopPropagation(); setDetailBk(b); }}
                          >
                            {/* Striped pattern for blocked/maintenance */}
                            {(def.pattern === "striped" || def.pattern === "cancelled") && (
                              <div className="absolute inset-0 opacity-20"
                                style={{ backgroundImage: def.pattern === "cancelled" ? "repeating-linear-gradient(-45deg,#ef4444 0,#ef4444 2px,transparent 0,transparent 8px)" : "repeating-linear-gradient(45deg,rgba(0,0,0,0.3) 0,rgba(0,0,0,0.3) 2px,transparent 0,transparent 8px)", backgroundSize: "8px 8px" }} />
                            )}

                            {/* Today indicator */}
                            {b.checkIn <= today && b.checkOut > today && (
                              <div className="absolute top-0 bottom-0" style={{ left: (dates.indexOf(today) - startIdx) * dayW, width: 2, background: "rgba(0,0,0,0.3)" }} />
                            )}

                            {/* Content */}
                            {w * dayW > 30 && (
                              <div className="flex items-center gap-1 px-1.5 min-w-0 w-full">
                                {w * dayW > 42 && (
                                  <span className="text-[11px] font-semibold truncate leading-tight flex-1">
                                    {b.guestName?.split(" ")[0] || "—"}
                                    {w * dayW > 80 && b.guestName?.split(" ")[1] ? ` ${b.guestName.split(" ")[1][0]}.` : ""}
                                  </span>
                                )}
                                {w * dayW > 120 && (
                                  <span className="text-[9px] opacity-60 flex-shrink-0">{b.nights}н</span>
                                )}
                              </div>
                            )}

                            {/* Status dot */}
                            {w * dayW <= 30 && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Block bars */}
                      {blocks.map(bl => {
                        if (!Array.isArray(bl.units_detail) || !bl.units_detail.some((ud: any) => ud.id === u.id)) return null;
                        const bStart = bl.start_date > startDate ? bl.start_date : startDate;
                        const endDate = ds(addDays(dp(startDate), days));
                        const bEnd = bl.end_date < endDate ? bl.end_date : endDate;
                        if (bStart >= bEnd) return null;
                        const startIdx = dates.indexOf(bStart);
                        const endIdx = dates.indexOf(bEnd);
                        if (startIdx === -1) return null;
                        const w = (endIdx === -1 ? dates.length : endIdx) - startIdx;
                        if (w <= 0) return null;
                        const statusKey = bl.block_type === "renovation" ? "maintenance" : bl.block_type === "owner_stay" ? "owner" : "blocked";
                        const def = STATUS_DEF[statusKey];
                        return (
                          <div key={`bl-${bl.id}`}
                            className={`absolute top-1 bottom-1 rounded-md border flex items-center overflow-hidden opacity-80 z-10 cursor-default ${def.bg} ${def.text} ${def.border}`}
                            style={{ left: startIdx * dayW + 2, width: w * dayW - 4 }}>
                            <div className="absolute inset-0 opacity-20"
                              style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(0,0,0,0.4) 0,rgba(0,0,0,0.4) 2px,transparent 0,transparent 8px)", backgroundSize: "8px 8px" }} />
                            {w * dayW > 50 && (
                              <span className="px-1.5 text-[9px] font-bold uppercase tracking-wide truncate z-10">
                                {def.label}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Drag preview */}
                      {dragVis && dragVis.unitId === u.id && (() => {
                        const a = dragVis.start <= dragVis.end ? dragVis.start : dragVis.end;
                        const b = dragVis.start <= dragVis.end ? dragVis.end : dragVis.start;
                        const si = dates.indexOf(a);
                        const ei = dates.indexOf(b);
                        if (si === -1) return null;
                        const w = (ei === -1 ? dates.length - 1 : ei) - si + 1;
                        return (
                          <div className="absolute top-1 bottom-1 rounded-md bg-blue-300 border-2 border-blue-500 border-dashed z-20 pointer-events-none opacity-70 flex items-center justify-center"
                            style={{ left: si * dayW + 2, width: w * dayW - 4 }}>
                            <span className="text-[10px] text-blue-800 font-bold">{w}н</span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Status legend ──────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-1.5 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] text-gray-400 font-medium mr-1 flex-shrink-0">Статуси:</span>
          {Object.entries(STATUS_DEF).filter(([k]) => !["owner","blocked","maintenance"].includes(k)).map(([key, def]) => (
            <div key={key} className="flex items-center gap-1 flex-shrink-0">
              <div className={`w-3 h-3 rounded-sm ${def.bg} border ${def.border} flex-shrink-0`} />
              <span className="text-[10px] text-gray-500">{def.label}</span>
            </div>
          ))}
          <span className="text-[10px] text-gray-300 ml-2">· T=сьогодні · ←→=перемотка · +/-=зум · C=компакт</span>
        </div>
      </div>

      {/* ─── BOOKING DETAIL DRAWER ──────────────────────────────────────── */}
      {detailBk && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailBk(null)}>
          <div className="w-full max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <BookingDrawer
              booking={detailBk}
              onClose={() => setDetailBk(null)}
              onCheckin={doCheckin}
              onCheckout={doCheckout}
              onCancel={doCancel}
              onPayment={doPayment}
            />
          </div>
        </div>
      )}

      {/* ─── NEW BOOKING DIALOG ─────────────────────────────────────────── */}
      <BookingDialog
        open={newBk.open}
        unitId={newBk.unitId}
        checkIn={newBk.checkIn}
        checkOut={newBk.checkOut}
        onClose={() => setNewBk({ open: false })}
        onSuccess={() => { setNewBk({ open: false }); loadData(true); toast({ title: "Бронювання створено ✓" }); }}
      />

      {/* Date picker */}
      <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Перейти до дати</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Початкова дата</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "Пн цього тижня", val: ds(startOfWeek(new Date(), { weekStartsOn: 1 })) },
                { label: "-1 міс", val: ds(addDays(new Date(), -30)) },
                { label: "+1 міс", val: ds(addDays(new Date(), 30)) },
              ].map(p => (
                <Button key={p.label} variant="outline" size="sm" onClick={() => { setStartDate(p.val); setShowDatePicker(false); }}>{p.label}</Button>
              ))}
            </div>
            <Button className="w-full" onClick={() => setShowDatePicker(false)}>Закрити</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── GROUPS PANEL ───────────────────────────────────────────────── */}
      {showGroups && (
        <GroupsPanel onClose={() => setShowGroups(false)} onSaved={() => loadData(true)} />
      )}
    </AppLayout>
  );
}

// ─── Booking Drawer ───────────────────────────────────────────────────────────
function BookingDrawer({ booking: b, onClose, onCheckin, onCheckout, onCancel, onPayment }: any) {
  const status = getStatusFromBooking(b);
  const def = STATUS_DEF[status] || STATUS_DEF.confirmed;
  const debt = parseFloat(b.totalAmount || 0) - parseFloat(b.paidAmount || 0);
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card">("cash");
  const [viaRegister, setViaRegister] = useState(false);
  const nights = b.nights || differenceInDays(dp(b.checkOut), dp(b.checkIn));

  return (
    <>
      <div className={`flex-shrink-0 p-4 ${def.bg} ${def.text}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-base">{b.guestName || "—"}</p>
            <p className="text-sm opacity-80 mt-0.5">{b.bookingRef || `#${b.id}`}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 uppercase`}>{def.label}</span>
              <span className="text-xs opacity-80">{nights} ночей</span>
              {(b.payOnArrival || b.pay_on_arrival) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-400 text-white uppercase">Оплата при заїзді</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <InfoCard>
          <InfoRow label="Кімната/об'єкт" value={b.unitName || "—"} />
          <InfoRow label="Заїзд" value={`${b.checkIn} о ${b.checkinTime || "14:00"}`} />
          <InfoRow label="Виїзд" value={`${b.checkOut} о ${b.checkoutTime || "12:00"}`} />
          <InfoRow label="Гостей" value={`${b.guestsCount || 1} ос.`} />
          <InfoRow label="Джерело" value={b.source || "—"} />
          {b.phone && <InfoRow label="Телефон" value={b.phone} link={`tel:${b.phone}`} />}
          {b.email && <InfoRow label="Email" value={b.email} link={`mailto:${b.email}`} />}
        </InfoCard>

        <InfoCard>
          <InfoRow label="Сума" value={`${fmtMoney(parseFloat(b.totalAmount || 0))} ₴`} bold />
          <InfoRow label="Оплачено" value={`${fmtMoney(parseFloat(b.paidAmount || 0))} ₴`} />
          {debt > 10 && <InfoRow label="Борг" value={`${fmtMoney(debt)} ₴`} red />}
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, (parseFloat(b.paidAmount || 0) / Math.max(1, parseFloat(b.totalAmount || 1))) * 100)}%` }} />
          </div>
        </InfoCard>

        {b.internalNotes && (
          <div className="bg-orange-50 rounded-xl p-3 text-sm text-orange-800 border border-orange-200 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {b.internalNotes}
          </div>
        )}
        {b.notes && (
          <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-800 border border-amber-200">{b.notes}</div>
        )}

        {/* Payment registration */}
        {debt > 0 && b.status !== "cancelled" && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Зареєструвати оплату</p>
            {/* Method toggle */}
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setPayMethod("cash")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border-2 text-xs font-semibold transition-all ${payMethod === "cash" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                <Banknote className="h-3.5 w-3.5" /> Готівка
              </button>
              <button type="button" onClick={() => { setPayMethod("card"); setViaRegister(false); }}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border-2 text-xs font-semibold transition-all ${payMethod === "card" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                Картка (термінал)
              </button>
            </div>
            {/* Via register checkbox — only for cash */}
            {payMethod === "cash" && (
              <label className="flex items-center gap-2 cursor-pointer select-none px-0.5">
                <input type="checkbox" checked={viaRegister} onChange={e => setViaRegister(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-xs text-gray-600 font-medium">Провести через касу (фіскальний реєстратор)</span>
              </label>
            )}
            {/* Quick amounts */}
            <div className="flex gap-1 flex-wrap">
              {[debt, Math.round(debt / 2), 500, 1000, 2000].filter(v => v > 0 && v <= debt).map(v => (
                <button key={v} onClick={() => setPayAmt(String(v))}
                  className="text-xs px-2 py-1 bg-white border border-gray-300 rounded-lg hover:border-emerald-400 hover:text-emerald-700 font-medium transition">
                  {fmtMoney(v)} ₴
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input type="number" placeholder="Сума ₴" value={payAmt} onChange={e => setPayAmt(e.target.value)} className="text-sm h-9" />
              <Button size="sm"
                className={`h-9 flex-shrink-0 ${payMethod === "card" ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                onClick={() => { if (!payAmt || parseFloat(payAmt) <= 0) return; onPayment(b.id, parseFloat(payAmt), payMethod, viaRegister); }}>
                {payMethod === "card" ? <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg> : <Banknote className="h-3.5 w-3.5 mr-1" />}
                {payMethod === "card" ? "Картка" : viaRegister ? "Готівка (каса)" : "Готівка"}
              </Button>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Дії</p>
          <div className="grid grid-cols-2 gap-2">
            {b.status !== "checked_in" && b.status !== "checked_out" && b.status !== "cancelled" && (
              <ActionBtn icon={LogIn} label="Check-in" onClick={() => onCheckin(b.id)} color="green" />
            )}
            {b.status === "checked_in" && (
              <ActionBtn icon={LogOut} label="Check-out" onClick={() => onCheckout(b.id)} color="purple" />
            )}
            {b.status !== "cancelled" && b.status !== "checked_out" && (
              <ActionBtn icon={X} label="Скасувати" onClick={() => onCancel(b.id)} color="red" />
            )}
            <ActionBtn icon={Eye} label="Деталі" onClick={() => window.open(`${BASE}/bookings`, "_blank")} color="blue" />
          </div>
        </div>
      </div>
    </>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">{children}</div>;
}
function InfoRow({ label, value, bold, red, link }: { label: string; value: string; bold?: boolean; red?: boolean; link?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      {link ? (
        <a href={link} className="font-medium text-blue-600 hover:underline">{value}</a>
      ) : (
        <span className={`font-medium ${bold ? "text-blue-700 font-bold" : red ? "text-red-600 font-bold" : "text-gray-800"}`}>{value}</span>
      )}
    </div>
  );
}
function ActionBtn({ icon: Icon, label, onClick, color }: any) {
  const colors: Record<string, string> = {
    green: "bg-green-600 hover:bg-green-700",
    purple: "bg-purple-600 hover:bg-purple-700",
    red: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    blue: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200",
  };
  const isOutline = ["red","blue"].includes(color);
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${isOutline ? colors[color] : colors[color] + " text-white"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

// ─── Groups Panel ─────────────────────────────────────────────────────────────
function GroupsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();

  type Grp = { id: number; name: string; sort_order: number; unitCount: number; tourist_tax_rate: number };
  type UnitRow = { id: number; name: string; category: string; propertyId: number; sort_order: number };

  const [groups, setGroups] = useState<Grp[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editingTax, setEditingTax] = useState<number | null>(null);
  const [editTaxVal, setEditTaxVal] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);

  const load = async () => {
    setLoading(true);
    const [gRes, uRes] = await Promise.all([
      apiFetch("/properties"),
      apiFetch("/units"),
    ]);
    if (gRes.ok) {
      const g: Grp[] = await gRes.json();
      setGroups(g.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      setExpanded(new Set(g.map(x => x.id)));
    }
    if (uRes.ok) {
      const u = await uRes.json();
      setUnits(u.map((x: any) => ({ id: x.id, name: x.name, category: x.category || "", propertyId: x.propertyId || x.property_id, sort_order: x.sort_order ?? 0 })));
    }
    setLoading(false);
  };

  // ── Save tourist tax ──
  const saveTax = async (id: number) => {
    const rate = parseFloat(editTaxVal);
    if (isNaN(rate) || rate < 0) return;
    setSaving(true);
    await apiFetch(`/properties/${id}`, { method: "PATCH", body: JSON.stringify({ touristTaxRate: rate }) });
    toast({ title: `Туристичний збір збережено: ${rate} ₴/гість/ніч` });
    setEditingTax(null);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, tourist_tax_rate: rate } : g));
    onSaved();
    setSaving(false);
  };

  useEffect(() => { load(); }, []);

  const unitsForGroup = (gId: number) =>
    units.filter(u => u.propertyId === gId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

  const toggleExpand = (id: number) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Rename group ──
  const startEdit = (g: Grp) => { setEditing(g.id); setEditName(g.name); };
  const saveEdit = async (id: number) => {
    if (!editName.trim()) return;
    setSaving(true);
    const r = await apiFetch(`/properties/${id}`, { method: "PATCH", body: JSON.stringify({ name: editName.trim() }) });
    if (r.ok) { toast({ title: "Назву змінено" }); setEditing(null); await load(); onSaved(); }
    else toast({ title: "Помилка", variant: "destructive" });
    setSaving(false);
  };

  // ── Create group ──
  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setSaving(true);
    const r = await apiFetch("/properties", { method: "POST", body: JSON.stringify({ name: newGroupName.trim(), type: "house" }) });
    if (r.ok) { toast({ title: "Групу створено ✓" }); setNewGroupName(""); setAddingGroup(false); await load(); onSaved(); }
    else toast({ title: "Помилка", variant: "destructive" });
    setSaving(false);
  };

  // ── Delete group ──
  const deleteGroup = async (g: Grp) => {
    if (!confirm(`Видалити групу "${g.name}"? Видалення можливе тільки якщо вона порожня.`)) return;
    setSaving(true);
    const r = await apiFetch(`/properties/${g.id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: "Групу видалено" }); await load(); onSaved(); }
    else { const d = await r.json().catch(() => ({})); toast({ title: d.error || "Помилка", variant: "destructive" }); }
    setSaving(false);
  };

  // ── Move group up/down ──
  const moveGroup = async (idx: number, dir: -1 | 1) => {
    const newGs = [...groups];
    const swap = idx + dir;
    if (swap < 0 || swap >= newGs.length) return;
    [newGs[idx], newGs[swap]] = [newGs[swap], newGs[idx]];
    const orders = newGs.map((g, i) => ({ id: g.id, sortOrder: i }));
    setGroups(newGs);
    await apiFetch("/properties/bulk-sort", { method: "PATCH", body: JSON.stringify({ orders }) });
    onSaved();
  };

  // ── Move unit to another group ──
  const moveUnit = async (unit: UnitRow, toGroupId: number) => {
    const unitsSrc = unitsForGroup(unit.propertyId).filter(u => u.id !== unit.id);
    const unitsDst = unitsForGroup(toGroupId);
    setSaving(true);
    // Re-assign sort_order in source
    const srcOrders = unitsSrc.map((u, i) => ({ id: u.id, sortOrder: i }));
    const nextSortOrder = unitsDst.length;
    await apiFetch(`/units/${unit.id}`, { method: "PUT", body: JSON.stringify({ propertyId: toGroupId, sortOrder: nextSortOrder }) });
    if (srcOrders.length > 0) await apiFetch("/units/bulk-sort", { method: "PATCH", body: JSON.stringify({ orders: srcOrders }) });
    toast({ title: `"${unit.name}" переміщено` });
    await load(); onSaved(); setSaving(false);
  };

  // ── Move unit up/down within group ──
  const moveUnitInGroup = async (unit: UnitRow, dir: -1 | 1) => {
    const list = unitsForGroup(unit.propertyId);
    const idx = list.findIndex(u => u.id === unit.id);
    if (idx + dir < 0 || idx + dir >= list.length) return;
    const swapped = [...list];
    [swapped[idx], swapped[idx + dir]] = [swapped[idx + dir], swapped[idx]];
    const orders = swapped.map((u, i) => ({ id: u.id, sortOrder: i }));
    setUnits(prev => {
      const others = prev.filter(u => u.propertyId !== unit.propertyId);
      return [...others, ...swapped.map((u, i) => ({ ...u, sort_order: i }))];
    });
    await apiFetch("/units/bulk-sort", { method: "PATCH", body: JSON.stringify({ orders }) });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-violet-50">
          <div>
            <h2 className="text-sm font-bold text-violet-800">Управління групами</h2>
            <p className="text-[11px] text-violet-500">Перейменовуйте, сортуйте, переміщуйте номери між групами</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-violet-100"><X className="h-4 w-4 text-violet-600" /></button>
        </div>

        {/* Add group */}
        <div className="px-4 py-2.5 border-b border-gray-100">
          {addingGroup ? (
            <div className="flex gap-2 items-center">
              <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createGroup(); if (e.key === "Escape") setAddingGroup(false); }}
                placeholder="Назва нової групи…" className="flex-1 text-sm border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-violet-300" />
              <button onClick={createGroup} disabled={saving || !newGroupName.trim()} className="px-3 py-1.5 bg-violet-600 text-white text-xs rounded-lg hover:bg-violet-700 disabled:opacity-50">
                {saving ? "…" : "Додати"}
              </button>
              <button onClick={() => setAddingGroup(false)} className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)} className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium py-0.5">
              <Plus className="h-3.5 w-3.5" /> Нова група
            </button>
          )}
        </div>

        {/* Groups list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Немає груп. Створіть першу!</div>
          ) : groups.map((g, gi) => {
            const gUnits = unitsForGroup(g.id);
            const isOpen = expanded.has(g.id);
            return (
              <div key={g.id} className="border-b border-gray-100">
                {/* Group header */}
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 hover:bg-violet-50 group transition">
                  <button onClick={() => toggleExpand(g.id)} className="text-gray-400 hover:text-violet-600">
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>

                  {editing === g.id ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(g.id); if (e.key === "Escape") setEditing(null); }}
                      className="flex-1 text-sm font-semibold border rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-violet-300" />
                  ) : (
                    <span onClick={() => toggleExpand(g.id)} className="flex-1 text-sm font-semibold text-gray-700 cursor-pointer select-none">
                      {g.name}
                      <span className="ml-2 text-[10px] font-normal text-gray-400">{gUnits.length} ном.</span>
                    </span>
                  )}

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                    {editing === g.id ? (
                      <>
                        <button onClick={() => saveEdit(g.id)} disabled={saving} className="px-2 py-0.5 text-[11px] bg-violet-600 text-white rounded hover:bg-violet-700">✓</button>
                        <button onClick={() => setEditing(null)} className="px-1 py-0.5 text-[11px] text-gray-400 hover:bg-gray-200 rounded">✕</button>
                      </>
                    ) : (
                      <button onClick={() => startEdit(g)} className="p-1 rounded hover:bg-gray-200" title="Перейменувати">
                        <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                    <button onClick={() => moveGroup(gi, -1)} disabled={gi === 0} className="p-1 rounded hover:bg-gray-200 disabled:opacity-20" title="Вище">
                      <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button onClick={() => moveGroup(gi, 1)} disabled={gi === groups.length - 1} className="p-1 rounded hover:bg-gray-200 disabled:opacity-20" title="Нижче">
                      <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button onClick={() => deleteGroup(g)} className="p-1 rounded hover:bg-red-100" title="Видалити">
                      <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {/* Tourist tax row under group header */}
                {isOpen && (
                  <div className="flex items-center gap-2 px-8 py-1.5 bg-amber-50 border-b border-amber-100">
                    <svg className="h-3 w-3 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <span className="text-[10px] text-amber-700 font-medium flex-1">Туристичний збір:</span>
                    {editingTax === g.id ? (
                      <div className="flex items-center gap-1">
                        <input autoFocus type="number" step="0.01" min="0" value={editTaxVal}
                          onChange={e => setEditTaxVal(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveTax(g.id); if (e.key === "Escape") setEditingTax(null); }}
                          className="w-20 text-[11px] border rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-amber-300" />
                        <span className="text-[10px] text-amber-600">₴/гість/ніч</span>
                        <button onClick={() => saveTax(g.id)} disabled={saving} className="px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded hover:bg-amber-600">✓</button>
                        <button onClick={() => setEditingTax(null)} className="text-[10px] text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingTax(g.id); setEditTaxVal(String(g.tourist_tax_rate ?? 0)); }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-amber-800 hover:text-amber-900 hover:bg-amber-100 rounded px-1.5 py-0.5 transition">
                        {g.tourist_tax_rate > 0 ? `${Number(g.tourist_tax_rate).toFixed(2)} ₴/гість/ніч` : "не встановлено"}
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                  </div>
                )}

                {/* Units list */}
                {isOpen && (
                  <div>
                    {gUnits.length === 0 ? (
                      <div className="px-8 py-2 text-[11px] text-gray-400 italic">Порожня група</div>
                    ) : gUnits.map((u, ui) => (
                      <div key={u.id} className="flex items-center gap-2 px-8 py-1.5 hover:bg-gray-50 group/u transition">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-700">{u.name}</span>
                          {u.category && <span className="ml-1.5 text-[10px] text-gray-400">{u.category}</span>}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/u:opacity-100 transition">
                          <button onClick={() => moveUnitInGroup(u, -1)} disabled={ui === 0} className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20" title="Вище">
                            <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => moveUnitInGroup(u, 1)} disabled={ui === gUnits.length - 1} className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20" title="Нижче">
                            <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {groups.length > 1 && (
                            <select onChange={e => { if (e.target.value) moveUnit(u, parseInt(e.target.value)); e.target.value = ""; }}
                              defaultValue="" className="text-[10px] border rounded px-1 py-0.5 bg-white text-gray-500 cursor-pointer max-w-[100px]">
                              <option value="" disabled>→ перемістити</option>
                              {groups.filter(gg => gg.id !== g.id).map(gg => (
                                <option key={gg.id} value={gg.id}>{gg.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <span className="text-[11px] text-gray-400">{groups.length} гр. · {units.length} номерів</span>
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs">Закрити</Button>
        </div>
      </div>
    </div>
  );
}

