import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListUnits, useListBookings } from "@workspace/api-client-react";
import { addDays, format, differenceInDays, startOfDay, isBefore, isAfter } from "date-fns";
import { Button } from "@/components/ui/shared";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const CELL_WIDTH = 64; // px
const ROW_HEIGHT = 56; // px

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-500 border-blue-600 text-white",
  pending: "bg-amber-500 border-amber-600 text-white",
  checked_in: "bg-emerald-500 border-emerald-600 text-white",
  checked_out: "bg-slate-500 border-slate-600 text-white",
  cancelled: "bg-red-500 border-red-600 text-white",
};

export default function Chessboard() {
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const daysToShow = 30;

  const endDate = addDays(startDate, daysToShow);
  
  const { data: units = [] } = useListUnits();
  const { data: bookings = [] } = useListBookings({
    dateFrom: format(startDate, 'yyyy-MM-dd'),
    dateTo: format(endDate, 'yyyy-MM-dd')
  });

  // Generate date headers
  const dates = useMemo(() => {
    return Array.from({ length: daysToShow }).map((_, i) => addDays(startDate, i));
  }, [startDate, daysToShow]);

  // Group units by property/category
  const groupedUnits = useMemo(() => {
    const groups: Record<string, typeof units> = {};
    units.forEach(u => {
      if (!groups[u.category]) groups[u.category] = [];
      groups[u.category].push(u);
    });
    return groups;
  }, [units]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card z-20">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-display font-bold">Chessboard</h1>
            <div className="flex items-center bg-secondary rounded-lg p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStartDate(s => addDays(s, -7))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="px-4 text-sm font-medium">
                {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStartDate(s => addDays(s, 7))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStartDate(startOfDay(new Date()))}>Today</Button>
          </div>
          <Button><Plus className="w-4 h-4 mr-2" /> New Booking</Button>
        </div>

        {/* Grid Container */}
        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <div className="inline-flex flex-col min-w-full">
            
            {/* Header Row (Dates) */}
            <div className="flex sticky top-0 z-10 bg-card border-b border-border shadow-sm">
              <div className="w-64 flex-shrink-0 border-r border-border p-3 flex items-center font-medium sticky left-0 bg-card z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                Units
              </div>
              <div className="flex">
                {dates.map((date, i) => (
                  <div key={i} className="flex flex-col items-center justify-center border-r border-border bg-card" style={{ width: CELL_WIDTH }}>
                    <span className="text-xs text-muted-foreground uppercase">{format(date, 'EEE')}</span>
                    <span className={cn(
                      "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mt-1",
                      format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? "bg-primary text-primary-foreground" : "text-foreground"
                    )}>
                      {format(date, 'd')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Grid Body */}
            <div className="flex flex-col">
              {Object.entries(groupedUnits).map(([category, catUnits]) => (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex bg-secondary/50 sticky left-0 z-10 border-b border-border border-t border-t-transparent">
                    <div className="w-64 p-2 text-xs font-bold uppercase tracking-wider text-muted-foreground sticky left-0 bg-secondary/90 backdrop-blur border-r border-border">
                      {category}
                    </div>
                  </div>
                  
                  {/* Units Rows */}
                  {catUnits.map(unit => {
                    const unitBookings = bookings.filter(b => b.unitId === unit.id);
                    
                    return (
                      <div key={unit.id} className="flex border-b border-border hover:bg-muted/30 transition-colors group">
                        {/* Left fixed column */}
                        <div className="w-64 flex-shrink-0 border-r border-border p-3 flex flex-col justify-center sticky left-0 bg-card group-hover:bg-muted/80 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          <span className="font-semibold text-sm">{unit.name}</span>
                          <span className="text-xs text-muted-foreground flex items-center mt-0.5">
                            <span className={cn("w-2 h-2 rounded-full mr-1.5", 
                              unit.housekeepingStatus === 'clean' ? 'bg-emerald-500' : 
                              unit.housekeepingStatus === 'dirty' ? 'bg-red-500' : 'bg-amber-500'
                            )} />
                            Cap: {unit.capacity}
                          </span>
                        </div>

                        {/* Cells / Bookings row container */}
                        <div className="flex relative" style={{ height: ROW_HEIGHT }}>
                          {/* Background Grid Cells */}
                          {dates.map((_, i) => (
                            <div key={i} className="border-r border-border/50 hover:bg-primary/5 transition-colors cursor-pointer" style={{ width: CELL_WIDTH, height: '100%' }} />
                          ))}

                          {/* Render Booking Blocks */}
                          {unitBookings.map(booking => {
                            const bStart = new Date(booking.checkIn);
                            const bEnd = new Date(booking.checkOut);
                            
                            // Calculate overlap with visible grid
                            const visibleStart = isBefore(bStart, startDate) ? startDate : bStart;
                            const visibleEnd = isAfter(bEnd, endDate) ? endDate : bEnd;
                            
                            if (isBefore(visibleEnd, startDate) || isAfter(visibleStart, endDate)) return null;

                            const startIndex = differenceInDays(visibleStart, startDate);
                            const duration = differenceInDays(visibleEnd, visibleStart);
                            
                            // Visual tweaks: 
                            // Check-in starts halfway through the cell. Check-out ends halfway.
                            const leftOffset = startIndex * CELL_WIDTH + (isBefore(bStart, startDate) ? 0 : CELL_WIDTH / 2);
                            const blockWidth = duration * CELL_WIDTH - (isBefore(bStart, startDate) ? 0 : CELL_WIDTH / 2) + (isAfter(bEnd, endDate) ? CELL_WIDTH / 2 : 0);

                            return (
                              <div
                                key={booking.id}
                                className={cn(
                                  "absolute top-2 bottom-2 rounded-md shadow-sm border flex flex-col justify-center px-2 overflow-hidden cursor-pointer hover:shadow-md hover:brightness-110 transition-all active:scale-[0.98]",
                                  STATUS_COLORS[booking.status] || "bg-primary border-primary text-white"
                                )}
                                style={{ left: leftOffset, width: Math.max(blockWidth, CELL_WIDTH * 0.8) }}
                              >
                                <span className="text-xs font-bold truncate">{booking.guestName || "Guest"}</span>
                                <span className="text-[10px] opacity-80 truncate">{booking.status.replace('_', ' ')}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
