import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListBookings } from "@workspace/api-client-react";
import { Card, Badge, Button, Input } from "@/components/ui/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Search, LogOut, CreditCard, Eye, Users, BedDouble,
  TrendingUp, AlertCircle, QrCode, Loader2, RefreshCw
} from "lucide-react";
import { BookingDetailModal } from "@/components/bookings/booking-detail-modal";

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

export default function LivingGuests() {
  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);
  const { data: bookings = [], isLoading, refetch } = useListBookings();

  const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const getToken = () => localStorage.getItem("hms_token") || "";

  // Filter only checked-in guests + those arriving today
  const today = new Date().toISOString().split("T")[0];
  const living = useMemo(() => {
    return bookings.filter(b =>
      b.status === "checked_in" ||
      (b.status === "confirmed" && b.checkIn <= today)
    );
  }, [bookings, today]);

  const filtered = useMemo(() => {
    if (!search) return living;
    const s = search.toLowerCase();
    return living.filter(b =>
      b.guestName?.toLowerCase().includes(s) ||
      b.unitName?.toLowerCase().includes(s)
    );
  }, [living, search]);

  // Stats
  const totalRevenue = living.reduce((s, b) => s + b.totalAmount, 0);
  const totalBalance = living.reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0);
  const unpaidCount = living.filter(b => b.paymentStatus !== "paid").length;
  const checkingOutToday = living.filter(b => b.checkOut === today).length;

  const handleCheckout = async (bookingId: number) => {
    setCheckingOut(bookingId);
    try {
      await fetch(`${API_BASE}/api/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ status: "checked_out" }),
      });
      refetch();
    } finally {
      setCheckingOut(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Мешкаючі гості</h1>
            <p className="text-muted-foreground mt-1">
              Гості, що зараз перебувають у готелі — {today}
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Оновити
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-violet-500/10">
              <BedDouble className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{living.length}</div>
              <div className="text-xs text-muted-foreground">Зараз у готелі</div>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10">
              <LogOut className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{checkingOutToday}</div>
              <div className="text-xs text-muted-foreground">Виїзд сьогодні</div>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <div className="text-xs text-muted-foreground">Загальна виручка</div>
            </div>
          </Card>
          <Card className={`p-4 flex items-center gap-4 ${totalBalance > 0 ? "border-red-500/30 bg-red-500/5" : ""}`}>
            <div className={`p-3 rounded-xl ${totalBalance > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
              <AlertCircle className={`w-5 h-5 ${totalBalance > 0 ? "text-red-500" : "text-emerald-500"}`} />
            </div>
            <div>
              <div className={`text-2xl font-bold ${totalBalance > 0 ? "text-red-500" : "text-emerald-600"}`}>
                {formatCurrency(totalBalance)}
              </div>
              <div className="text-xs text-muted-foreground">
                {unpaidCount > 0 ? `Борг (${unpaidCount} бронювань)` : "Всі оплатили"}
              </div>
            </div>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <div className="p-4 border-b border-border">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Пошук за гостем або юнітом..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Гість</th>
                  <th className="px-4 py-3">Юніт</th>
                  <th className="px-4 py-3 text-center">Гостей</th>
                  <th className="px-4 py-3">Заїзд</th>
                  <th className="px-4 py-3">Виїзд</th>
                  <th className="px-4 py-3 text-center">Ночей</th>
                  <th className="px-4 py-3 text-center">Ночей залишилось</th>
                  <th className="px-4 py-3">Сума</th>
                  <th className="px-4 py-3">Оплачено</th>
                  <th className="px-4 py-3">Борг</th>
                  <th className="px-4 py-3">Джерело</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={13} className="text-center py-10 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Завантаження...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-10">
                      <BedDouble className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                      <div className="text-muted-foreground">
                        {search ? "Гостей не знайдено" : "Зараз у готелі нема мешканців"}
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(b => {
                  const balance = b.totalAmount - b.paidAmount;
                  const nTotal = totalNights(b.checkIn, b.checkOut);
                  const nLeft = nightsUntilCheckout(b.checkOut);
                  const isCheckoutToday = b.checkOut === today;
                  const isOverdue = nLeft < 0;

                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-muted/30 transition-colors group ${isCheckoutToday ? "bg-amber-500/5" : ""} ${isOverdue ? "bg-red-500/5" : ""}`}
                    >
                      {/* Guest */}
                      <td className="px-4 py-3">
                        <div className="font-semibold">{b.guestName || "—"}</div>
                        {b.notes && (
                          <div className="text-xs text-muted-foreground truncate max-w-[160px]" title={b.notes}>
                            {b.notes}
                          </div>
                        )}
                      </td>

                      {/* Unit */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-primary">{b.unitName || "—"}</div>
                      </td>

                      {/* Guests count */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          <span>{b.guestsCount || 1}</span>
                        </div>
                      </td>

                      {/* Check-in */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{formatDate(b.checkIn)}</td>

                      {/* Check-out */}
                      <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${isCheckoutToday ? "text-amber-600" : isOverdue ? "text-red-600" : ""}`}>
                        {formatDate(b.checkOut)}
                        {isCheckoutToday && <div className="text-xs font-normal text-amber-500">сьогодні!</div>}
                        {isOverdue && <div className="text-xs font-normal text-red-500">прострочено!</div>}
                      </td>

                      {/* Total nights */}
                      <td className="px-4 py-3 text-center text-muted-foreground">{nTotal}</td>

                      {/* Nights left */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          nLeft <= 0 ? "bg-red-500/15 text-red-600" :
                          nLeft === 1 ? "bg-amber-500/15 text-amber-600" :
                          "bg-emerald-500/15 text-emerald-700"
                        }`}>
                          {nLeft}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{formatCurrency(b.totalAmount)}</td>

                      {/* Paid */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-emerald-600 font-medium">{formatCurrency(b.paidAmount)}</span>
                      </td>

                      {/* Balance */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {balance > 0 ? (
                          <span className="font-bold text-red-500">{formatCurrency(balance)}</span>
                        ) : (
                          <span className="text-emerald-600 text-xs">✓ Сплачено</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLOR[b.source || "direct"] || SOURCE_COLOR.other}`}>
                          {SOURCE_UA[b.source || "direct"] || b.source}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge variant={b.status === "checked_in" ? "success" : "warning"} className="text-[10px]">
                          {b.status === "checked_in" ? "Заселено" : "Очікує"}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            title="Деталі"
                            onClick={() => setSelectedBooking(b as Booking)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            title="QR / Оплата"
                            onClick={() => setSelectedBooking(b as Booking)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          {b.status !== "checked_out" && (
                            <button
                              title="Оформити виїзд"
                              onClick={() => handleCheckout(b.id)}
                              disabled={checkingOut === b.id}
                              className="p-1.5 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-colors disabled:opacity-50"
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

          {filtered.length > 0 && (
            <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Показано: {filtered.length} з {living.length} мешканців</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60 inline-block"></span> Виїзд сьогодні
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/60 inline-block"></span> Прострочено
                </span>
              </span>
            </div>
          )}
        </Card>
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
