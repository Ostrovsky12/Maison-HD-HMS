import { useState } from "react";
import { 
  Plus, 
  Search, 
  BedDouble, 
  Wrench,
  Sparkles,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  Eye,
  Wind,
  Maximize2
} from "lucide-react";
import { 
  useListUnits, 
  useGetUnitsAvailability,
  useUpdateUnitHousekeepingStatus,
  getListUnitsQueryKey,
  UnitHousekeepingStatusProperty,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const statusConfig = {
  [UnitHousekeepingStatusProperty.clean]: { label: "Чисто", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Sparkles },
  [UnitHousekeepingStatusProperty.dirty]: { label: "Брудно", color: "bg-rose-100 text-rose-800 border-rose-200", icon: BedDouble },
  [UnitHousekeepingStatusProperty.in_progress]: { label: "В процесі", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Wrench },
};

const viewLabels: Record<string, string> = {
  park: "Парк", sea: "Море", city: "Місто", garden: "Сад", mountain: "Гори", pool: "Басейн"
};

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}
function getTomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

type ViewMode = "all" | "availability";

export default function UnitsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [checkIn, setCheckIn] = useState(getTodayStr());
  const [checkOut, setCheckOut] = useState(getTomorrowStr());
  const [filterAvailable, setFilterAvailable] = useState<"all" | "available" | "busy">("all");
  
  const { data: units, isLoading: unitsLoading } = useListUnits({});
  const { data: availability, isLoading: availLoading } = useGetUnitsAvailability(
    { checkIn, checkOut },
    { query: { enabled: viewMode === "availability" && !!checkIn && !!checkOut } }
  );
  const updateStatusMutation = useUpdateUnitHousekeepingStatus();

  const handleStatusChange = (unitId: number, status: UnitHousekeepingStatusProperty) => {
    updateStatusMutation.mutate(
      { data: { unitId, housekeepingStatus: status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey() });
          toast({ title: "Статус номеру оновлено" });
        },
        onError: () => toast({ title: "Помилка", variant: "destructive" })
      }
    );
  };

  const isLoading = viewMode === "all" ? unitsLoading : availLoading;

  const displayUnits = viewMode === "availability"
    ? (availability?.results || [])
        .filter(r => {
          if (filterAvailable === "available") return r.isAvailable;
          if (filterAvailable === "busy") return !r.isAvailable;
          return true;
        })
        .filter(r =>
          r.unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.unit.category.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map(r => ({ ...r.unit, _available: r.isAvailable, _blockingId: r.blockingBookingId }))
    : (units || []).filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.category.toLowerCase().includes(searchTerm.toLowerCase())
      ).map(u => ({ ...u, _available: undefined, _blockingId: undefined }));

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Номерний фонд</h1>
            <p className="text-muted-foreground mt-1">Керування об'єктами розміщення та доступністю.</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Додати номер
          </Button>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="all">Всі номери</TabsTrigger>
                <TabsTrigger value="availability" className="gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Доступність
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Пошук номерів..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {viewMode === "availability" && (
            <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-lg border">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Заїзд:</label>
                <Input
                  type="date"
                  value={checkIn}
                  onChange={e => setCheckIn(e.target.value)}
                  className="w-40 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Виїзд:</label>
                <Input
                  type="date"
                  value={checkOut}
                  onChange={e => setCheckOut(e.target.value)}
                  className="w-40 h-8 text-sm"
                />
              </div>
              {availability && (
                <div className="flex items-center gap-3 ml-auto text-sm">
                  <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    {availability.availableCount} вільних
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-700 font-medium">
                    <XCircle className="w-4 h-4" />
                    {availability.totalCount - availability.availableCount} зайнятих
                  </span>
                  <span className="text-muted-foreground">• {availability.nights} ніч(і)</span>
                  <Select value={filterAvailable} onValueChange={(v) => setFilterAvailable(v as any)}>
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Всі</SelectItem>
                      <SelectItem value="available">Тільки вільні</SelectItem>
                      <SelectItem value="busy">Тільки зайняті</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(displayUnits as any[]).map(unit => {
              const hsStatus = unit.housekeepingStatus as UnitHousekeepingStatusProperty;
              const config = statusConfig[hsStatus] || statusConfig[UnitHousekeepingStatusProperty.dirty];
              const Icon = config.icon;

              return (
                <Card key={unit.id} className="flex flex-col overflow-hidden transition-all hover:shadow-md">
                  <div className={`h-2 w-full ${
                    viewMode === "availability"
                      ? unit._available ? "bg-emerald-400" : "bg-rose-400"
                      : config.color.split(' ')[0]
                  }`} />
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl font-bold">{unit.name}</CardTitle>
                      {viewMode === "availability" ? (
                        unit._available ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 border">Вільний</Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-200 border">Зайнятий</Badge>
                        )
                      ) : (
                        <Badge variant={unit.status === 'active' ? 'default' : 'secondary'}>
                          {unit.status === 'active' ? 'Активний' : 'В ремонті'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{unit.category} • {unit.capacity} місця</p>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Поверх:</span>
                        <span className="font-medium">{unit.floor || '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ціна/ніч:</span>
                        <span className="font-medium">{unit.basePrice ? `${Number(unit.basePrice).toLocaleString('uk-UA')} ₴` : '—'}</span>
                      </div>
                      {unit.squareMeters && (
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-1 text-muted-foreground"><Maximize2 className="w-3 h-3" />Площа:</span>
                          <span className="font-medium">{unit.squareMeters} м²</span>
                        </div>
                      )}
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {unit.hasBalcony && (
                          <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded px-1.5 py-0.5 flex items-center gap-1">
                            <Wind className="w-3 h-3" /> Балкон
                          </span>
                        )}
                        {unit.hasView && (
                          <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {viewLabels[unit.hasView] || unit.hasView}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-4 border-t bg-muted/20">
                    <div className="w-full flex items-center justify-between">
                      <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border ${config.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {config.label}
                      </div>
                      <Select 
                        value={hsStatus} 
                        onValueChange={(val) => handleStatusChange(unit.id, val as UnitHousekeepingStatusProperty)}
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <SelectValue placeholder="Змінити..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UnitHousekeepingStatusProperty.clean}>Чисто</SelectItem>
                          <SelectItem value={UnitHousekeepingStatusProperty.dirty}>Брудно</SelectItem>
                          <SelectItem value={UnitHousekeepingStatusProperty.in_progress}>Прибирається</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
