import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListBookings } from "@workspace/api-client-react";
import { Card, CardContent, Badge, Button, Input } from "@/components/ui/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, Plus, Filter } from "lucide-react";

export default function Bookings() {
  const [search, setSearch] = useState("");
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
            <h1 className="text-3xl font-display font-bold">Bookings</h1>
            <p className="text-muted-foreground mt-1">Manage all reservations across your properties.</p>
          </div>
          <Button><Plus className="w-4 h-4 mr-2" /> Create Booking</Button>
        </div>

        <Card>
          <div className="p-4 border-b border-border flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search guest or unit..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline"><Filter className="w-4 h-4 mr-2"/> Filter</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Guest</th>
                  <th className="px-6 py-4">Unit</th>
                  <th className="px-6 py-4">Dates</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No bookings found</td></tr>
                ) : filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/30 transition-colors cursor-pointer group">
                    <td className="px-6 py-4 font-medium">{b.guestName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{b.unitName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatDate(b.checkIn)} - {formatDate(b.checkOut)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        b.status === 'confirmed' ? 'default' : 
                        b.status === 'checked_in' ? 'success' : 
                        b.status === 'pending' ? 'warning' : 'secondary'
                      }>
                        {b.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-medium">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={b.paymentStatus === 'paid' ? 'success' : b.paymentStatus === 'partial' ? 'warning' : 'destructive'} className="uppercase text-[10px]">
                        {b.paymentStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
