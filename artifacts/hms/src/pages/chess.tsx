import { useState, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListUnits, useListBookings } from "@workspace/api-client-react";
import { addDays, format, differenceInDays, startOfDay, isBefore, isAfter } from "date-fns";
import { uk } from "date-fns/locale";
import { Button } from "@/components/ui/shared";
import { ChevronLeft, ChevronRight, Plus, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const CELL_WIDTH = 40;
const ROW_HEIGHT = 44;
const UNIT_COL_WIDTH = 200;

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-500 border-blue-600 text-white",
  pending: "bg-amber-500 border-amber-600 text-white",
  checked_in: "bg-emerald-500 border-emerald-600 text-white",
  checked_out: "bg-slate-400 border-slate-500 text-white",
  cancelled: "bg-red-400 border-red-500 text-white",
};

const STATUS_UA: Record<string, string> = {
  confirmed: "Підтверджено",
  pending: "Очікує",
  checked_in: "Заселено",
  checked_out: "Виїхав",
  cancelled: "Скасовано",
};

const DAYS_UA_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// ─── Group tabs: display name → DB categories ────────────────────────────────

type GroupTab = {
  id: string;
  label: string;
  shortLabel: string;
  categories: string[];  // matches unit.category in DB
};

const GROUP_TABS: GroupTab[] = [
  {
    id: "all",
    label: "Всі",
    shortLabel: "Всі",
    categories: [],  // empty = show all
  },
  {
    id: "b1",
    label: "Будинки з 1 спальнею",
    shortLabel: "Будинки 1сп",
    categories: ["Будинок 1 спальня"],
  },
  {
    id: "b2",
    label: "Будинок з 2 спальнями",
    shortLabel: "Будинки 2сп",
    categories: ["Будинок 2 спальні"],
  },
  {
    id: "rooms",
    label: "Номери",
    shortLabel: "Номери",
    categories: ["Стандарт", "Люкс", "Бунгало"],
  },
  {
    id: "thermal",
    label: "Термальна Зона",
    shortLabel: "Термальна",
    categories: ["Термальна зона"],
  },
  {
    id: "jacuzzi",
    label: "Джакузі",
    shortLabel: "Джакузі",
    categories: ["Outdoor Jacuzzi"],
  },
  {
    id: "massage",
    label: "Масаж",
    shortLabel: "Масаж",
    categories: ["Масаж", "Шезлонг"],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Chessboard() {
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [activeGroupId, setActiveGroupId] = useState<string>("all");
  const daysToShow = 30;

  const endDate = addDays(startDate, daysToShow);

  const { data: units = [] } = useListUnits();
  const { data: bookings = [] } = useListBookings({
    dateFrom: format(startDate, 'yyyy-MM-dd'),
    dateTo: format(endDate, 'yyyy-MM-dd'),
  });

  const dates = useMemo(() =>
    Array.from({ length: daysToShow }, (_, i) => addDays(startDate, i)),
    [startDate]
  );

  const activeTab = GROUP_TABS.find(t => t.id === activeGroupId) ?? GROUP_TABS[0];

  // Build groups: if a specific tab is selected, show only those categories merged into one group;
  // if "all", show all categories each as their own group.
  const groupedUnits = useMemo(() => {
    if (activeGroupId === "all") {
      const groups: Record<string, typeof units> = {};
      units.forEach(u => {
        if (!groups[u.category]) groups[u.category] = [];
        groups[u.category].push(u);
      });
      return groups;
    }
    // Single group: merge all matching categories
    const matching = units.filter(u => activeTab.categories.includes(u.category));
    if (matching.length === 0) return {};
    return { [activeTab.label]: matching };
  }, [units, activeGroupId, activeTab]);

  const today = format(new Date(), 'yyyy-MM-dd');

  const formatDateRange = () => {
    const s = format(startDate, 'd MMM', { locale: uk });
    const e = format(endDate, 'd MMM yyyy', { locale: uk });
    return `${s} — ${e}`;
  };

  // Count units per group tab for badge display
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = { all: units.length };
    GROUP_TABS.slice(1).forEach(tab => {
      counts[tab.id] = units.filter(u => tab.categories.includes(u.category)).length;
    });
    return counts;
  }, [units]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background">

        {/* ── Toolbar ──────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card z-20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-display font-bold">Шахматка</h1>
            <div className="flex items-center bg-muted rounded-lg overflow-hidden">
              <button
                className="p-1.5 hover:bg-muted-foreground/10 transition-colors"
                onClick={() => setStartDate(s => addDays(s, -7))}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-sm font-medium">{formatDateRange()}</span>
              <button
                className="p-1.5 hover:bg-muted-foreground/10 transition-colors"
                onClick={() => setStartDate(s => addDays(s, 7))}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStartDate(startOfDay(new Date()))}>
              Сьогодні
            </Button>
          </div>
          <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Бронювання</Button>
        </div>

        {/* ── Group Tab Bar ─────────────────────────── */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/80 flex-shrink-0 overflow-x-auto">
          {GROUP_TABS.map(tab => {
            const count = groupCounts[tab.id] ?? 0;
            const isActive = tab.id === activeGroupId;
            // Skip tabs with 0 units (except "all")
            if (tab.id !== "all" && count === 0) return null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveGroupId(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 flex-shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <span>{tab.label}</span>
                {tab.id !== "all" && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-muted-foreground/15 text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {/* Status legend — pushed to right */}
          <div className="ml-auto flex items-center gap-3 pl-3 border-l border-border/50 flex-shrink-0">
            {Object.entries(STATUS_COLORS).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                <span className={`w-2.5 h-2.5 rounded-sm ${v.split(' ')[0]}`} />
                {STATUS_UA[k]}
              </span>
            ))}
          </div>
        </div>

        {/* ── Grid Container ────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <div style={{ minWidth: UNIT_COL_WIDTH + CELL_WIDTH * daysToShow }}>

            {/* Sticky Date Header */}
            <div className="flex sticky top-0 z-20 bg-card border-b border-border shadow-sm">
              {/* Left header cell — shows active group name */}
              <div
                className="flex-shrink-0 border-r border-border flex flex-col justify-center px-3 sticky left-0 bg-card z-30 gap-0.5"
                style={{ width: UNIT_COL_WIDTH, height: ROW_HEIGHT }}
              >
                <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">Група</span>
                <span className="text-xs font-semibold text-foreground truncate">
                  {activeTab.id === "all" ? "Всі юніти" : activeTab.label}
                </span>
              </div>

              {/* Date columns */}
              <div className="flex">
                {dates.map((date, i) => {
                  const isToday = format(date, 'yyyy-MM-dd') === today;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex flex-col items-center justify-center border-r border-border flex-shrink-0",
                        isWeekend && "bg-primary/5",
                      )}
                      style={{ width: CELL_WIDTH, height: ROW_HEIGHT }}
                    >
                      <span className="text-[10px] text-muted-foreground leading-none">
                        {DAYS_UA_SHORT[date.getDay()]}
                      </span>
                      <span className={cn(
                        "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mt-0.5",
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}>
                        {format(date, 'd')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid Body */}
            {Object.keys(groupedUnits).length === 0 ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                Немає юнітів у категорії «{activeTab.label}»
              </div>
            ) : (
              Object.entries(groupedUnits).map(([category, catUnits]) => (
                <div key={category}>
                  {/* Category Header Row */}
                  <div className="flex sticky left-0 z-10 border-b border-border bg-secondary/60">
                    <div
                      className="flex-shrink-0 flex items-center gap-2 px-3 sticky left-0 bg-secondary/90 backdrop-blur border-r border-border"
                      style={{ width: UNIT_COL_WIDTH }}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 flex-1 truncate">
                        {category}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 font-normal">
                        ({catUnits.length})
                      </span>
                    </div>
                    <div className="flex flex-1">
                      {dates.map((_, i) => (
                        <div key={i} className="flex-shrink-0 border-r border-border/30"
                          style={{ width: CELL_WIDTH }} />
                      ))}
                    </div>
                  </div>

                  {/* Unit Rows */}
                  {catUnits.map(unit => {
                    const unitBookings = bookings.filter(b => b.unitId === unit.id);
                    return (
                      <div
                        key={unit.id}
                        className="flex border-b border-border/50 hover:bg-muted/20 transition-colors group"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* Left fixed column */}
                        <div
                          className="flex-shrink-0 border-r border-border flex flex-col justify-center px-3 sticky left-0 bg-card group-hover:bg-muted/40 z-10"
                          style={{ width: UNIT_COL_WIDTH }}
                        >
                          <span className="text-xs font-semibold truncate">{unit.name}</span>
                          <span className="flex items-center gap-1 mt-0.5">
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0",
                              unit.housekeepingStatus === 'clean' ? 'bg-emerald-500' :
                              unit.housekeepingStatus === 'dirty' ? 'bg-red-500' : 'bg-amber-500'
                            )} />
                            <span className="text-[10px] text-muted-foreground">{unit.capacity} ос.</span>
                          </span>
                        </div>

                        {/* Booking cells */}
                        <div className="flex relative flex-1">
                          {dates.map((date, i) => {
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            return (
                              <div
                                key={i}
                                className={cn(
                                  "flex-shrink-0 border-r border-border/40 cursor-pointer hover:bg-primary/8 transition-colors",
                                  isWeekend && "bg-primary/3",
                                )}
                                style={{ width: CELL_WIDTH, height: '100%' }}
                              />
                            );
                          })}

                          {/* Booking blocks */}
                          {unitBookings.map(booking => {
                            const bStart = new Date(booking.checkIn);
                            const bEnd = new Date(booking.checkOut);

                            const visibleStart = isBefore(bStart, startDate) ? startDate : bStart;
                            const visibleEnd = isAfter(bEnd, endDate) ? endDate : bEnd;

                            if (isBefore(visibleEnd, startDate) || isAfter(visibleStart, endDate)) return null;

                            const startIdx = differenceInDays(visibleStart, startDate);
                            const duration = differenceInDays(visibleEnd, visibleStart);

                            const clippedLeft = isBefore(bStart, startDate);
                            const clippedRight = isAfter(bEnd, endDate);

                            const leftOffset = startIdx * CELL_WIDTH + (clippedLeft ? 0 : CELL_WIDTH / 2);
                            const blockWidth = duration * CELL_WIDTH
                              - (clippedLeft ? 0 : CELL_WIDTH / 2)
                              + (clippedRight ? CELL_WIDTH / 2 : 0);

                            if (blockWidth <= 0) return null;

                            return (
                              <div
                                key={booking.id}
                                title={`${booking.guestName} — ${STATUS_UA[booking.status] || booking.status}`}
                                className={cn(
                                  "absolute top-1.5 bottom-1.5 rounded border flex flex-col justify-center px-1.5 overflow-hidden cursor-pointer hover:brightness-110 transition-all active:scale-[0.98] shadow-sm",
                                  STATUS_COLORS[booking.status] || "bg-primary border-primary/50 text-white"
                                )}
                                style={{ left: leftOffset, width: Math.max(blockWidth, 8) }}
                              >
                                <span className="text-[10px] font-semibold truncate leading-tight">
                                  {booking.guestName || "Гість"}
                                </span>
                                {blockWidth > 60 && (
                                  <span className="text-[9px] opacity-75 truncate leading-tight">
                                    {STATUS_UA[booking.status]}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
