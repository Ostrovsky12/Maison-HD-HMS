import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar, ChevronLeft, ChevronRight, Plus, RefreshCw,
  Clock, Users, CheckCircle2, XCircle, AlertCircle, Trash2, Edit3,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, subWeeks, addWeeks, parseISO, isSameDay } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/schedule";
const tok = () => localStorage.getItem("hms_token") || "";

const DEPT_LABELS: Record<string, string> = {
  reception: "Рецепція", housekeeping: "Хаускіпінг", fb: "F&B",
  maintenance: "Технічна служба", security: "Охорона", management: "Менеджмент",
  spa: "SPA", other: "Інше",
};
const DEPT_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-700", housekeeping: "bg-green-100 text-green-700",
  fb: "bg-orange-100 text-orange-700", maintenance: "bg-yellow-100 text-yellow-700",
  security: "bg-red-100 text-red-700", management: "bg-purple-100 text-purple-700",
  spa: "bg-pink-100 text-pink-700", other: "bg-gray-100 text-gray-700",
};
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  scheduled:  { label: "Заплановано", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
  confirmed:  { label: "Підтверджено", color: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  completed:  { label: "Виконано",    color: "bg-gray-100 text-gray-500 border-gray-200",  icon: CheckCircle2 },
  absent:     { label: "Відсутній",   color: "bg-red-50 text-red-700 border-red-200",      icon: XCircle },
  cancelled:  { label: "Скасовано",   color: "bg-gray-50 text-gray-400 border-gray-200",   icon: XCircle },
};

const EMPTY_FORM = {
  userId: "", shiftDate: format(new Date(), "yyyy-MM-dd"), startTime: "08:00",
  endTime: "16:00", department: "reception", notes: "", breakMinutes: 30,
};

function ShiftCard({ shift, onEdit, onDelete, onStatus }: any) {
  const cfg = STATUS_CONFIG[shift.status] || STATUS_CONFIG.scheduled;
  const Icon = cfg.icon;
  return (
    <div className={`rounded-md border p-2 text-xs ${cfg.color} relative group`}>
      <div className="font-semibold truncate">{shift.staffName}</div>
      <div className="flex items-center gap-1 text-[10px] opacity-75">
        <Clock size={9} /> {shift.startTime?.slice(0,5)}–{shift.endTime?.slice(0,5)}
      </div>
      <Badge className={`text-[9px] px-1 py-0 mt-1 ${DEPT_COLORS[shift.department]}`}>
        {DEPT_LABELS[shift.department]}
      </Badge>
      <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
        <button
          className="rounded bg-white/80 p-0.5 hover:bg-white"
          onClick={() => onEdit(shift)} title="Редагувати"
        ><Edit3 size={10} /></button>
        <button
          className="rounded bg-white/80 p-0.5 hover:bg-red-100 text-red-600"
          onClick={() => onDelete(shift.id)} title="Видалити"
        ><Trash2 size={10} /></button>
      </div>
    </div>
  );
}

export default function StaffSchedulePage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [shifts, setShifts] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dept, setDept] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"week" | "staff">("week");

  const weekEnd = addDays(weekStart, 6);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const headers = { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" };

  async function load() {
    setLoading(true);
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(weekEnd, "yyyy-MM-dd");
    try {
      const [shRes, stRes, statsRes] = await Promise.all([
        fetch(`${API}/shifts?from=${from}&to=${to}`, { headers }),
        fetch(`${API}/staff`, { headers }),
        fetch(`${API}/stats?from=${from}&to=${to}`, { headers }),
      ]);
      const [sh, st, statsData] = await Promise.all([shRes.json(), stRes.json(), statsRes.json()]);
      setShifts(Array.isArray(sh) ? sh : []);
      setStaff(Array.isArray(st) ? st : []);
      setStats(statsData);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [weekStart]);

  function openCreate(date?: string) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, shiftDate: date || format(new Date(), "yyyy-MM-dd") });
    setModal(true);
  }

  function openEdit(shift: any) {
    setEditing(shift);
    setForm({
      userId: String(shift.userId),
      shiftDate: shift.shiftDate,
      startTime: shift.startTime?.slice(0, 5) || "08:00",
      endTime: shift.endTime?.slice(0, 5) || "16:00",
      department: shift.department,
      notes: shift.notes || "",
      breakMinutes: shift.breakMinutes || 30,
      status: shift.status,
    });
    setModal(true);
  }

  async function handleSave() {
    if (!form.userId || !form.shiftDate) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/shifts/${editing.id}` : `${API}/shifts`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(form) });
      if (!res.ok) throw new Error();
      toast({ title: editing ? "Зміну збережено" : "Зміну додано" });
      setModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("Видалити зміну?")) return;
    try {
      await fetch(`${API}/shifts/${id}`, { method: "DELETE", headers });
      toast({ title: "Зміну видалено" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  async function handleStatus(shift: any, status: string) {
    try {
      await fetch(`${API}/shifts/${shift.id}`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      load();
    } catch {}
  }

  const filteredShifts = useMemo(() =>
    dept === "all" ? shifts : shifts.filter(s => s.department === dept),
    [shifts, dept]
  );

  const shiftsForDay = (day: Date) =>
    filteredShifts.filter(s => isSameDay(parseISO(s.shiftDate), day));

  const shiftsForStaff = (userId: number) =>
    filteredShifts.filter(s => s.userId === userId);

  const totalScheduled = stats?.byStatus?.scheduled || 0;
  const totalConfirmed = stats?.byStatus?.confirmed || 0;
  const totalAbsent    = stats?.byStatus?.absent || 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Розклад персоналу</h1>
            <p className="text-muted-foreground text-sm">
              {format(weekStart, "d MMM", { locale: uk })} – {format(weekEnd, "d MMM yyyy", { locale: uk })}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} /> Оновити
            </Button>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus size={14} className="mr-1" /> Додати зміну
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <Users className="text-blue-500 shrink-0" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Персонал</p>
                <p className="text-xl font-bold">{staff.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <Clock className="text-blue-500 shrink-0" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Зміни на тижні</p>
                <p className="text-xl font-bold">{stats?.totalShifts || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <CheckCircle2 className="text-green-500 shrink-0" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Підтверджено</p>
                <p className="text-xl font-bold">{totalConfirmed}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <XCircle className="text-red-500 shrink-0" size={20} />
              <div>
                <p className="text-xs text-muted-foreground">Відсутні</p>
                <p className="text-xl font-bold">{totalAbsent}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Week nav & filters */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Цей тиждень
            </Button>
            <Button variant="outline" size="icon" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
              <ChevronRight size={16} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Відділ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Усі відділи</SelectItem>
                {Object.entries(DEPT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border overflow-hidden text-sm">
              <button
                className={`px-3 py-1.5 ${view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setView("week")}
              >Тиждень</button>
              <button
                className={`px-3 py-1.5 ${view === "staff" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setView("staff")}
              >По персоналу</button>
            </div>
          </div>
        </div>

        {/* ── Week calendar view ── */}
        {view === "week" && (
          <div className="rounded-md border overflow-auto">
            <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
              {/* Header row */}
              <div className="border-b border-r p-2 bg-muted/40 text-xs font-semibold text-muted-foreground">Персонал</div>
              {weekDays.map(day => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={`border-b border-r p-2 text-xs text-center ${isToday ? "bg-primary/5" : "bg-muted/40"}`}
                  >
                    <div className={`font-semibold ${isToday ? "text-primary" : ""}`}>
                      {format(day, "EEE", { locale: uk })}
                    </div>
                    <div className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                      {format(day, "d")}
                    </div>
                    <button
                      className="mt-1 text-muted-foreground hover:text-primary"
                      onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                      title="Додати зміну"
                    >+ зміна</button>
                  </div>
                );
              })}

              {/* Staff rows */}
              {staff.map(member => (
                <>
                  <div key={`label-${member.id}`} className="border-b border-r p-2 text-xs font-medium flex items-center gap-1">
                    <div>
                      <div className="font-semibold truncate">{member.name}</div>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {DEPT_LABELS[member.role] || member.role}
                      </Badge>
                    </div>
                  </div>
                  {weekDays.map(day => {
                    const dayShifts = shiftsForDay(day).filter(s => s.userId === member.id);
                    return (
                      <div key={`${member.id}-${day}`} className="border-b border-r p-1 space-y-1 min-h-[60px]">
                        {dayShifts.map(shift => (
                          <ShiftCard
                            key={shift.id}
                            shift={shift}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onStatus={handleStatus}
                          />
                        ))}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        )}

        {/* ── Staff list view ── */}
        {view === "staff" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {staff.map(member => {
              const memberShifts = shiftsForStaff(member.id);
              const totalHours = memberShifts.reduce((sum, s) => {
                if (!s.startTime || !s.endTime) return sum;
                const [sh, sm] = s.startTime.split(":").map(Number);
                const [eh, em] = s.endTime.split(":").map(Number);
                let mins = (eh * 60 + em) - (sh * 60 + sm) - (s.breakMinutes || 0);
                if (mins < 0) mins += 24 * 60;
                return sum + mins / 60;
              }, 0);
              return (
                <Card key={member.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{member.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge className={DEPT_COLORS[member.role] || DEPT_COLORS.other}>
                        {DEPT_LABELS[member.role] || member.role}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>{memberShifts.length} змін за тиждень</span>
                      <span className="font-medium">{totalHours.toFixed(1)} год</span>
                    </div>
                    {memberShifts.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Немає змін цього тижня</p>
                    ) : memberShifts.map(shift => {
                      const cfg = STATUS_CONFIG[shift.status] || STATUS_CONFIG.scheduled;
                      return (
                        <div key={shift.id} className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${cfg.color}`}>
                          <div>
                            <span className="font-medium">{format(parseISO(shift.shiftDate), "EEE d MMM", { locale: uk })}</span>
                            <span className="ml-2 opacity-75">{shift.startTime?.slice(0,5)}–{shift.endTime?.slice(0,5)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge className={`text-[9px] px-1 ${DEPT_COLORS[shift.department]}`}>
                              {DEPT_LABELS[shift.department]}
                            </Badge>
                            <button onClick={() => openEdit(shift)}><Edit3 size={10} /></button>
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      variant="outline" size="sm" className="w-full mt-1 text-xs"
                      onClick={() => { setForm({ ...EMPTY_FORM, userId: String(member.id) }); setEditing(null); setModal(true); }}
                    >
                      <Plus size={12} className="mr-1" /> Додати зміну
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create/Edit shift modal ── */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Редагувати зміну" : "Нова зміна"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Співробітник</Label>
              <Select value={form.userId} onValueChange={v => setForm({ ...form, userId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть співробітника" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Дата</Label>
                <Input type="date" value={form.shiftDate} onChange={e => setForm({ ...form, shiftDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Відділ</Label>
                <Select value={form.department} onValueChange={v => setForm({ ...form, department: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEPT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Початок</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Кінець</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Перерва (хв)</Label>
                <Input type="number" value={form.breakMinutes} onChange={e => setForm({ ...form, breakMinutes: parseInt(e.target.value) })} />
              </div>
            </div>
            {editing && (
              <div className="space-y-1">
                <Label>Статус</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Нотатки</Label>
              <Textarea
                placeholder="Додаткові вказівки..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Скасувати</Button>
            <Button onClick={handleSave} disabled={saving || !form.userId || !form.shiftDate}>
              {saving ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
