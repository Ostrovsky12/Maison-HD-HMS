import { useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Plus,
  Loader2
} from "lucide-react";
import { 
  useListHousekeepingTasks,
  useUpdateHousekeepingTask,
  getListHousekeepingTasksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HousekeepingTaskStatus, HousekeepingTaskPriority } from "@workspace/api-client-react";

export default function HousekeepingPage() {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useListHousekeepingTasks({});
  const updateTaskMutation = useUpdateHousekeepingTask();

  const handleUpdateStatus = (taskId: number, status: HousekeepingTaskStatus) => {
    updateTaskMutation.mutate(
      { taskId, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListHousekeepingTasksQueryKey() });
        }
      }
    );
  };

  const pendingTasks = tasks?.filter(t => t.status === HousekeepingTaskStatus.pending) || [];
  const inProgressTasks = tasks?.filter(t => t.status === HousekeepingTaskStatus.in_progress) || [];
  const completedTasks = tasks?.filter(t => t.status === HousekeepingTaskStatus.completed) || [];

  const TaskCard = ({ task }: { task: any }) => (
    <Card className="mb-3 border border-border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="font-bold">{task.unitName}</div>
          <Badge variant={
            task.priority === HousekeepingTaskPriority.high ? "destructive" : 
            task.priority === HousekeepingTaskPriority.medium ? "default" : "secondary"
          }>
            {task.priority === HousekeepingTaskPriority.high ? "Терміново" : 
             task.priority === HousekeepingTaskPriority.medium ? "Звичайно" : "Низький"}
          </Badge>
        </div>
        <h4 className="text-sm font-medium mb-1">{task.title}</h4>
        {task.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{task.description}</p>}
        
        <div className="mt-4 pt-3 border-t flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Виконавець: {task.assignedToName || "Не призначено"}</span>
          <div className="flex gap-2">
            {task.status === HousekeepingTaskStatus.pending && (
              <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateStatus(task.id, HousekeepingTaskStatus.in_progress)}>
                Почати
              </Button>
            )}
            {task.status === HousekeepingTaskStatus.in_progress && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => handleUpdateStatus(task.id, HousekeepingTaskStatus.completed)}>
                <CheckCircle2 className="w-3 h-3 mr-1" /> Готово
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Прибирання та задачі</h1>
            <p className="text-muted-foreground mt-1">Дошка задач для покоївок та техперсоналу.</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Створити задачу
          </Button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
            {/* Column 1: Pending */}
            <div className="flex flex-col bg-muted/30 rounded-xl p-4 border">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold">Очікують ({pendingTasks.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                {pendingTasks.map(task => <TaskCard key={task.id} task={task} />)}
                {pendingTasks.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Немає завдань</div>
                )}
              </div>
            </div>

            {/* Column 2: In Progress */}
            <div className="flex flex-col bg-muted/30 rounded-xl p-4 border">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold">В процесі ({inProgressTasks.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                {inProgressTasks.map(task => <TaskCard key={task.id} task={task} />)}
                {inProgressTasks.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Немає активних завдань</div>
                )}
              </div>
            </div>

            {/* Column 3: Completed */}
            <div className="flex flex-col bg-muted/30 rounded-xl p-4 border">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="font-semibold">Виконано ({completedTasks.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                {completedTasks.map(task => <TaskCard key={task.id} task={task} />)}
                {completedTasks.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Ще немає виконаних завдань</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
