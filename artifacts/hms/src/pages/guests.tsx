import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListGuests } from "@workspace/api-client-react";
import { Card, Button, Input, Badge } from "@/components/ui/shared";
import { Search, Plus, Mail, Phone, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function Guests() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListGuests({ search });

  const guests = data?.guests || [];

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-bold">Guest CRM</h1>
            <p className="text-muted-foreground mt-1">Manage guest profiles, history, and notes.</p>
          </div>
          <Button><Plus className="w-4 h-4 mr-2" /> Add Guest</Button>
        </div>

        <Card>
          <div className="p-4 border-b border-border">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search by name, email or phone..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 p-0 sm:p-4 bg-muted/10">
            {isLoading ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">Loading guests...</div>
            ) : guests.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">No guests found</div>
            ) : guests.map(guest => (
              <div key={guest.id} className="p-4 border-b border-border sm:border sm:rounded-xl sm:bg-card sm:shadow-sm sm:m-2 hover:border-primary/50 transition-all group cursor-pointer relative">
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><ExternalLink className="w-4 h-4 text-muted-foreground" /></Button>
                
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg mr-4">
                    {guest.firstName.charAt(0)}{guest.lastName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-lg leading-none">{guest.firstName} {guest.lastName}</h3>
                    <div className="flex items-center text-xs text-muted-foreground mt-1.5 space-x-3">
                      {guest.email && <span className="flex items-center"><Mail className="w-3 h-3 mr-1"/> {guest.email}</span>}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm bg-muted/50 p-3 rounded-lg">
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">LTV</div>
                    <div className="font-medium text-emerald-500">{formatCurrency(guest.ltv)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">Bookings</div>
                    <div className="font-medium">{guest.bookingCount}</div>
                  </div>
                </div>
                
                {guest.phone && (
                   <div className="mt-3 text-sm text-muted-foreground flex items-center">
                     <Phone className="w-3.5 h-3.5 mr-2" /> {guest.phone}
                   </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
