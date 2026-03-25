import { AppLayout } from "@/components/layout/app-layout";
import { useListUnits } from "@workspace/api-client-react";
import { Card, Button, Badge } from "@/components/ui/shared";
import { Plus, Bed, Users } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function Units() {
  const { data: units = [], isLoading } = useListUnits();

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-bold">Units</h1>
            <p className="text-muted-foreground mt-1">Manage your rooms, houses, and resources.</p>
          </div>
          <Button><Plus className="w-4 h-4 mr-2" /> Add Unit</Button>
        </div>

        {isLoading ? (
          <div className="animate-pulse flex space-x-4">
            <div className="h-40 bg-muted rounded-xl w-1/3"></div>
            <div className="h-40 bg-muted rounded-xl w-1/3"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {units.map(unit => (
              <Card key={unit.id} className="overflow-hidden hover:shadow-md transition-all group">
                <div className="h-2 bg-gradient-to-r from-primary to-accent" />
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold font-display">{unit.name}</h3>
                      <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">{unit.category}</p>
                    </div>
                    <Badge variant={unit.status === 'active' ? 'success' : unit.status === 'maintenance' ? 'warning' : 'destructive'} className="text-[10px]">
                      {unit.status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-muted-foreground"><Users className="w-4 h-4 mr-2"/> Capacity</span>
                      <span className="font-medium">{unit.capacity} persons</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-muted-foreground"><Bed className="w-4 h-4 mr-2"/> Base Price</span>
                      <span className="font-medium text-emerald-500">{unit.basePrice ? formatCurrency(unit.basePrice) : 'N/A'}/night</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-border flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Floor: {unit.floor || '-'}</span>
                    <Button variant="outline" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-8">Edit</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
