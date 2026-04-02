import { useState, useEffect, useCallback, useRef } from "react";
import { format, differenceInDays } from "date-fns";
import { uk } from "date-fns/locale";
import { BookingDialog } from "@/components/booking/booking-dialog";
import {
  Search, Plus, CalendarCheck, X, ArrowRight, Loader2,
  CreditCard, Clock, BedDouble, LogIn, LogOut,
  Trash2, FileEdit, PhoneCall, Mail,
} from "lucide-react";
import {
  useListBookings, useDeleteBooking,
  useCheckinBooking, useCheckoutBooking, useCancelBooking,
  getListBookingsQueryKey, BookingStatus, BookingPaymentStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtUAH = (n: number = 0) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

const STATUS_CFG: Record<string, { label: string; dot: string; pill: string }> = {
  pending:     { label: "Очікує",       dot: "bg-amber-400",   pill: "bg-amber-50 text-amber-700 ring-amber-200/60" },
  confirmed:   { label: "Підтверджено", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200/60" },
  checked_in:  { label: "Проживає",    dot: "bg-blue-500",    pill: "bg-blue-50 text-blue-700 ring-blue-200/60" },
  checked_out: { label: "Виїхав",      dot: "bg-gray-400",    pill: "bg-gray-50 text-gray-600 ring-gray-200/60" },
  cancelled:   { label: "Скасовано",   dot: "bg-red-400",     pill: "bg-red-50 text-red-600 ring-red-200/60" },
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

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function BookingDrawer({
  booking, open, onClose, onCheckin, onCheckout, onCancel, onEdit, onDelete,
}: {
  booking: any; open: boolean; onClose: () => void;
  onCheckin: (id: number) => void; onCheckout: (id: number) => void;
  onCancel: (id: number) => void; onEdit: (b: any) => void; onDelete: (id: number) => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!booking) return null;

  const nights = differenceInDays(new Date(booking.checkOut), new Date(booking.checkIn));

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <div className={`fixed top-0 right-0 h-screen w-[400px] max-w-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {(booking.guestName || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 truncate">{booking.guestName || "—"}</div>
            <div className="text-xs text-gray-400">Бронювання #{booking.id}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Status row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={booking.status} />
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${PAY_CFG[booking.paymentStatus]?.color || ""}`}>
              {PAY_CFG[booking.paymentStatus]?.label || "—"}
            </span>
          </div>

          {/* Stay tiles */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Заїзд",  value: format(new Date(booking.checkIn),  "d MMM", { locale: uk }), icon: LogIn,  c: "text-emerald-600" },
              { label: "Виїзд",  value: format(new Date(booking.checkOut), "d MMM", { locale: uk }), icon: LogOut, c: "text-amber-600" },
              { label: "Ночей",  value: String(nights), icon: Clock, c: "text-indigo-600" },
            ].map(f => (
              <div key={f.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <f.icon className={`w-4 h-4 ${f.c} mx-auto mb-1`} />
                <div className="font-bold text-gray-900 text-sm">{f.value}</div>
                <div className="text-[11px] text-gray-400">{f.label}</div>
              </div>
            ))}
          </div>

          {/* Details */}
          <div className="space-y-0">
            {[
              { icon: BedDouble,  label: "Номер",   value: booking.unitName || `#${booking.unitId}` },
              { icon: CreditCard, label: "Сума",    value: fmtUAH(booking.totalAmount), bold: true },
              booking.guestEmail && { icon: Mail,      label: "Email",   value: booking.guestEmail },
              booking.guestPhone && { icon: PhoneCall, label: "Тел.",    value: booking.guestPhone },
            ].filter(Boolean).map((f: any, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <f.icon className="w-4 h-4 text-gray-300 shrink-0" />
                <span className="text-xs text-gray-400 w-14 shrink-0">{f.label}</span>
                <span className={`text-sm flex-1 ${f.bold ? "font-bold text-indigo-600" : "text-gray-800"}`}>{f.value}</span>
              </div>
            ))}
          </div>

          {booking.notes && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
              <p className="text-xs font-semibold text-amber-600 mb-1">Примітки</p>
              {booking.notes}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-4 border-t border-gray-100 space-y-2">
          {booking.status === "confirmed" && (
            <button onClick={() => { onCheckin(booking.id); onClose(); }}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              <LogIn className="w-4 h-4" /> Check-in
            </button>
          )}
          {booking.status === "checked_in" && (
            <button onClick={() => { onCheckout(booking.id); onClose(); }}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              <LogOut className="w-4 h-4" /> Check-out
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { onEdit(booking); onClose(); }}
              className="py-2 rounded-xl border border-gray-200 text-sm text-gray-700 font-medium hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors">
              <FileEdit className="w-3.5 h-3.5" /> Редагувати
            </button>
            {(booking.status === "confirmed" || booking.status === "pending") && (
              <button onClick={() => { onCancel(booking.id); onClose(); }}
                className="py-2 rounded-xl border border-red-200 text-sm text-red-600 font-medium hover:bg-red-50 flex items-center justify-center gap-1.5 transition-colors">
                <X className="w-3.5 h-3.5" /> Скасувати
              </button>
            )}
            {(booking.status === "checked_out" || booking.status === "cancelled") && (
              <button onClick={() => { onDelete(booking.id); onClose(); }}
                className="py-2 rounded-xl border border-red-200 text-sm text-red-600 font-medium hover:bg-red-50 flex items-center justify-center gap-1.5 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Видалити
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Booking Card ──────────────────────────────────────────────────────────────
function BookingCard({ booking, onClick, isSelected }: { booking: any; onClick: () => void; isSelected: boolean }) {
  const nights = differenceInDays(new Date(booking.checkOut), new Date(booking.checkIn));
  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-2xl border-2 px-4 py-3.5 cursor-pointer transition-all hover:shadow-sm ${
        isSelected ? "border-indigo-400 shadow-sm shadow-indigo-100/60" : "border-gray-200/80 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {(booking.guestName || "?")[0].toUpperCase()}
        </div>

        {/* Guest + Unit */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm truncate">{booking.guestName || "—"}</span>
            <StatusPill status={booking.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
            <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{booking.unitName || `#${booking.unitId}`}</span>
            <span className="flex items-center gap-1">
              <ArrowRight className="w-3 h-3 text-emerald-400" />
              {format(new Date(booking.checkIn), "d MMM", { locale: uk })}
              <span className="text-gray-200">—</span>
              {format(new Date(booking.checkOut), "d MMM", { locale: uk })}
            </span>
            <span className="hidden sm:flex items-center gap-1"><Clock className="w-3 h-3" />{nights}н</span>
          </div>
        </div>

        {/* Amount + Payment */}
        <div className="text-right shrink-0 hidden sm:block">
          <div className="font-bold text-gray-900 text-sm">{fmtUAH(booking.totalAmount)}</div>
          <div className={`text-[11px] font-medium mt-0.5 px-1.5 py-0.5 rounded-full inline-block ${PAY_CFG[booking.paymentStatus]?.color || "bg-gray-50 text-gray-400"}`}>
            {PAY_CFG[booking.paymentStatus]?.label || "—"}
          </div>
        </div>

        {/* Arrow hint */}
        <ArrowRight className="w-4 h-4 text-gray-200 group-hover:text-indigo-400 transition-colors shrink-0 ml-1" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [drawerBooking, setDrawerBooking] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; booking?: any }>({ open: false });
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: bookings, isLoading } = useListBookings({});
  const checkinM  = useCheckinBooking();
  const checkoutM = useCheckoutBooking();
  const cancelM   = useCancelBooking();
  const deleteM   = useDeleteBooking();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListBookingsQueryKey() });

  const handleCheckin  = (id: number) => checkinM.mutate({ bookingId: id }, {
    onSuccess: () => { invalidate(); toast({ title: "✓ Check-in виконано" }); },
    onError:   (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" }),
  });
  const handleCheckout = (id: number) => checkoutM.mutate({ bookingId: id }, {
    onSuccess: () => { invalidate(); toast({ title: "✓ Check-out виконано" }); },
    onError:   (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" }),
  });
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

  const filtered = (bookings || []).filter(b => {
    const q = search.toLowerCase();
    const matchSearch = !q || b.guestName?.toLowerCase().includes(q) || b.unitName?.toLowerCase().includes(q) || String(b.id).includes(q);
    const matchFilter = filter === "all" || b.status === filter;
    return matchSearch && matchFilter;
  });

  const counts: Record<string, number> = { all: bookings?.length || 0 };
  bookings?.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });

  const openDrawer = useCallback((b: any) => { setDrawerBooking(b); setDrawerOpen(true); }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const inInput = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName || "");
      if (!inInput) {
        if (e.key === "/")     { e.preventDefault(); searchRef.current?.focus(); return; }
        if (e.key === "n")     { e.preventDefault(); setDialog({ open: true }); return; }
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
        <div className="px-6 pt-5 pb-4 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-display">Бронювання</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {counts.all} всього · {counts.checked_in || 0} проживають
              </p>
            </div>
            <button
              onClick={() => setDialog({ open: true })}
              className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/25 transition-colors"
            >
              <Plus className="w-4 h-4" /> Нове
              <kbd className="ml-1 text-[10px] bg-indigo-500/50 px-1 py-0.5 rounded font-mono">N</kbd>
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук за гостем, номером, ID..."
              className="w-full h-9 pl-9 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 font-mono pointer-events-none">/</kbd>
          </div>

          {/* Status chip filters */}
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
                  <span className={`ml-1 text-[10px] ${filter === tab.key ? "opacity-60" : "text-gray-400"}`}>{counts[tab.key]}</span>
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
              {search && <button onClick={() => setSearch("")} className="text-xs text-indigo-500 hover:underline">Скинути пошук</button>}
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl pb-8">
              {filtered.map((b, i) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  isSelected={i === activeIdx || (drawerOpen && drawerBooking?.id === b.id)}
                  onClick={() => { setActiveIdx(i); openDrawer(b); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Shortcuts hint */}
        <div className="hidden md:flex items-center gap-4 px-6 py-2 border-t border-gray-100 bg-gray-50/50 shrink-0">
          {[["N","нове"],["/ ","пошук"],["↑↓","навігація"],["↵","деталі"],["ESC","закрити"]].map(([k,l]) => (
            <div key={k} className="flex items-center gap-1">
              <kbd className="text-[10px] bg-white border border-gray-200 text-gray-400 px-1 py-0.5 rounded font-mono">{k}</kbd>
              <span className="text-[11px] text-gray-400">{l}</span>
            </div>
          ))}
        </div>
      </div>

      <BookingDrawer
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
