import { useState, useEffect, useCallback, useRef } from "react";
import { format, differenceInDays, isToday, parseISO } from "date-fns";
import { uk } from "date-fns/locale";
import { BookingDialog } from "@/components/booking/booking-dialog";
import { BookingPanel } from "@/components/booking/booking-panel";
import {
  Search, Plus, CalendarCheck, ArrowRight, ArrowLeft, Loader2,
  CreditCard, Clock, BedDouble, Building2, CalendarRange, X,
  LogIn, LogOut, Home, SlidersHorizontal,
} from "lucide-react";
import {
  useListBookings, useDeleteBooking,
  useCheckinBooking, useCheckoutBooking, useCancelBooking,
  getListBookingsQueryKey, useListProperties,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { useToast } from "@/hooks/use-toast";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtUAH = (n: number = 0) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

const todayStr = () => new Date().toISOString().split("T")[0];

const STATUS_CFG: Record<string, { label: string; dot: string; pill: string }> = {
  pending:     { label: "Очікує",       dot: "bg-amber-400",   pill: "bg-amber-50 text-amber-700 ring-amber-200/60" },
  confirmed:   { label: "Підтверджено", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200/60" },
  checked_in:  { label: "Проживає",     dot: "bg-blue-500",    pill: "bg-blue-50 text-blue-700 ring-blue-200/60" },
  checked_out: { label: "Виїхав",       dot: "bg-gray-400",    pill: "bg-gray-50 text-gray-600 ring-gray-200/60" },
  cancelled:   { label: "Скасовано",    dot: "bg-red-400",     pill: "bg-red-50 text-red-600 ring-red-200/60" },
};

const PAY_CFG: Record<string, { label: string; color: string }> = {
  unpaid:  { label: "Не оплачено", color: "text-red-600 bg-red-50" },
  partial: { label: "Частково",    color: "text-amber-600 bg-amber-50" },
  paid:    { label: "Оплачено",    color: "text-emerald-600 bg-emerald-50" },
};

const FILTER_TABS = [
  { key: "all",         label: "Всі" },
  { key: "confirmed",   label: "Підтверджено" },
  { key: "checked_in",  label: "Проживають" },
  { key: "pending",     label: "Очікують" },
  { key: "checked_out", label: "Виїхали" },
  { key: "cancelled",   label: "Скасовано" },
];

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${cfg.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Today Quick Stats ─────────────────────────────────────────────────────────
function TodayBar({ bookings }: { bookings: any[] }) {
  const today = todayStr();
  const arrivals   = bookings.filter(b => b.checkIn === today && ["confirmed","pending"].includes(b.status));
  const departures = bookings.filter(b => b.checkOut === today && b.status === "checked_in");
  const staying    = bookings.filter(b => b.status === "checked_in" && b.checkOut > today && b.checkIn <= today);
  const overdue    = bookings.filter(b => b.status === "checked_in" && b.checkOut < today);

  if (arrivals.length === 0 && departures.length === 0 && staying.length === 0 && overdue.length === 0) return null;

  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      {arrivals.length > 0 && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <LogIn className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <div className="text-xs text-emerald-600 font-medium">Заїздів сьогодні</div>
            <div className="font-bold text-emerald-800 text-base leading-tight">{arrivals.length}</div>
          </div>
        </div>
      )}
      {departures.length > 0 && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <LogOut className="w-4 h-4 text-amber-600 shrink-0" />
          <div>
            <div className="text-xs text-amber-600 font-medium">Виїздів сьогодні</div>
            <div className="font-bold text-amber-800 text-base leading-tight">{departures.length}</div>
          </div>
        </div>
      )}
      {staying.length > 0 && (
        <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <Home className="w-4 h-4 text-blue-600 shrink-0" />
          <div>
            <div className="text-xs text-blue-600 font-medium">Зараз проживають</div>
            <div className="font-bold text-blue-800 text-base leading-tight">{staying.length}</div>
          </div>
        </div>
      )}
      {overdue.length > 0 && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <LogOut className="w-4 h-4 text-red-500 shrink-0" />
          <div>
            <div className="text-xs text-red-600 font-medium">Прострочено виїзд</div>
            <div className="font-bold text-red-700 text-base leading-tight">{overdue.length}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Booking Card ──────────────────────────────────────────────────────────────
function BookingCard({ booking, onClick, isSelected, onCheckin, onCheckout, pendingActionId }: {
  booking: any; onClick: () => void; isSelected: boolean;
  onCheckin: (id: number) => void; onCheckout: (id: number) => void;
  pendingActionId?: number | null;
}) {
  const nights = differenceInDays(new Date(booking.checkOut), new Date(booking.checkIn));
  const today = todayStr();
  const isArrivalToday   = booking.checkIn === today && booking.status === "confirmed";
  const isDepartureToday = booking.checkOut === today && booking.status === "checked_in";
  const isOverdue        = booking.status === "checked_in" && booking.checkOut < today;

  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-2xl border-2 px-4 py-3.5 cursor-pointer transition-all hover:shadow-sm ${
        isSelected      ? "border-indigo-400 shadow-sm shadow-indigo-100/60" :
        isOverdue       ? "border-red-300/80 bg-red-50/20" :
        isArrivalToday  ? "border-emerald-300/80 bg-emerald-50/30" :
        isDepartureToday ? "border-amber-300/80 bg-amber-50/30" :
        "border-gray-200/80 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
          isOverdue        ? "bg-gradient-to-br from-red-400 to-rose-500" :
          isArrivalToday   ? "bg-gradient-to-br from-emerald-400 to-teal-500" :
          isDepartureToday ? "bg-gradient-to-br from-amber-400 to-orange-500" :
          "bg-gradient-to-br from-indigo-400 to-violet-500"
        }`}>
          {(booking.guestName || "?")[0].toUpperCase()}
        </div>

        {/* Guest + Unit */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">{booking.guestName || "—"}</span>
            <StatusPill status={booking.status} />
            {isOverdue && (
              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">ПРОСТРОЧЕНО</span>
            )}
            {!isOverdue && isArrivalToday && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">ЗАЇЗД</span>
            )}
            {!isOverdue && isDepartureToday && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">ВИЇЗД</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{booking.unitName || `#${booking.unitId}`}</span>
            <span className="flex items-center gap-1">
              <ArrowRight className="w-3 h-3 text-emerald-400" />
              {format(new Date(booking.checkIn), "d MMM", { locale: uk })}
              <span className="text-gray-200">—</span>
              {format(new Date(booking.checkOut), "d MMM", { locale: uk })}
            </span>
            <span className="hidden sm:flex items-center gap-1"><Clock className="w-3 h-3" />{nights} н</span>
          </div>
        </div>

        {/* Quick actions for today / overdue */}
        {(isArrivalToday || isDepartureToday || isOverdue) && (
          <div className="shrink-0 hidden sm:block" onClick={e => e.stopPropagation()}>
            {isArrivalToday && (
              <button
                onClick={() => onCheckin(booking.id)}
                disabled={pendingActionId === booking.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                {pendingActionId === booking.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <LogIn className="w-3 h-3" />} Заселити
              </button>
            )}
            {isDepartureToday && (
              <button
                onClick={() => onCheckout(booking.id)}
                disabled={pendingActionId === booking.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                {pendingActionId === booking.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <LogOut className="w-3 h-3" />} Виселити
              </button>
            )}
            {isOverdue && (
              <button
                onClick={() => onCheckout(booking.id)}
                disabled={pendingActionId === booking.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                {pendingActionId === booking.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <LogOut className="w-3 h-3" />} Виселити
              </button>
            )}
          </div>
        )}

        {/* Amount + Payment */}
        <div className="text-right shrink-0 hidden sm:block">
          <div className="font-bold text-gray-900 text-sm">{fmtUAH(booking.totalAmount)}</div>
          <div className={`text-[11px] font-medium mt-0.5 px-1.5 py-0.5 rounded-full inline-block ${PAY_CFG[booking.paymentStatus]?.color || "bg-gray-50 text-gray-400"}`}>
            {PAY_CFG[booking.paymentStatus]?.label || "—"}
          </div>
        </div>

        <ArrowRight className="w-4 h-4 text-gray-200 group-hover:text-indigo-400 transition-colors shrink-0 ml-1" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState("all");
  const [propertyId, setPropertyId]   = useState<string>("");
  const [dateFrom, setDateFrom]       = useState<string>("");
  const [dateTo, setDateTo]           = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [drawerBooking, setDrawerBooking] = useState<any>(null);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [dialog, setDialog]           = useState<{ open: boolean; booking?: any }>({ open: false });
  const [activeIdx, setActiveIdx]     = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  const apiParams: any = {};
  if (propertyId) apiParams.propertyId = parseInt(propertyId);
  if (dateFrom)   apiParams.dateFrom = dateFrom;
  if (dateTo)     apiParams.dateTo = dateTo;

  const { data: bookings, isLoading } = useListBookings(apiParams);
  const { data: properties } = useListProperties({});

  const [pendingActionId, setPendingActionId] = useState<number | null>(null);

  const checkinM  = useCheckinBooking();
  const checkoutM = useCheckoutBooking();
  const cancelM   = useCancelBooking();
  const deleteM   = useDeleteBooking();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListBookingsQueryKey() });

  // Extract clean error text (strips "HTTP 400 Bad Request: " prefix)
  const cleanError = (e: any): string => {
    const msg: string = e?.message || e?.data?.error || "Помилка";
    const colonIdx = msg.lastIndexOf(": ");
    return colonIdx !== -1 ? msg.slice(colonIdx + 2) : msg;
  };

  const handleCheckin  = (id: number) => {
    if (pendingActionId) return;
    setPendingActionId(id);
    checkinM.mutate({ bookingId: id }, {
      onSuccess: () => { invalidate(); toast({ title: "✓ Заселено" }); },
      onError:   (e: any) => toast({ title: cleanError(e), variant: "destructive" }),
      onSettled: () => setPendingActionId(null),
    });
  };
  const handleCheckout = (id: number) => {
    if (pendingActionId) return;
    setPendingActionId(id);
    checkoutM.mutate({ bookingId: id }, {
      onSuccess: () => { invalidate(); toast({ title: "✓ Виселено" }); },
      onError: (e: any) => {
        const msg = cleanError(e);
        // If already checked out — just refresh silently
        if (msg.includes("вже виселений") || msg.includes("already")) {
          invalidate();
        } else {
          toast({ title: msg, variant: "destructive" });
        }
      },
      onSettled: () => setPendingActionId(null),
    });
  };
  const handleCancel = (id: number) => {
    if (!window.confirm("Скасувати бронювання?")) return;
    cancelM.mutate({ bookingId: id, data: {} }, {
      onSuccess: () => { invalidate(); toast({ title: "Бронювання скасовано", variant: "destructive" }); },
      onError:   (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" }),
    });
  };
  const handleDelete = (id: number) => {
    if (!window.confirm("Видалити бронювання?")) return;
    deleteM.mutate({ bookingId: id }, {
      onSuccess: () => { invalidate(); toast({ title: "Видалено" }); },
      onError:   () => toast({ title: "Помилка", variant: "destructive" }),
    });
  };

  const today = todayStr();

  const filtered = (bookings || [])
    .filter(b => {
      const q = search.toLowerCase();
      const matchSearch = !q || b.guestName?.toLowerCase().includes(q) || b.unitName?.toLowerCase().includes(q) || String(b.id).includes(q);
      const matchFilter = filter === "all" || b.status === filter;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (filter !== "checked_in") return 0;
      const aOverdue = a.status === "checked_in" && a.checkOut < today;
      const bOverdue = b.status === "checked_in" && b.checkOut < today;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return 0;
    });

  const counts: Record<string, number> = { all: bookings?.length || 0 };
  bookings?.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });
  const inHouseCount = (bookings || []).filter(b => b.status === "checked_in" && b.checkOut > today && b.checkIn <= today).length;
  const overdueCount = (bookings || []).filter(b => b.status === "checked_in" && b.checkOut < today).length;

  const openDrawer = useCallback((b: any) => { setDrawerBooking(b); setDrawerOpen(true); }, []);

  const hasFilters = propertyId || dateFrom || dateTo;
  const clearFilters = () => { setPropertyId(""); setDateFrom(""); setDateTo(""); };

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const inInput = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName || "");
      if (!inInput) {
        if (e.key === "/")     { e.preventDefault(); searchRef.current?.focus(); return; }
        if (e.key === "n")     { e.preventDefault(); setDialog({ open: true }); return; }
        if (e.key === "f")     { e.preventDefault(); setShowFilters(v => !v); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
        if (e.key === "Enter" && activeIdx >= 0) openDrawer(filtered[activeIdx]);
      }
      if (inInput && e.key === "Escape") { (e.target as HTMLElement).blur(); setSearch(""); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [filtered, activeIdx, openDrawer]);

  return (
    <AppLayout>
      <div className="h-full flex flex-col min-h-0">

        {/* ── Toolbar ── */}
        <div className="px-6 pt-5 pb-3 bg-white border-b border-gray-100 shrink-0 space-y-3">

          {/* Title row */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-display">Бронювання</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {counts.all} всього · {inHouseCount} проживають
                {overdueCount > 0 && <span className="text-red-500 font-medium"> · {overdueCount} прострочено</span>}
                {" "}· {counts.confirmed || 0} підтверджено
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`h-9 px-3 rounded-xl text-sm font-semibold flex items-center gap-1.5 border transition-colors ${
                  showFilters || hasFilters
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Фільтри</span>
                {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
              </button>
              <button
                onClick={() => setDialog({ open: true })}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/25 transition-colors"
              >
                <Plus className="w-4 h-4" /> Нове
                <kbd className="ml-1 text-[10px] bg-indigo-500/50 px-1 py-0.5 rounded font-mono hidden sm:inline">N</kbd>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук за гостем, номером, ID..."
              className="w-full h-9 pl-9 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all"
            />
            {search ? (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
              </button>
            ) : (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 font-mono pointer-events-none">/</kbd>
            )}
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 pt-1 pb-1 border-t border-gray-100">
              {/* Property selector */}
              {properties && properties.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  <select
                    value={propertyId}
                    onChange={e => setPropertyId(e.target.value)}
                    className="h-8 pl-2 pr-7 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 cursor-pointer"
                  >
                    <option value="">Всі корпуси</option>
                    {properties.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date from */}
              <div className="flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="h-8 px-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
                <span className="text-xs text-gray-400">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="h-8 px-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
              </div>

              {/* Quick date presets */}
              {[
                { label: "Сьогодні", action: () => { const t = todayStr(); setDateFrom(t); setDateTo(t); } },
                { label: "Цей тиждень", action: () => {
                  const now = new Date();
                  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
                  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                  setDateFrom(mon.toISOString().split("T")[0]);
                  setDateTo(sun.toISOString().split("T")[0]);
                }},
                { label: "Цей місяць", action: () => {
                  const now = new Date();
                  const first = new Date(now.getFullYear(), now.getMonth(), 1);
                  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                  setDateFrom(first.toISOString().split("T")[0]);
                  setDateTo(last.toISOString().split("T")[0]);
                }},
              ].map(({ label, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="h-8 px-2.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                >
                  {label}
                </button>
              ))}

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="h-8 px-2.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Скинути
                </button>
              )}
            </div>
          )}

          {/* Status chips */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key); setActiveIdx(-1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  filter === tab.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {tab.label}
                {counts[tab.key] != null && (
                  <span className={`ml-1 text-[10px] ${filter === tab.key ? "opacity-60" : "text-gray-400"}`}>
                    {counts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── List ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <CalendarCheck className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">Бронювань не знайдено</p>
              {(search || hasFilters) && (
                <button onClick={() => { setSearch(""); clearFilters(); }} className="text-xs text-indigo-500 hover:underline">
                  Скинути фільтри
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl pb-8">
              {/* Today quick stats */}
              {!dateFrom && !dateTo && filter === "all" && (
                <TodayBar bookings={bookings || []} />
              )}

              {filtered.map((b, i) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  isSelected={i === activeIdx || (drawerOpen && drawerBooking?.id === b.id)}
                  onClick={() => { setActiveIdx(i); openDrawer(b); }}
                  onCheckin={handleCheckin}
                  onCheckout={handleCheckout}
                  pendingActionId={pendingActionId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Shortcuts hint */}
        <div className="hidden md:flex items-center gap-4 px-6 py-2 border-t border-gray-100 bg-gray-50/50 shrink-0">
          {[["N","нове"],["F","фільтри"],["/ ","пошук"],["↑↓","навігація"],["↵","деталі"],["ESC","закрити"]].map(([k,l]) => (
            <div key={k} className="flex items-center gap-1">
              <kbd className="text-[10px] bg-white border border-gray-200 text-gray-400 px-1 py-0.5 rounded font-mono">{k}</kbd>
              <span className="text-[11px] text-gray-400">{l}</span>
            </div>
          ))}
        </div>
      </div>

      <BookingPanel
        booking={drawerBooking}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCheckin={handleCheckin}
        onCheckout={handleCheckout}
        onCancel={handleCancel}
        onEdit={b => setDialog({ open: true, booking: b })}
        onDelete={handleDelete}
      />

      <BookingDialog
        open={dialog.open}
        booking={dialog.booking}
        onClose={() => setDialog({ open: false })}
        onSuccess={() => { invalidate(); setDialog({ open: false }); }}
      />
    </AppLayout>
  );
}
