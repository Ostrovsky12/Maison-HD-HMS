import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  useGetBookingsCalendar,
  useGetPricingPreview,
  useSearchGuests,
  useCreateBooking,
  useCheckoutBooking,
  useCheckinBooking,
  useCancelBooking,
} from "@workspace/api-client-react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Eye,
  Wind,
  Maximize2,
  Users,
  CalendarCheck,
  CalendarX,
  X,
  Loader2,
  Search,
  Info,
} from "lucide-react";
import { format, addDays, subDays, parseISO, differenceInDays } from "date-fns";
import { uk } from "date-fns/locale";

const DAY_WIDTH = 42;
const ROW_HEIGHT = 48;
const UNIT_COL_WIDTH = 180;
const HEADER_HEIGHT = 56;

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Підтверджено",
  pending: "Очікує",
  checked_in: "Заселений",
  checked_out: "Виселений",
  cancelled: "Скасовано",
};

const STATUS_BADGE_VARIANT: Record<string, string> = {
  confirmed: "default",
  pending: "secondary",
  checked_in: "default",
  checked_out: "outline",
  cancelled: "destructive",
};

function dateStr(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function formatUAH(n: number) {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 0 }).format(n);
}

function daysBetween(a: string, b: string) {
  return differenceInDays(parseISO(b), parseISO(a));
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

interface BookingDetail {
  id: number;
  unitId: number;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  nights: number;
  guestsCount: number;
  totalAmount: number;
  color: string;
}

interface CalendarUnit {
  id: number;
  name: string;
  category: string;
  propertyId: number;
  propertyName: string;
  hasView: boolean;
  hasBalcony: boolean;
  squareMeters?: number | null;
  maxCapacity?: number | null;
}

export default function ChessPage() {
  const { toast } = useToast();
  const [days, setDays] = useState(30);
  const [startDate, setStartDate] = useState(() => dateStr(new Date()));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showOnlyFree, setShowOnlyFree] = useState(false);

  const [dragState, setDragState] = useState<{
    unitId: number;
    startDate: string;
    endDate: string;
  } | null>(null);
  const isDragging = useRef(false);

  const { data: calData, isLoading, refetch } = useGetBookingsCalendar({
    startDate,
    days,
    ...(categoryFilter ? { category: categoryFilter } : {}),
  });

  const units: CalendarUnit[] = calData?.units || [];
  const bookings: BookingDetail[] = calData?.bookings || [];
  const dates: string[] = calData?.dates || [];

  const categories = useMemo(() => {
    const cats = new Set<string>(units.map((u) => u.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [units]);

  const unitsByCategory = useMemo(() => {
    const map = new Map<string, CalendarUnit[]>();
    for (const u of units) {
      const cat = u.category || "Без категорії";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(u);
    }
    return map;
  }, [units]);

  const bookingsByUnit = useMemo(() => {
    const map = new Map<number, BookingDetail[]>();
    for (const b of bookings) {
      if (!map.has(b.unitId)) map.set(b.unitId, []);
      map.get(b.unitId)!.push(b);
    }
    return map;
  }, [bookings]);

  const navigate = (delta: number) => {
    const d = parseISO(startDate);
    setStartDate(dateStr(addDays(d, delta)));
  };

  const goToday = () => setStartDate(dateStr(new Date()));
  const today = dateStr(new Date());

  const [newBooking, setNewBooking] = useState<{
    open: boolean;
    unitId?: number;
    checkIn?: string;
    checkOut?: string;
  }>({ open: false });

  const [detailBooking, setDetailBooking] = useState<BookingDetail | null>(null);

  const handleCellClick = (unitId: number, date: string) => {
    const checkOut = dateStr(addDays(parseISO(date), 1));
    setNewBooking({ open: true, unitId, checkIn: date, checkOut });
  };

  const handleCellMouseDown = (unitId: number, date: string) => {
    isDragging.current = true;
    setDragState({ unitId, startDate: date, endDate: date });
  };

  const handleCellMouseEnter = (unitId: number, date: string) => {
    if (!isDragging.current || !dragState || dragState.unitId !== unitId) return;
    setDragState((prev) => prev ? { ...prev, endDate: date } : prev);
  };

  const handleCellMouseUp = (unitId: number, date: string) => {
    if (!isDragging.current || !dragState || dragState.unitId !== unitId) {
      isDragging.current = false;
      setDragState(null);
      return;
    }
    isDragging.current = false;
    const a = dragState.startDate <= dragState.endDate ? dragState.startDate : dragState.endDate;
    const b = dragState.startDate <= dragState.endDate ? dragState.endDate : dragState.startDate;
    const checkOut = dateStr(addDays(parseISO(b), 1));
    setDragState(null);
    setNewBooking({ open: true, unitId: dragState.unitId, checkIn: a, checkOut });
  };

  const isCellInDrag = (unitId: number, date: string): boolean => {
    if (!dragState || dragState.unitId !== unitId) return false;
    const a = dragState.startDate <= dragState.endDate ? dragState.startDate : dragState.endDate;
    const b = dragState.startDate <= dragState.endDate ? dragState.endDate : dragState.startDate;
    return date >= a && date <= b;
  };

  const handleCheckIn = useMemo(
    () =>
      async (bookingId: number) => {
        await fetch(`/api/bookings/${bookingId}/checkin`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("hms_token")}`,
          },
        })
          .then((r) => r.json())
          .then(() => {
            toast({ title: "Check-in виконано", description: "Гість заселений" });
            refetch();
            setDetailBooking(null);
          })
          .catch(() => toast({ title: "Помилка", variant: "destructive" }));
      },
    [refetch, toast]
  );

  const handleCheckOut = useMemo(
    () =>
      async (bookingId: number) => {
        await fetch(`/api/bookings/${bookingId}/checkout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("hms_token")}`,
          },
        })
          .then((r) => r.json())
          .then(() => {
            toast({ title: "Check-out виконано", description: "Гість виселений" });
            refetch();
            setDetailBooking(null);
          })
          .catch(() => toast({ title: "Помилка", variant: "destructive" }));
      },
    [refetch, toast]
  );

  const handleCancel = useMemo(
    () =>
      async (bookingId: number) => {
        if (!confirm("Скасувати бронювання?")) return;
        await fetch(`/api/bookings/${bookingId}/cancel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("hms_token")}`,
          },
          body: JSON.stringify({ reason: "" }),
        })
          .then((r) => r.json())
          .then(() => {
            toast({ title: "Бронювання скасовано", variant: "destructive" });
            refetch();
            setDetailBooking(null);
          })
          .catch(() => toast({ title: "Помилка", variant: "destructive" }));
      },
    [refetch, toast]
  );

  const orderedCategories = useMemo(() => {
    return Array.from(unitsByCategory.keys());
  }, [unitsByCategory]);

  const flatRows = useMemo(() => {
    type Row =
      | { type: "category"; label: string }
      | { type: "unit"; unit: CalendarUnit };
    const rows: Row[] = [];
    for (const cat of orderedCategories) {
      rows.push({ type: "category", label: cat });
      for (const u of unitsByCategory.get(cat) || []) {
        rows.push({ type: "unit", unit: u });
      }
    }
    return rows;
  }, [orderedCategories, unitsByCategory]);

  const totalHeight = useMemo(() => {
    return flatRows.reduce((acc, r) => acc + (r.type === "category" ? 32 : ROW_HEIGHT), 0);
  }, [flatRows]);

  const rowOffsets = useMemo(() => {
    let y = 0;
    return flatRows.map((r) => {
      const top = y;
      y += r.type === "category" ? 32 : ROW_HEIGHT;
      return top;
    });
  }, [flatRows]);

  const unitRowMap = useMemo(() => {
    const m = new Map<number, number>();
    flatRows.forEach((r, i) => {
      if (r.type === "unit") m.set(r.unit.id, i);
    });
    return m;
  }, [flatRows]);

  return (
    <AppLayout>
      <div
        className="flex flex-col h-full"
        onMouseUp={() => {
          if (isDragging.current) {
            isDragging.current = false;
            setDragState(null);
          }
        }}
      >
        {/* Toolbar */}
        <div className="border-b bg-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center justify-between px-6 py-3 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">Шахматка</h1>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="14">14 днів</SelectItem>
                  <SelectItem value="30">30 днів</SelectItem>
                  <SelectItem value="45">45 днів</SelectItem>
                  <SelectItem value="60">60 днів</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-7)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>Сьогодні</Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(7)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewBooking({ open: true })}>
                <Plus className="w-4 h-4" /> Бронювання
              </Button>
            </div>
          </div>

          {/* Filter row: category badges + legend */}
          <div className="px-6 pb-3 flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium">Категорія:</span>
            <button
              onClick={() => setCategoryFilter("")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !categoryFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Всі ({units.length})
            </button>
            {categories.map((c) => {
              const count = units.filter((u) => u.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(categoryFilter === c ? "" : c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    categoryFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {c} ({count})
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary/25 border border-primary/30 inline-block" />
                Drag → бронювання
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-orange-50/60 border border-orange-100 inline-block" />
                Вихідний
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary/5 border border-primary/20 inline-block" />
                Сьогодні
              </span>
            </div>
          </div>
        </div>

        {/* Chess Grid */}
        <div className="flex-1 overflow-auto">
          {units.length === 0 && !isLoading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Немає даних для відображення
            </div>
          ) : (
            <div className="flex" style={{ minWidth: UNIT_COL_WIDTH + dates.length * DAY_WIDTH }}>
              {/* Sticky left column */}
              <div
                className="flex-shrink-0 sticky left-0 z-20 bg-card border-r border-border"
                style={{ width: UNIT_COL_WIDTH }}
              >
                {/* Header corner */}
                <div
                  className="flex items-end px-3 pb-2 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground"
                  style={{ height: HEADER_HEIGHT }}
                >
                  Об'єкт
                </div>
                {/* Row labels */}
                <div>
                  {flatRows.map((row, i) => (
                    row.type === "category" ? (
                      <div
                        key={`cat-${row.label}`}
                        className="flex items-center px-3 bg-muted/70 border-b border-border"
                        style={{ height: 32 }}
                      >
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{row.label}</span>
                      </div>
                    ) : (
                      <div
                        key={`unit-${row.unit.id}`}
                        className="flex items-center px-3 border-b border-border bg-background hover:bg-accent/30 transition-colors"
                        style={{ height: ROW_HEIGHT }}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{row.unit.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {row.unit.hasView && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Eye className="w-3 h-3 text-blue-400" />
                                </TooltipTrigger>
                                <TooltipContent>Вид</TooltipContent>
                              </Tooltip>
                            )}
                            {row.unit.hasBalcony && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Wind className="w-3 h-3 text-green-400" />
                                </TooltipTrigger>
                                <TooltipContent>Балкон</TooltipContent>
                              </Tooltip>
                            )}
                            {row.unit.squareMeters && (
                              <span className="text-[10px] text-muted-foreground">{row.unit.squareMeters}м²</span>
                            )}
                            {row.unit.maxCapacity && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                    <Users className="w-2.5 h-2.5" />{row.unit.maxCapacity}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Макс. осіб</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>

              {/* Scrollable calendar area */}
              <div className="flex-1 overflow-x-auto">
                {/* Date headers */}
                <div
                  className="flex sticky top-0 z-10 bg-card border-b border-border"
                  style={{ height: HEADER_HEIGHT }}
                >
                  {dates.map((d) => {
                    const dt = parseISO(d);
                    const isToday = d === today;
                    const dow = format(dt, "EE", { locale: uk });
                    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                    return (
                      <div
                        key={d}
                        className={`flex-shrink-0 flex flex-col items-center justify-end pb-2 border-r border-border text-xs gap-0.5 ${
                          isToday ? "bg-primary/10" : isWeekend ? "bg-orange-50/50" : ""
                        }`}
                        style={{ width: DAY_WIDTH }}
                      >
                        <span className={`font-semibold ${isToday ? "text-primary" : isWeekend ? "text-orange-600" : "text-muted-foreground"}`}>
                          {format(dt, "d")}
                        </span>
                        <span className={`text-[10px] uppercase ${isToday ? "text-primary" : isWeekend ? "text-orange-500" : "text-muted-foreground/60"}`}>
                          {dow}
                        </span>
                        {isToday && <span className="absolute bottom-0 w-px h-full bg-primary/30 left-1/2" />}
                      </div>
                    );
                  })}
                </div>

                {/* Booking grid — relative container for booking blocks */}
                <div className="relative" style={{ height: totalHeight }}>
                  {/* Background rows & cells */}
                  {flatRows.map((row, i) => {
                    const top = rowOffsets[i];
                    const h = row.type === "category" ? 32 : ROW_HEIGHT;
                    return (
                      <div
                        key={i}
                        className={`absolute w-full border-b border-border flex ${row.type === "category" ? "bg-muted/50" : ""}`}
                        style={{ top, height: h }}
                      >
                        {row.type === "unit" && dates.map((d) => {
                          const dt = parseISO(d);
                          const isToday = d === today;
                          const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                          const inDrag = isCellInDrag(row.unit.id, d);
                          return (
                            <div
                              key={d}
                              className={`flex-shrink-0 border-r border-border cursor-pointer transition-colors select-none ${
                                inDrag
                                  ? "bg-primary/25 border-primary/30"
                                  : isToday
                                  ? "bg-primary/5 hover:bg-primary/10"
                                  : isWeekend
                                  ? "bg-orange-50/30 hover:bg-orange-50/60"
                                  : "hover:bg-primary/5"
                              }`}
                              style={{ width: DAY_WIDTH, height: h }}
                              onMouseDown={() => handleCellMouseDown(row.unit.id, d)}
                              onMouseEnter={() => handleCellMouseEnter(row.unit.id, d)}
                              onMouseUp={() => handleCellMouseUp(row.unit.id, d)}
                              onClick={() => {
                                if (!isDragging.current) handleCellClick(row.unit.id, d);
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Booking blocks */}
                  {bookings.map((b) => {
                    const rowIdx = unitRowMap.get(b.unitId);
                    if (rowIdx === undefined) return null;

                    const rowTop = rowOffsets[rowIdx];
                    const startOffset = clamp(daysBetween(startDate, b.checkIn), 0, dates.length);
                    const endOffset = clamp(daysBetween(startDate, b.checkOut), 0, dates.length);
                    const width = (endOffset - startOffset) * DAY_WIDTH;
                    if (width <= 0) return null;

                    const left = startOffset * DAY_WIDTH;
                    const top = rowTop + 4;
                    const height = ROW_HEIGHT - 8;

                    const isActive = b.status === "checked_in";
                    const isCancelled = b.status === "cancelled";

                    return (
                      <Tooltip key={b.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute rounded cursor-pointer flex items-center px-2 gap-1.5 text-white text-xs font-medium overflow-hidden shadow-sm hover:shadow-md hover:brightness-105 transition-all select-none ${isCancelled ? "opacity-40" : ""}`}
                            style={{
                              left,
                              top,
                              width: width - 2,
                              height,
                              backgroundColor: b.color,
                              border: isActive ? `2px solid ${b.color}` : "none",
                              outline: isActive ? "2px solid white" : "none",
                              outlineOffset: "-4px",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailBooking(b);
                            }}
                          >
                            <span className="truncate">{b.guestName}</span>
                            {b.nights > 1 && (
                              <span className="text-white/70 flex-shrink-0">·{b.nights}н</span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56">
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold">{b.guestName}</p>
                            <p>{b.checkIn} → {b.checkOut} ({b.nights} ніч{b.nights === 1 ? "" : b.nights < 5 ? "і" : "ей"})</p>
                            <p>{b.guestsCount} гість · {formatUAH(b.totalAmount)}</p>
                            <p className="text-white/80">{STATUS_LABELS[b.status] || b.status}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Booking Detail Dialog */}
      {detailBooking && (
        <Dialog open onOpenChange={() => setDetailBooking(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Бронювання #{detailBooking.id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Гість</p>
                  <p className="font-medium">{detailBooking.guestName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Статус</p>
                  <Badge variant={STATUS_BADGE_VARIANT[detailBooking.status] as any || "default"}>
                    {STATUS_LABELS[detailBooking.status] || detailBooking.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Check-in</p>
                  <p className="font-medium">{detailBooking.checkIn}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Check-out</p>
                  <p className="font-medium">{detailBooking.checkOut}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Ночей</p>
                  <p className="font-medium">{detailBooking.nights}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Гостей</p>
                  <p className="font-medium">{detailBooking.guestsCount}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs mb-1">Сума</p>
                  <p className="font-semibold text-base">{formatUAH(detailBooking.totalAmount)}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {detailBooking.status === "confirmed" && (
                  <Button size="sm" className="gap-1.5" onClick={() => handleCheckIn(detailBooking.id)}>
                    <CalendarCheck className="w-4 h-4" /> Check-in
                  </Button>
                )}
                {detailBooking.status === "checked_in" && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleCheckOut(detailBooking.id)}>
                    <CalendarX className="w-4 h-4" /> Check-out
                  </Button>
                )}
                {(detailBooking.status === "confirmed" || detailBooking.status === "pending") && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => handleCancel(detailBooking.id)}>
                    <X className="w-4 h-4" /> Скасувати
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* New Booking Dialog – always mounted, open controlled via prop */}
      <NewBookingDialog
        open={newBooking.open}
        units={units}
        initialUnitId={newBooking.unitId}
        initialCheckIn={newBooking.checkIn}
        initialCheckOut={newBooking.checkOut}
        onClose={() => setNewBooking({ open: false })}
        onCreated={() => {
          setNewBooking({ open: false });
          refetch();
          toast({ title: "Бронювання створено" });
        }}
      />
    </AppLayout>
  );
}

function NewBookingDialog({
  open,
  units,
  initialUnitId,
  initialCheckIn,
  initialCheckOut,
  onClose,
  onCreated,
}: {
  open: boolean;
  units: CalendarUnit[];
  initialUnitId?: number;
  initialCheckIn?: string;
  initialCheckOut?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [guestSearch, setGuestSearch] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null);
  const [selectedGuestName, setSelectedGuestName] = useState("");
  const [unitId, setUnitId] = useState(initialUnitId ? String(initialUnitId) : "");
  const [checkIn, setCheckIn] = useState(initialCheckIn || dateStr(new Date()));
  const [checkOut, setCheckOut] = useState(initialCheckOut || dateStr(addDays(new Date(), 1)));
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("direct");
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);

  useEffect(() => {
    if (open) {
      setGuestSearch("");
      setSelectedGuestId(null);
      setSelectedGuestName("");
      setUnitId(initialUnitId ? String(initialUnitId) : "");
      setCheckIn(initialCheckIn || dateStr(new Date()));
      setCheckOut(initialCheckOut || dateStr(addDays(new Date(), 1)));
      setNotes("");
      setSource("direct");
      setShowGuestDropdown(false);
    }
  }, [open]);

  const { data: guestResults } = useSearchGuests(
    { q: guestSearch, limit: 8 },
    { query: { enabled: guestSearch.length >= 2 } }
  );

  const { data: pricing } = useGetPricingPreview(
    { checkIn, checkOut, unitId: parseInt(unitId) || 0 },
    { query: { enabled: !!unitId && !!checkIn && !!checkOut && checkIn < checkOut } }
  );

  const createBooking = useCreateBooking();

  const handleCreate = () => {
    if (!selectedGuestId || !unitId || !checkIn || !checkOut) {
      toast({ title: "Заповніть усі поля", variant: "destructive" });
      return;
    }
    if (checkIn >= checkOut) {
      toast({ title: "Дата виїзду має бути після дати заїзду", variant: "destructive" });
      return;
    }
    createBooking.mutate(
      {
        data: {
          guestId: selectedGuestId,
          unitId: parseInt(unitId),
          checkIn,
          checkOut,
          guestsCount: 2,
          source: source as any,
          totalAmount: pricing?.totalAmount || 0,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => onCreated(),
        onError: (e: any) => {
          toast({ title: "Помилка", description: e.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Нове бронювання</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Guest Search */}
          <div className="space-y-1.5 relative">
            <Label>Гість</Label>
            {selectedGuestId ? (
              <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                <span className="text-sm font-medium">{selectedGuestName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => { setSelectedGuestId(null); setSelectedGuestName(""); setGuestSearch(""); }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Пошук за іменем, телефоном..."
                    value={guestSearch}
                    onChange={(e) => {
                      setGuestSearch(e.target.value);
                      setShowGuestDropdown(true);
                    }}
                    onFocus={() => setShowGuestDropdown(true)}
                  />
                </div>
                {showGuestDropdown && guestResults?.guests && guestResults.guests.length > 0 && (
                  <div className="absolute z-50 w-full bg-popover border border-border rounded-md shadow-lg mt-1 max-h-52 overflow-y-auto">
                    {guestResults.guests.map((g) => (
                      <div
                        key={g.id}
                        className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center justify-between"
                        onClick={() => {
                          setSelectedGuestId(g.id);
                          setSelectedGuestName(`${g.firstName} ${g.lastName}`);
                          setShowGuestDropdown(false);
                          setGuestSearch("");
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium">{g.firstName} {g.lastName}</p>
                          <p className="text-xs text-muted-foreground">{g.phone || g.email || "—"}</p>
                        </div>
                        {g.loyaltyLevel && (
                          <Badge variant="outline" className="text-xs capitalize">{g.loyaltyLevel}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Unit */}
          <div className="space-y-1.5">
            <Label>Об'єкт</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть номер/будинок" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} · {u.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Заїзд</Label>
              <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Виїзд</Label>
              <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label>Джерело</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Пряме бронювання</SelectItem>
                <SelectItem value="phone">Телефон</SelectItem>
                <SelectItem value="booking.com">Booking.com</SelectItem>
                <SelectItem value="airbnb">Airbnb</SelectItem>
                <SelectItem value="other">Інше</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Нотатки</Label>
            <Input
              placeholder="Побажання, особливості..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Pricing Preview */}
          {pricing && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Info className="w-4 h-4 text-primary" />
                Розрахунок вартості
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Ночей</p>
                  <p className="font-semibold">{pricing.nights}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Середня ціна</p>
                  <p className="font-semibold">{formatUAH(pricing.avgNightPrice)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Всього</p>
                  <p className="font-semibold text-primary">{formatUAH(pricing.totalAmount)}</p>
                </div>
              </div>
              {pricing.breakdown.length > 0 && pricing.breakdown[0].seasonFactor !== 1 && (
                <p className="text-xs text-muted-foreground">{pricing.breakdown[0].label}</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleCreate} disabled={createBooking.isPending}>
            {createBooking.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Створити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
