import { useState } from "react";
import { 
  Users, 
  Search, 
  Plus, 
  Mail, 
  Phone,
  MoreVertical,
  Loader2
} from "lucide-react";
import { useListGuests } from "@workspace/api-client-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

export default function GuestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: guestsResponse, isLoading } = useListGuests({});
  
  const guests = guestsResponse?.guests || [];

  const filteredGuests = guests.filter(g => 
    `${g.firstName} ${g.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.phone?.includes(searchTerm)
  );

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">База гостей</h1>
            <p className="text-muted-foreground mt-1">CRM для управління даними клієнтів та історією бронювань.</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Новий гість
          </Button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Пошук за ім'ям, email або телефоном..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-card border rounded-lg overflow-hidden flex-1 flex flex-col">
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow>
                  <TableHead>Гість</TableHead>
                  <TableHead>Контакти</TableHead>
                  <TableHead>К-сть бронювань</TableHead>
                  <TableHead>LTV (Дохід)</TableHead>
                  <TableHead>Додано</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : filteredGuests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Гостей не знайдено
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGuests.map((guest) => {
                    const initials = `${guest.firstName[0] || ''}${guest.lastName[0] || ''}`.toUpperCase();
                    
                    return (
                      <TableRow key={guest.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border">
                              <AvatarFallback className="bg-primary/5 text-primary text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{guest.firstName} {guest.lastName}</div>
                              {guest.notes && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{guest.notes}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {guest.phone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="w-3 h-3" /> {guest.phone}
                              </div>
                            )}
                            {guest.email && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="w-3 h-3" /> {guest.email}
                              </div>
                            )}
                            {!guest.phone && !guest.email && <span className="text-xs text-muted-foreground">Немає контактів</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{guest.bookingCount}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-emerald-600">
                            {new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(guest.ltv)}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(guest.createdAt), "d MMM yyyy", { locale: uk })}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
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
    </AppLayout>
  );
}
