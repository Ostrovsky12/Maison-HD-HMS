import { useState } from "react";
import { 
  Plus, 
  Search, 
  BedDouble, 
  Wrench,
  Sparkles,
  Loader2
} from "lucide-react";
import { 
  useListUnits, 
  useUpdateUnitHousekeepingStatus,
  getListUnitsQueryKey
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
import { useToast } from "@/hooks/use-toast";
import { UnitHousekeepingStatusProperty } from "@workspace/api-client-react";

const statusConfig = {
  [UnitHousekeepingStatusProperty.clean]: { label: "Чисто", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Sparkles },
  [UnitHousekeepingStatusProperty.dirty]: { label: "Брудно", color: "bg-rose-100 text-rose-800 border-rose-200", icon: BedDouble },
  [UnitHousekeepingStatusProperty.in_progress]: { label: "В процесі", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Wrench },
};

export default function UnitsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: units, isLoading } = useListUnits({});
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

  const filteredUnits = units?.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Номерний фонд</h1>
            <p className="text-muted-foreground mt-1">Керування об'єктами розміщення та їх статусом.</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Додати номер
          </Button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Пошук номерів..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredUnits?.map(unit => {
              const hsStatus = unit.housekeepingStatus as UnitHousekeepingStatusProperty;
              const config = statusConfig[hsStatus] || statusConfig[UnitHousekeepingStatusProperty.dirty];
              const Icon = config.icon;

              return (
                <Card key={unit.id} className="flex flex-col overflow-hidden transition-all hover:shadow-md">
                  <div className={`h-2 w-full ${config.color.split(' ')[0]}`} />
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl font-bold">{unit.name}</CardTitle>
                      <Badge variant={unit.status === 'active' ? 'default' : 'secondary'}>
                        {unit.status === 'active' ? 'Активний' : 'В ремонті'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{unit.category} • {unit.capacity} місця</p>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="flex flex-col gap-4 mt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Поверх:</span>
                        <span className="font-medium">{unit.floor || '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Базова ціна:</span>
                        <span className="font-medium">{unit.basePrice ? `${unit.basePrice} ₴` : 'Не вказана'}</span>
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
