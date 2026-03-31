import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListBookings } from "@workspace/api-client-react";
import { Card, Badge, Button, Input } from "@/components/ui/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, Plus, Filter, QrCode, CreditCard } from "lucide-react";
import { BookingDetailModal, type BookingModalData } from "@/components/bookings/booking-detail-modal";

const STATUS_UA: Record<string, string> = {
  confirmed: "Підтверджено",
  pending: "Очікує",
  checked_in: "Заселено",
  checked_out: "Виїхав",
  cancelled: "Скасовано",
};

const PAYMENT_UA: Record<string, string> = {
  paid: "Оплачено",
  unpaid: "Не оплачено",
  partial: "Частково",
  refunded: "Повернено",
};

type Booking = BookingModalData;

export default function Bookings() {
  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const { data: bookings = [], isLoading } = useListBookings();

  const filtered = bookings.filter(b =>
    b.guestName?.toLowerCase().includes(search.toLowerCase()) ||
    b.unitName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Бронювання</h1>
            <p className="text-muted-foreground mt-1">Управління всіма резерваціями по об'єктах.</p>
          </div>
          <Button><Plus className="w-4 h-4 mr-2" /> Нове бронювання</Button>
        </div>

        <Card>
          <div className="p-4 border-b border-border flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Пошук за гостем або юнітом..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline"><Filter className="w-4 h-4 mr-2" /> Фільтр</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Гість</th>
                  <th className="px-6 py-4">Юніт</th>
                  <th className="px-6 py-4">Дати</th>
                  <th className="px-6 py-4">Статус</th>
                  <th className="px-6 py-4">Сума</th>
                  <th className="px-6 py-4">Оплата</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Завантаження...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Бронювань не знайдено</td></tr>
                ) : filtered.map((b) => (
                  <tr
                    key={b.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => setSelectedBooking(b as Booking)}
                  >
                    <td className="px-6 py-4 font-medium">{b.guestName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{b.unitName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatDate(b.checkIn)} — {formatDate(b.checkOut)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        b.status === "confirmed" ? "default" :
                        b.status === "checked_in" ? "success" :
                        b.status === "pending" ? "warning" : "secondary"
                      }>
                        {STATUS_UA[b.status] || b.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-medium">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={b.paymentStatus === "paid" ? "success" : b.paymentStatus === "partial" ? "warning" : "destructive"} className="uppercase text-[10px]">
                        {PAYMENT_UA[b.paymentStatus] || b.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span title="QR-код" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                          <QrCode className="w-4 h-4" />
                        </span>
                        {b.paymentStatus !== "paid" && (
                          <span title="Оплата LiqPay" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <CreditCard className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
