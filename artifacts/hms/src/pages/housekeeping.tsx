import { AppLayout } from "@/components/layout/app-layout";
import { useListUnitStatuses, useListHousekeepingTasks, useUpdateUnitHousekeepingStatus } from "@workspace/api-client-react";
import { Card, CardContent, Badge, Button } from "@/components/ui/shared";
import { Sparkles, XCircle, Clock, CheckSquare } from "lucide-react";

export default function Housekeeping() {
  const { data: statuses = [], refetch: refetchStatuses } = useListUnitStatuses();
  const { data: tasks = [] } = useListHousekeepingTasks();
  const { mutate: updateStatus } = useUpdateUnitHousekeepingStatus();

  const handleStatusCycle = (unitId: number, current: string) => {
    const next = current === 'dirty' ? 'in_progress' : current === 'in_progress' ? 'clean' : 'dirty';
    updateStatus(
      { data: { unitId, housekeepingStatus: next as any } },
      { onSuccess: () => refetchStatuses() }
    );
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'clean': return <Sparkles className="w-8 h-8 text-emerald-500 mb-2" />;
      case 'dirty': return <XCircle className="w-8 h-8 text-red-500 mb-2" />;
      case 'in_progress': return <Clock className="w-8 h-8 text-amber-500 mb-2 animate-pulse" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'clean': return "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10";
      case 'dirty': return "border-red-500/30 bg-red-500/5 hover:bg-red-500/10";
      case 'in_progress': return "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10";
    }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-bold">Housekeeping</h1>
            <p className="text-muted-foreground mt-1">Manage cleaning statuses and staff tasks.</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Clean ({statuses.filter(s => s.housekeepingStatus === 'clean').length})</Badge>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">In Progress ({statuses.filter(s => s.housekeepingStatus === 'in_progress').length})</Badge>
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Dirty ({statuses.filter(s => s.housekeepingStatus === 'dirty').length})</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Unit Status Grid */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold flex items-center"><BedDoubleIcon className="w-5 h-5 mr-2 text-primary" /> Unit Statuses</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {statuses.map(unit => (
                <button
                  key={unit.unitId}
                  onClick={() => handleStatusCycle(unit.unitId, unit.housekeepingStatus)}
                  className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200 active:scale-95 ${getStatusColor(unit.housekeepingStatus)}`}
                >
                  {getStatusIcon(unit.housekeepingStatus)}
                  <span className="font-display font-bold text-lg">{unit.unitName}</span>
                  <span className="text-xs uppercase tracking-wider font-semibold opacity-70 mt-1">{unit.housekeepingStatus.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Task List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold flex items-center"><CheckSquare className="w-5 h-5 mr-2 text-primary" /> Today's Tasks</h2>
              <Button size="sm" variant="outline">Add Task</Button>
            </div>
            
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <Card className="bg-muted/30 border-dashed text-center p-8 text-muted-foreground">No pending tasks</Card>
              ) : tasks.map(task => (
                <Card key={task.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold">{task.title}</h4>
                      <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'warning' : 'secondary'} className="text-[10px] uppercase">
                        {task.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{task.unitName} • Assigned to: {task.assignedToName || 'Unassigned'}</p>
                    
                    {task.checklist && task.checklist.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-border/50">
                        {task.checklist.map((item: any) => (
                          <div key={item.id} className="flex items-center text-sm">
                            <input type="checkbox" checked={item.checked} readOnly className="mr-2 rounded border-border text-primary focus:ring-primary" />
                            <span className={item.checked ? 'line-through text-muted-foreground' : ''}>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// Simple local component replacement for missing icon import
function BedDoubleIcon(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg>
}
