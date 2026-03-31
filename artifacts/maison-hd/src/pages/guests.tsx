import { useState } from "react";
import { 
  Search, 
  Plus, 
  Mail, 
  Phone,
  Loader2,
  Star,
  ChevronRight,
  Shield,
  Globe,
  Tag,
  X
} from "lucide-react";
import { useListGuests, useGetGuest } from "@workspace/api-client-react";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const loyaltyConfig: Record<string, { label: string; color: string; stars: number }> = {
  bronze:   { label: "Бронза",   color: "bg-amber-50 text-amber-700 border-amber-200",    stars: 1 },
  silver:   { label: "Срібло",   color: "bg-slate-50 text-slate-700 border-slate-200",    stars: 2 },
  gold:     { label: "Золото",   color: "bg-yellow-50 text-yellow-700 border-yellow-200", stars: 3 },
  platinum: { label: "Платина",  color: "bg-violet-50 text-violet-700 border-violet-200", stars: 4 },
};

const fmtUAH = (n: number) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

function LoyaltyBadge({ level }: { level?: string | null }) {
  if (!level) return null;
  const cfg = loyaltyConfig[level] || loyaltyConfig.bronze;
  return (
    <Badge className={`border text-xs gap-1 ${cfg.color}`}>
      <Star className="w-3 h-3 fill-current" />
      {cfg.label}
    </Badge>
  );
}

export default function GuestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null);
  const { data: guestsResponse, isLoading } = useListGuests({});
  const { data: guestDetail, isLoading: detailLoading } = useGetGuest(
    selectedGuestId ?? 0,
    { query: { enabled: selectedGuestId !== null } }
  );
  
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
            <p className="text-muted-foreground mt-1">CRM для управління клієнтами та їх програмою лояльності.</p>
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
              placeholder="Пошук за ім'ям, email, телефоном..." 
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
                  <TableHead>Лояльність</TableHead>
                  <TableHead>Бронювань</TableHead>
                  <TableHead>LTV</TableHead>
                  <TableHead>Ночей</TableHead>
                  <TableHead>Додано</TableHead>
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
                ) : filteredGuests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      Гостей не знайдено
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGuests.map((guest) => {
                    const initials = `${guest.firstName[0] || ''}${guest.lastName[0] || ''}`.toUpperCase();
                    
                    return (
                      <TableRow 
                        key={guest.id} 
                        className="hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedGuestId(guest.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border">
                              <AvatarFallback className="bg-primary/5 text-primary text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">
                                {guest.lastName} {guest.firstName}
                                {(guest as any).middleName ? ` ${(guest as any).middleName}` : ""}
                              </div>
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
                          <LoyaltyBadge level={(guest as any).loyaltyLevel} />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{guest.bookingCount}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-emerald-600">{fmtUAH(guest.ltv)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{(guest as any).totalNights ?? 0}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(guest.createdAt), "d MMM yyyy", { locale: uk })}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
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

      <Sheet open={selectedGuestId !== null} onOpenChange={(open) => !open && setSelectedGuestId(null)}>
        <SheetContent className="w-[480px] overflow-y-auto">
          {detailLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : guestDetail ? (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {`${guestDetail.firstName[0]}${guestDetail.lastName[0]}`.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-xl">
                      {guestDetail.lastName} {guestDetail.firstName}
                      {(guestDetail as any).middleName ? ` ${(guestDetail as any).middleName}` : ""}
                    </SheetTitle>
                    <LoyaltyBadge level={(guestDetail as any).loyaltyLevel} />
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6">
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Контакти</h3>
                  <div className="space-y-2">
                    {guestDetail.phone && (
                      <div className="flex items-center gap-3 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{guestDetail.phone}</span>
                      </div>
                    )}
                    {guestDetail.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span>{guestDetail.email}</span>
                      </div>
                    )}
                    {(guestDetail as any).nationality && (
                      <div className="flex items-center gap-3 text-sm">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <span>{(guestDetail as any).nationality}</span>
                      </div>
                    )}
                    {(guestDetail as any).passportNumber && (
                      <div className="flex items-center gap-3 text-sm">
                        <Shield className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono">{(guestDetail as any).passportNumber}</span>
                      </div>
                    )}
                    {(guestDetail as any).birthDate && (
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground w-4 text-center text-xs">🎂</span>
                        <span>{format(new Date((guestDetail as any).birthDate), "d MMMM yyyy", { locale: uk })}</span>
                      </div>
                    )}
                    {(guestDetail as any).address && (
                      <div className="flex items-start gap-3 text-sm">
                        <span className="text-muted-foreground w-4 text-center text-xs mt-0.5">📍</span>
                        <span className="text-muted-foreground">{(guestDetail as any).address}</span>
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Програма лояльності</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold">{(guestDetail as any).loyaltyPoints ?? 0}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Балів</div>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold">{(guestDetail as any).totalNights ?? 0}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Ночей</div>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-emerald-600">
                        {fmtUAH(Number((guestDetail as any).totalSpent ?? 0))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">Витрачено</div>
                    </div>
                  </div>
                  {(guestDetail as any).lastVisit && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Останній візит: {format(new Date((guestDetail as any).lastVisit), "d MMMM yyyy", { locale: uk })}
                    </p>
                  )}
                </section>

                {((guestDetail as any).preferences?.length > 0 || (guestDetail as any).tags?.length > 0) && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Теги та вподобання</h3>
                      <div className="flex flex-wrap gap-2">
                        {((guestDetail as any).tags || []).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            <Tag className="w-3 h-3" />{tag}
                          </Badge>
                        ))}
                        {((guestDetail as any).preferences || []).map((p: string) => (
                          <Badge key={p} variant="outline" className="gap-1">{p}</Badge>
                        ))}
                      </div>
                    </section>
                  </>
                )}

                {guestDetail.notes && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Нотатки</h3>
                      <p className="text-sm text-muted-foreground">{guestDetail.notes}</p>
                    </section>
                  </>
                )}

                {(guestDetail as any).bookings?.length > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Історія бронювань ({(guestDetail as any).bookings.length})
                      </h3>
                      <div className="space-y-2">
                        {(guestDetail as any).bookings.slice(0, 5).map((b: any) => (
                          <div key={b.id} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg text-sm">
                            <div>
                              <div className="font-medium">{b.unitName || `Юніт #${b.unitId}`}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(b.checkIn), "d MMM", { locale: uk })} – {format(new Date(b.checkOut), "d MMM yyyy", { locale: uk })}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-emerald-600">{fmtUAH(b.totalAmount)}</div>
                              <Badge variant="outline" className="text-xs">{b.status}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
