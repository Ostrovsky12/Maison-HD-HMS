import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListBookings } from "@workspace/api-client-react";
import { Card, Badge, Button, Input } from "@/components/ui/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Search, LogOut, Eye, Users, BedDouble,
  AlertCircle, QrCode, Loader2, RefreshCw,
  ChevronDown, ChevronUp, ChevronsUpDown,
  LogIn, Info, X,
} from "lucide-react";
import { BookingDetailModal } from "@/components/bookings/booking-detail-modal";

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_UA: Record<string, string> = {
  direct: "Прямий",
  booking: "Booking.com",
  airbnb: "Airbnb",
  other: "Інший",
};

const SOURCE_COLOR: Record<string, string> = {
  direct: "bg-violet-500/15 text-violet-700",
  booking: "bg-blue-500/15 text-blue-700",
  airbnb: "bg-rose-500/15 text-rose-700",
  other: "bg-slate-500/15 text-slate-600",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nightsUntilCheckout(checkOut: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = new Date(checkOut);
  out.setHours(0, 0, 0, 0);
  return Math.ceil((out.getTime() - today.getTime()) / 86400000);
}

function totalNights(checkIn: string, checkOut: string): number {
  const i = new Date(checkIn);
  const o = new Date(checkOut);
  return Math.ceil((o.getTime() - i.getTime()) / 86400000);
}

function formatDateUK(iso: string) {
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Booking = {
  id: number;
  guestName?: string;
  unitName?: string;
  checkIn: string;
  checkOut: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  notes?: string;
  source?: string;
  guestsCount?: number;
};

type SortKey = "unitName" | "guestName" | "checkIn" | "checkOut" | "nightsLeft" | "balance";
type SortDir = "asc" | "desc";

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortableHeader({
  label, field, sortKey, sortDir, onSort
}: {
  label: string;
  field: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (f: SortKey) => void;
}) {
  const active = sortKey === field;
  return (
    <th
      className="px-3 py-3 text-left cursor-pointer select-none group"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
        <span className="opacity-40 group-hover:opacity-100 transition-opacity">
          {active ? (
            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronsUpDown className="w-3 h-3" />
          )}
        </span>
      </div>
    </th>
  );
}

function NightsLeftBadge({ n }: { n: number }) {
  if (n < 0)
    return (
      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold bg-red-500/15 text-red-600">
        {n}
      </span>
    );
  if (n === 0)
    return (
      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-700">
        сьогодні
      </span>
    );
  if (n === 1)
    return (
      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold bg-amber-400/15 text-amber-600">
        1
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-700">
      {n}
    </span>
  );
}

function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-muted-foreground font-medium"
      >
        <span className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Легенда кольорів
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-background grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-amber-500/20 border border-amber-400/40 shrink-0" />
            <span className="text-muted-foreground">Виїзд сьогодні</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-red-500/15 border border-red-400/30 shrink-0" />
            <span className="text-muted-foreground">Термін проживання минув</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-violet-500/10 border border-violet-400/30 shrink-0" />
            <span className="text-muted-foreground">Очікує заселення</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded bg-red-500 shrink-0" />
            <span className="text-muted-foreground">Є заборгованість</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded bg-emerald-500 shrink-0" />
            <span className="text-muted-foreground">Повністю оплачено</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="warning" className="text-[10px] py-0">Очікує</Badge>
            <span className="text-muted-foreground">Підтверджено, не заселено</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-[10px] py-0">Заселено</Badge>
            <span className="text-muted-foreground">Гість в готелі</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

function GuestsTable({
  rows,
  today,
  onView,
  onCheckIn,
  onCheckout,
  checkingOut,
  checkingIn,
  showCheckinAction = false,
}: {
  rows: Booking[];
  today: string;
  onView: (b: Booking) => void;
  onCheckIn?: (id: number) => void;
  onCheckout?: (id: number) => void;
  checkingOut: number | null;
  checkingIn: number | null;
  showCheckinAction?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback((field: SortKey) => {
    setSortKey(prev => {
      if (prev === field) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return field;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      if (sortKey === "unitName") { av = a.unitName || ""; bv = b.unitName || ""; }
      if (sortKey === "guestName") { av = a.guestName || ""; bv = b.guestName || ""; }
      if (sortKey === "checkIn") { av = a.checkIn; bv = b.checkIn; }
      if (sortKey === "checkOut") { av = a.checkOut; bv = b.checkOut; }
      if (sortKey === "nightsLeft") { av = nightsUntilCheckout(a.checkOut); bv = nightsUntilCheckout(b.checkOut); }
      if (sortKey === "balance") { av = a.totalAmount - a.paidAmount; bv = b.totalAmount - b.paidAmount; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <SortableHeader label="Кімната" field="unitName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Гість" field="guestName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground text-center">Гостей</th>
            <SortableHeader label="Заїзд" field="checkIn" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Виїзд" field="checkOut" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground text-center">Ночей</th>
            <SortableHeader label="Зал." field="nightsLeft" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground">Джерело</th>
            <th className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground">Сума</th>
            <th className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground">Оплачено</th>
            <SortableHeader label="Борг" field="balance" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground">Статус</th>
            <th className="px-3 py-3 text-xs font-semibold uppercase text-muted-foreground">Дії</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map(b => {
            const balance = b.totalAmount - b.paidAmount;
            const nTotal = totalNights(b.checkIn, b.checkOut);
            const nLeft = nightsUntilCheckout(b.checkOut);
            const isCheckoutToday = b.checkOut === today;
            const isOverdue = nLeft < 0;
            const isConfirmed = b.status === "confirmed";

            let rowBg = "hover:bg-muted/20";
            if (isConfirmed) rowBg = "bg-violet-500/5 hover:bg-violet-500/10";
            else if (isOverdue) rowBg = "bg-red-500/5 hover:bg-red-500/10";
            else if (isCheckoutToday) rowBg = "bg-amber-500/5 hover:bg-amber-500/10";

            return (
              <tr key={b.id} className={`transition-colors ${rowBg}`}>
                {/* Room */}
                <td className="px-3 py-3">
                  <div className="font-semibold text-primary">{b.unitName || "—"}</div>
                </td>

                {/* Guest */}
                <td className="px-3 py-3">
                  <div className="font-medium">{b.guestName || "—"}</div>
                  {b.notes && (
                    <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={b.notes}>
                      {b.notes}
                    </div>
                  )}
                </td>

                {/* Guests count */}
                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span className="text-xs">{b.guestsCount || 1}</span>
                  </div>
                </td>

                {/* Check-in */}
                <td className="px-3 py-3 whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateUK(b.checkIn)}
                </td>

                {/* Check-out */}
                <td className="px-3 py-3 whitespace-nowrap text-sm">
                  <div className={isCheckoutToday ? "text-amber-700 font-semibold" : isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                    {formatDateUK(b.checkOut)}
                  </div>
                  {isCheckoutToday && <div className="text-[10px] text-amber-600 mt-0.5">виїзд сьогодні!</div>}
                  {isOverdue && <div className="text-[10px] text-red-500 mt-0.5">прострочено!</div>}
                </td>

                {/* Total nights */}
                <td className="px-3 py-3 text-center text-muted-foreground text-sm">{nTotal}</td>

                {/* Nights left */}
                <td className="px-3 py-3 text-center">
                  <NightsLeftBadge n={nLeft} />
                </td>

                {/* Source */}
                <td className="px-3 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLOR[b.source || "direct"] || SOURCE_COLOR.other}`}>
                    {SOURCE_UA[b.source || "direct"] || b.source}
                  </span>
                </td>

                {/* Total */}
                <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                  {formatCurrency(b.totalAmount)}
                </td>

                {/* Paid */}
                <td className="px-3 py-3 whitespace-nowrap text-sm text-emerald-600 font-medium">
                  {formatCurrency(b.paidAmount)}
                </td>

                {/* Balance */}
                <td className="px-3 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1 h-5 rounded-full shrink-0 ${balance > 0 ? "bg-red-500" : "bg-emerald-500"}`} />
                    {balance > 0 ? (
                      <span className="text-sm font-bold text-red-500">{formatCurrency(balance)}</span>
                    ) : (
                      <span className="text-xs text-emerald-600">Сплачено</span>
                    )}
                  </div>
                </td>

                {/* Status */}
                <td className="px-3 py-3">
                  <Badge variant={b.status === "checked_in" ? "success" : "warning"} className="text-[10px]">
                    {b.status === "checked_in" ? "Заселено" : "Очікує"}
                  </Badge>
                </td>

                {/* Actions */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-0.5">
                    <button
                      title="Переглянути деталі"
                      onClick={() => onView(b)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      title="QR / Оплата"
                      onClick={() => onView(b)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                    {showCheckinAction && isConfirmed && onCheckIn && (
                      <button
                        title="Заселити"
                        onClick={() => onCheckIn(b.id)}
                        disabled={checkingIn === b.id}
                        className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {checkingIn === b.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <LogIn className="w-4 h-4" />
                        }
                      </button>
                    )}
                    {b.status !== "checked_out" && !isConfirmed && onCheckout && (
                      <button
                        title="Оформити виїзд"
                        onClick={() => onCheckout(b.id)}
                        disabled={checkingOut === b.id}
                        className="p-1.5 rounded-lg hover:bg-amber-500/15 text-muted-foreground hover:text-amber-700 transition-colors disabled:opacity-50"
                      >
                        {checkingOut === b.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <LogOut className="w-4 h-4" />
                        }
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  count,
  accent,
  defaultOpen = true,
  children,
  footer,
}: {
  title: string;
  count: number;
  accent?: "amber" | "emerald" | "violet";
  defaultOpen?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const accentClass = {
    amber: "border-l-amber-500 bg-amber-500/5",
    emerald: "border-l-emerald-500 bg-emerald-500/5",
    violet: "border-l-violet-500 bg-violet-500/5",
  }[accent || "emerald"] || "";

  const badgeClass = {
    amber: "bg-amber-500/15 text-amber-700",
    emerald: "bg-emerald-500/15 text-emerald-700",
    violet: "bg-violet-500/15 text-violet-700",
  }[accent || "emerald"] || "";

  return (
    <Card className={`overflow-hidden border-l-4 ${accentClass}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm">{title}</h2>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>{count}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <>
          {children}
          {footer && <div className="px-5 py-3 border-t border-border">{footer}</div>}
        </>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LivingGuests() {
  const [search, setSearch] = useState("");
  const [onlyLiving, setOnlyLiving] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);
  const [checkingIn, setCheckingIn] = useState<number | null>(null);

  const { data: bookings = [], isLoading, refetch } = useListBookings();

  const API_BASE = "";
  const getToken = () => localStorage.getItem("hms_token") || "";

  const today = new Date().toISOString().split("T")[0];

  const todayFormatted = new Date().toLocaleDateString("uk-UA", {
    day: "numeric", month: "long", year: "numeric"
  });

  // Split bookings into two buckets
  const { unsaved, living } = useMemo(() => {
    const unsaved: Booking[] = [];
    const living: Booking[] = [];
    for (const b of bookings) {
      if (b.status === "confirmed" && b.checkIn <= today) {
        unsaved.push(b as Booking);
      } else if (b.status === "checked_in") {
        living.push(b as Booking);
      }
    }
    return { unsaved, living };
  }, [bookings, today]);

  // Filtering
  const filterRow = useCallback((b: Booking) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      b.guestName?.toLowerCase().includes(s) ||
      b.unitName?.toLowerCase().includes(s) ||
      b.notes?.toLowerCase().includes(s)
    );
  }, [search]);

  const filteredUnsaved = useMemo(() => unsaved.filter(filterRow), [unsaved, filterRow]);
  const filteredLiving = useMemo(() => living.filter(filterRow), [living, filterRow]);

  // Stats
  const totalRevenue = living.reduce((s, b) => s + b.totalAmount, 0);
  const totalBalance = living.reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0);
  const checkingOutToday = living.filter(b => b.checkOut === today).length;
  const overdueCount = living.filter(b => nightsUntilCheckout(b.checkOut) < 0).length;

  const handleCheckout = async (bookingId: number) => {
    setCheckingOut(bookingId);
    try {
      await fetch(`${API_BASE}/api/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: "checked_out" }),
      });
      await refetch();
    } finally {
      setCheckingOut(null);
    }
  };

  const handleCheckIn = async (bookingId: number) => {
    setCheckingIn(bookingId);
    try {
      await fetch(`${API_BASE}/api/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: "checked_in" }),
      });
      await refetch();
    } finally {
      setCheckingIn(null);
    }
  };

  const allCount = (onlyLiving ? 0 : filteredUnsaved.length) + filteredLiving.length;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-[1700px] mx-auto space-y-5">

        {/* ── Header ───────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Мешкаючі гості</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Проживаючі на <span className="font-medium text-foreground">{todayFormatted}</span>
              {" "}· по гостям
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Оновити
          </Button>
        </div>

        {/* ── Stats row ────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-500/10">
              <BedDouble className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{living.length}</div>
              <div className="text-xs text-muted-foreground">Зараз у готелі</div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <LogOut className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{checkingOutToday}</div>
              <div className="text-xs text-muted-foreground">Виїзд сьогодні</div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10">
              <LogIn className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{unsaved.length}</div>
              <div className="text-xs text-muted-foreground">Очікує заселення</div>
            </div>
          </div>
          <div className={`bg-card border rounded-xl px-4 py-3 flex items-center gap-3 ${totalBalance > 0 ? "border-red-400/40 bg-red-500/5" : "border-border"}`}>
            <div className={`p-2.5 rounded-lg ${totalBalance > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
              <AlertCircle className={`w-4 h-4 ${totalBalance > 0 ? "text-red-500" : "text-emerald-500"}`} />
            </div>
            <div>
              <div className={`text-xl font-bold ${totalBalance > 0 ? "text-red-500" : "text-emerald-600"}`}>
                {formatCurrency(totalBalance)}
              </div>
              <div className="text-xs text-muted-foreground">
                {overdueCount > 0 ? `Борг · ${overdueCount} прострочено` : totalBalance > 0 ? "Загальний борг" : "Без боргів"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Legend ───────────────────────────────── */}
        <Legend />

        {/* ── Search / Filter bar ──────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Пошук гостя, кімнати..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div
              onClick={() => setOnlyLiving(o => !o)}
              className={`w-9 h-5 rounded-full transition-colors relative ${onlyLiving ? "bg-violet-500" : "bg-muted-foreground/30"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${onlyLiving ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              Тільки проживаючі
            </span>
          </label>

          {search && (
            <span className="text-xs text-muted-foreground">
              Знайдено: {allCount}
            </span>
          )}
        </div>

        {/* ── Loading ───────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Завантаження...
          </div>
        )}

        {!isLoading && (
          <>
            {/* ── Section 1: Незбережені картки ──────── */}
            {!onlyLiving && filteredUnsaved.length > 0 && (
              <Section
                title="Незбережені картки гостя"
                count={filteredUnsaved.length}
                accent="violet"
                defaultOpen={true}
                footer={
                  <p className="text-xs text-muted-foreground">
                    Підтверджені бронювання, що очікують заселення сьогодні або раніше
                  </p>
                }
              >
                <GuestsTable
                  rows={filteredUnsaved}
                  today={today}
                  onView={setSelectedBooking}
                  onCheckIn={handleCheckIn}
                  checkingOut={checkingOut}
                  checkingIn={checkingIn}
                  showCheckinAction
                />
              </Section>
            )}

            {/* ── Section 2: Проживаючі ─────────────── */}
            <Section
              title={`Проживаючі на ${todayFormatted} по гостям`}
              count={filteredLiving.length}
              accent="emerald"
              defaultOpen={true}
              footer={
                filteredLiving.length > 0 ? (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Показано: {filteredLiving.length} з {living.length} мешканців</span>
                    <span className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-400/40 inline-block" />
                        Виїзд сьогодні ({checkingOutToday})
                      </span>
                      {overdueCount > 0 && (
                        <span className="flex items-center gap-1.5 text-red-500">
                          <span className="w-3 h-3 rounded bg-red-500/20 border border-red-400/30 inline-block" />
                          Прострочено ({overdueCount})
                        </span>
                      )}
                    </span>
                  </div>
                ) : undefined
              }
            >
              {filteredLiving.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <BedDouble className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">
                    {search ? `Жодного гостя з "${search}"` : "Зараз у готелі нема мешканців"}
                  </div>
                </div>
              ) : (
                <GuestsTable
                  rows={filteredLiving}
                  today={today}
                  onView={setSelectedBooking}
                  onCheckout={handleCheckout}
                  checkingOut={checkingOut}
                  checkingIn={checkingIn}
                />
              )}
            </Section>

            {/* Empty overall state */}
            {filteredLiving.length === 0 && filteredUnsaved.length === 0 && !search && (
              <div className="text-center py-16 text-muted-foreground">
                <BedDouble className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <div className="text-base font-medium">Готель порожній</div>
                <div className="text-sm mt-1">Немає активних бронювань на сьогодні</div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </AppLayout>
  );
}
