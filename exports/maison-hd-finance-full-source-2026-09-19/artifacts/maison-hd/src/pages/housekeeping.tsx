import { useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Loader2,
  ShieldCheck,
  Play,
  Wrench,
  BedDouble,
  Brush,
  Eye,
  StickyNote,
} from "lucide-react";
import {
  useListHousekeepingTasks,
  useCreateHousekeepingTask,
  useStartHousekeepingTask,
  useCompleteHousekeepingTask,
  useVerifyHousekeepingTask,
  useGetHousekeepingDashboard,
  getListHousekeepingTasksQueryKey,
  getGetHousekeepingDashboardQueryKey,
  HousekeepingTaskStatus,
  HousekeepingTaskPriority,
  CreateHousekeepingTaskRequestTaskType,
  useListUnits,
  useListUsers,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const TASK_TYPE_LABELS: Record<string, string> = {
  cleaning: "Прибирання",
  deep_cleaning: "Генеральне",
  linen_change: "Зміна білизни",
  maintenance: "Технічне",
  check: "Перевірка",
  other: "Інше",
};

const TASK_TYPE_ICONS: Record<string, any> = {
  cleaning: Brush,
  deep_cleaning: Sparkles,
  linen_change: BedDouble,
  maintenance: Wrench,
  check: Eye,
  other: StickyNote,
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Низький",
  medium: "Звичайний",
  high: "Терміново",
};

function CreateTaskDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [unitId, setUnitId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("cleaning");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("30");

  const { data: units } = useListUnits({});
  const { data: users } = useListUsers({});
  const createMutation = useCreateHousekeepingTask();

  const housekeepingStaff = (users || []).filter(
    (u) => u.role === "housekeeping" || u.role === "manager"
  );

  const handleSubmit = () => {
    if (!unitId || !title) return;
    createMutation.mutate(
      {
        data: {
          unitId: parseInt(unitId),
          assignedToId: (assignedToId && assignedToId !== "none") ? parseInt(assignedToId) : undefined,
          title,
          description: description || undefined,
          taskType: taskType as CreateHousekeepingTaskRequestTaskType,
          priority: priority as HousekeepingTaskPriority,
          dueDate: dueDate || undefined,
          estimatedMinutes: parseInt(estimatedMinutes) || 30,
        },
      },
      {
        onSuccess: () => {
          onSuccess();
          onClose();
          setUnitId("");
          setAssignedToId("");
          setTitle("");
          setDescription("");
          setTaskType("cleaning");
          setPriority("medium");
          setDueDate("");
          setEstimatedMinutes("30");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Нова задача</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Номер *</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть номер" />
                </SelectTrigger>
                <SelectContent>
                  {(units || []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Тип задачі</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Назва задачі *</Label>
            <Input
              placeholder="Наприклад: Прибирання після виїзду"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Опис</Label>
            <Textarea
              placeholder="Додаткові інструкції..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Виконавець</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Не призначено" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не призначено</SelectItem>
                  {housekeepingStaff.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Пріоритет</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Дата виконання</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Орієнтовно (хв)</Label>
              <Input
                type="number"
                min="5"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button
            onClick={handleSubmit}
            disabled={!unitId || !title || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Створити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function HousekeepingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tasks, isLoading } = useListHousekeepingTasks({});
  const { data: dashboard } = useGetHousekeepingDashboard();
  const startMutation = useStartHousekeepingTask();
  const completeMutation = useCompleteHousekeepingTask();
  const verifyMutation = useVerifyHousekeepingTask();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListHousekeepingTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetHousekeepingDashboardQueryKey() });
  };

  const handleStart = (taskId: number) => {
    startMutation.mutate({ taskId }, { onSuccess: invalidate });
  };

  const handleComplete = (taskId: number) => {
    completeMutation.mutate({ taskId, data: {} }, { onSuccess: invalidate });
  };

  const handleVerify = (taskId: number) => {
    verifyMutation.mutate({ taskId, data: {} }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Перевірено", description: "Задачу підтверджено" });
      },
    });
  };

  const pendingTasks = (tasks || []).filter((t) => t.status === HousekeepingTaskStatus.pending);
  const inProgressTasks = (tasks || []).filter((t) => t.status === HousekeepingTaskStatus.in_progress);
  const completedTasks = (tasks || []).filter((t) => t.status === HousekeepingTaskStatus.completed);
  const verifiedTasks = (tasks || []).filter((t) => t.status === HousekeepingTaskStatus.verified);

  const TaskCard = ({ task }: { task: any }) => {
    const TypeIcon = TASK_TYPE_ICONS[task.taskType] || Brush;
    const anyLoading = startMutation.isPending || completeMutation.isPending || verifyMutation.isPending;

    return (
      <Card className="mb-3 border border-border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-1.5">
              <TypeIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground font-medium">
                {TASK_TYPE_LABELS[task.taskType] || task.taskType}
              </span>
            </div>
            <Badge
              variant={
                task.priority === HousekeepingTaskPriority.high ? "destructive" :
                task.priority === HousekeepingTaskPriority.medium ? "default" : "secondary"
              }
              className="text-[10px]"
            >
              {PRIORITY_LABELS[task.priority] || task.priority}
            </Badge>
          </div>

          <div className="font-semibold text-sm mb-0.5">{task.unitName || `Номер ${task.unitId}`}</div>
          <h4 className="text-sm text-foreground mb-1">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>
          )}

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
            {task.estimatedMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {task.estimatedMinutes} хв
              </span>
            )}
            {task.dueDate && (
              <span>{format(new Date(task.dueDate), "d MMM", { locale: uk })}</span>
            )}
          </div>

          <div className="pt-2.5 border-t flex justify-between items-center">
            <span className="text-xs text-muted-foreground truncate max-w-[110px]">
              {task.assignedToName || "Не призначено"}
            </span>
            <div className="flex gap-1.5">
              {task.status === HousekeepingTaskStatus.pending && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700"
                  disabled={anyLoading}
                  onClick={() => handleStart(task.id)}
                >
                  <Play className="w-3 h-3" /> Почати
                </Button>
              )}
              {task.status === HousekeepingTaskStatus.in_progress && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                  disabled={anyLoading}
                  onClick={() => handleComplete(task.id)}
                >
                  <CheckCircle2 className="w-3 h-3" /> Готово
                </Button>
              )}
              {task.status === HousekeepingTaskStatus.completed && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700"
                  disabled={anyLoading}
                  onClick={() => handleVerify(task.id)}
                >
                  <ShieldCheck className="w-3 h-3" /> Перевірити
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Прибирання та задачі</h1>
            <p className="text-muted-foreground mt-1">Дошка задач для покоївок та технічного персоналу</p>
          </div>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Нова задача
          </Button>
        </div>

        {/* Dashboard Stats */}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-amber-700">Очікують</p>
                  <p className="text-xl font-bold text-amber-800">{dashboard.pendingTasks}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-3 flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-blue-700">В процесі</p>
                  <p className="text-xl font-bold text-blue-800">{dashboard.inProgressTasks}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-3 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-emerald-700">Виконано</p>
                  <p className="text-xl font-bold text-emerald-800">{dashboard.completedTasks}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-violet-50 border-violet-200">
              <CardContent className="p-3 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-violet-700">Перевірено</p>
                  <p className="text-xl font-bold text-violet-800">{dashboard.verifiedTasks}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Kanban Board */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
            <div className="flex flex-col bg-amber-50/50 rounded-xl p-4 border border-amber-200/70">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-sm">Очікують ({pendingTasks.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-0.5">
                {pendingTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                {pendingTasks.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Немає задач</div>
                )}
              </div>
            </div>

            <div className="flex flex-col bg-blue-50/50 rounded-xl p-4 border border-blue-200/70">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-sm">В процесі ({inProgressTasks.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-0.5">
                {inProgressTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                {inProgressTasks.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Немає активних</div>
                )}
              </div>
            </div>

            <div className="flex flex-col bg-emerald-50/50 rounded-xl p-4 border border-emerald-200/70">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="font-semibold text-sm">Виконано ({completedTasks.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-0.5">
                {completedTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                {completedTasks.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Ще не виконано</div>
                )}
              </div>
            </div>

            <div className="flex flex-col bg-violet-50/50 rounded-xl p-4 border border-violet-200/70">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-violet-500" />
                <h3 className="font-semibold text-sm">Перевірено ({verifiedTasks.length})</h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-0.5">
                {verifiedTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                {verifiedTasks.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Немає перевірених</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateTaskDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          invalidate();
          toast({ title: "Задачу створено" });
        }}
      />
    </AppLayout>
  );
}
