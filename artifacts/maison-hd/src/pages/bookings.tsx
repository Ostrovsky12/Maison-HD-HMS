import { useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { BookingDialog } from "@/components/booking/booking-dialog";
import { 
  Search, 
  Plus, 
  Filter, 
  MoreHorizontal,
  FileEdit,
  Trash2,
  Calendar as CalendarIcon,
  Loader2,
  CalendarCheck,
  CalendarX,
  X,
} from "lucide-react";
import { 
  useListBookings, 
  useDeleteBooking, 
  useUpdateBookingStatus,
  useCheckinBooking,
  useCheckoutBooking,
  useCancelBooking,
  getListBookingsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { BookingStatus, BookingPaymentStatus } from "@workspace/api-client-react";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  [BookingStatus.pending]: { label: "Очікує", variant: "outline" },
  [BookingStatus.confirmed]: { label: "Підтверджено", variant: "default" },
  [BookingStatus.checked_in]: { label: "Проживає", variant: "secondary" },
  [BookingStatus.checked_out]: { label: "Виїхав", variant: "outline" },
  [BookingStatus.cancelled]: { label: "Скасовано", variant: "destructive" },
};

const paymentStatusMap: Record<string, { label: string; color: string }> = {
  [BookingPaymentStatus.unpaid]: { label: "Не оплачено", color: "text-red-600 bg-red-100" },
  [BookingPaymentStatus.partial]: { label: "Частково", color: "text-amber-600 bg-amber-100" },
  [BookingPaymentStatus.paid]: { label: "Оплачено", color: "text-emerald-600 bg-emerald-100" },
};

export default function BookingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [bookingDialog, setBookingDialog] = useState<{ open: boolean; booking?: any }>({ open: false });
  
  const { data: bookings, isLoading } = useListBookings({});
  const updateStatusMutation = useUpdateBookingStatus();
  const deleteMutation = useDeleteBooking();

  const checkinMutation = useCheckinBooking();
  const checkoutMutation = useCheckoutBooking();
  const cancelMutation = useCancelBooking();

  const handleUpdateStatus = (id: number, status: BookingStatus) => {
    updateStatusMutation.mutate(
      { bookingId: id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          toast({ title: "Статус оновлено" });
        },
        onError: () => toast({ title: "Помилка", variant: "destructive" })
      }
    );
  };

  const handleCheckIn = (id: number) => {
    checkinMutation.mutate(
      { bookingId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          toast({ title: "Check-in виконано", description: "Гість заселений" });
        },
        onError: (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" })
      }
    );
  };

  const handleCheckOut = (id: number) => {
    checkoutMutation.mutate(
      { bookingId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          toast({ title: "Check-out виконано", description: "Гість виселений" });
        },
        onError: (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" })
      }
    );
  };

  const handleCancel = (id: number) => {
    if (!window.confirm("Скасувати бронювання?")) return;
    cancelMutation.mutate(
      { bookingId: id, data: {} },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          toast({ title: "Бронювання скасовано", variant: "destructive" });
        },
        onError: (e: any) => toast({ title: e?.message || "Помилка", variant: "destructive" })
      }
    );
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Ви впевнені, що хочете видалити це бронювання?")) {
      deleteMutation.mutate(
        { bookingId: id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
            toast({ title: "Бронювання видалено" });
          },
          onError: () => toast({ title: "Помилка видалення", variant: "destructive" })
        }
      );
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(amount);
  };

  const filteredBookings = bookings?.filter(b => 
    b.guestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.unitName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.id.toString().includes(searchTerm)
  );

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Бронювання</h1>
            <p className="text-muted-foreground mt-1">Управління всіма бронюваннями та заїздами.</p>
          </div>
          <Button className="gap-2" onClick={() => setBookingDialog({ open: true })}>
            <Plus className="w-4 h-4" />
            Створити бронювання
          </Button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Пошук за гостем, номером або ID..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Фільтри
          </Button>
        </div>

        <div className="bg-card border rounded-lg overflow-hidden flex-1 flex flex-col">
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>Гість</TableHead>
                  <TableHead>Номер</TableHead>
                  <TableHead>Дати</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Оплата</TableHead>
                  <TableHead className="text-right">Сума</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : filteredBookings?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      Бронювань не знайдено
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBookings?.map((booking) => {
                    const checkIn = new Date(booking.checkIn);
                    const checkOut = new Date(booking.checkOut);
                    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
                    const statusInfo = statusMap[booking.status] || { label: booking.status, variant: "outline" };
                    const payStatus = paymentStatusMap[booking.paymentStatus];

                    return (
                      <TableRow key={booking.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground">#{booking.id}</TableCell>
                        <TableCell className="font-medium">{booking.guestName || "Невідомо"}</TableCell>
                        <TableCell>{booking.unitName || `Номер ${booking.unitId}`}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>
                              {format(checkIn, "d MMM", { locale: uk })} — {format(checkOut, "d MMM", { locale: uk })}
                              <span className="text-muted-foreground ml-1">({nights} 🌙)</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${payStatus.color}`}>
                            {payStatus.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(booking.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Дії</DropdownMenuLabel>
                              {(booking.status === "confirmed" || booking.status === "pending") && (
                                <DropdownMenuItem
                                  className="cursor-pointer gap-2 text-green-700 focus:text-green-700"
                                  onClick={() => handleCheckIn(booking.id)}
                                >
                                  <CalendarCheck className="w-4 h-4" /> Check-in
                                </DropdownMenuItem>
                              )}
                              {booking.status === "checked_in" && (
                                <DropdownMenuItem
                                  className="cursor-pointer gap-2 text-amber-700 focus:text-amber-700"
                                  onClick={() => handleCheckOut(booking.id)}
                                >
                                  <CalendarX className="w-4 h-4" /> Check-out
                                </DropdownMenuItem>
                              )}
                              {(booking.status === "confirmed" || booking.status === "pending") && (
                                <DropdownMenuItem
                                  className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                                  onClick={() => handleCancel(booking.id)}
                                >
                                  <X className="w-4 h-4" /> Скасувати
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer gap-2"
                                onClick={() => setBookingDialog({ open: true, booking })}
                              >
                                <FileEdit className="w-4 h-4" /> Редагувати
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive cursor-pointer gap-2"
                                onClick={() => handleDelete(booking.id)}
                              >
                                <Trash2 className="w-4 h-4" /> Видалити
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <BookingDialog
        open={bookingDialog.open}
        booking={bookingDialog.booking}
        onClose={() => setBookingDialog({ open: false })}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          setBookingDialog({ open: false });
        }}
      />
    </AppLayout>
  );
}
