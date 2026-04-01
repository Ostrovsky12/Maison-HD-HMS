import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { uk } from "date-fns/locale";
import {
  PartyPopper, Calendar, Users, Building2, CheckSquare, Plus, ChevronRight,
  Star, Briefcase, Cake, Monitor, Sparkles, Music2, UtensilsCrossed,
  Camera, Truck, BedDouble, DollarSign, CheckCircle2, Circle, Clock,
  ArrowLeft, Edit, Tag, Phone, Mail, RotateCcw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/events";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const TABS = [
  { id: "upcoming", label: "Майбутні", icon: Calendar },
  { id: "all", label: "Всі заходи", icon: PartyPopper },
  { id: "spaces", label: "Зали", icon: Building2 },
];

const EVENT_TYPE_UA: Record<string, string> = {
  wedding: "Весілля", corporate: "Корпоратив", birthday: "День народження",
  conference: "Конференція", seminar: "Семінар", gala: "Гала-вечір",
  private: "Приватний", other: "Інший",
};
const EVENT_TYPE_ICON: Record<string, any> = {
  wedding: Star, corporate: Briefcase, birthday: Cake, conference: Monitor,
  seminar: Monitor, gala: Sparkles, private: PartyPopper, other: PartyPopper,
};
const EVENT_TYPE_COLOR: Record<string, string> = {
  wedding: "bg-pink-100 text-pink-800", corporate: "bg-blue-100 text-blue-800",
  birthday: "bg-yellow-100 text-yellow-800", conference: "bg-indigo-100 text-indigo-800",
  seminar: "bg-cyan-100 text-cyan-800", gala: "bg-purple-100 text-purple-800",
  private: "bg-gray-100 text-gray-800", other: "bg-gray-100 text-gray-700",
};
const STATUS_UA: Record<string, string> = {
  inquiry: "Запит", offer_sent: "Пропозиція надіслана", confirmed: "Підтверджено",
  deposit_paid: "Депозит оплачено", completed: "Проведено", cancelled: "Скасовано",
};
const STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-gray-100 text-gray-600 border-gray-200",
  offer_sent: "bg-yellow-100 text-yellow-700 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  deposit_paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};
const TASK_STATUS_UA: Record<string, string> = { pending: "Очікує", in_progress: "В процесі", done: "Виконано", skipped: "Пропущено" };
const SERVICE_CAT_UA: Record<string, string> = {
  catering: "Кейтеринг", decoration: "Декор", music: "Музика",
  equipment: "Обладнання", photo_video: "Фото/Відео", transport: "Транспорт",
  accommodation: "Проживання", other: "Інше",
};
const SERVICE_CAT_ICON: Record<string, any> = {
  catering: UtensilsCrossed, decoration: Sparkles, music: Music2,
  equipment: Monitor, photo_video: Camera, transport: Truck,
  accommodation: BedDouble, other: Tag,
};

export default function EventsPage() {
  const [tab, setTab] = useState("upcoming");
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetail, setEventDetail] = useState<any>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showNewService, setShowNewService] = useState(false);
  const [showNewSpace, setShowNewSpace] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const { toast } = useToast();

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadEvents = async (status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (type && type !== "all") params.set("type", type);
    if (tab === "upcoming") {
      const today = format(new Date(), "yyyy-MM-dd");
      const future = format(addDays(new Date(), 365), "yyyy-MM-dd");
      params.set("from", today); params.set("to", future);
    }
    const r = await apiFetch(`/?${params}`); if (r.ok) { const d = await r.json(); setEvents(d.events || []); }
  };
  const loadSpaces = async () => { const r = await apiFetch("/spaces"); if (r.ok) { const d = await r.json(); setSpaces(d.spaces || []); } };
  const loadEventDetail = async (id: number) => {
    const r = await apiFetch(`/${id}`);
    if (r.ok) { const d = await r.json(); setEventDetail(d); }
  };

  useEffect(() => { loadStats(); loadSpaces(); }, []);
  useEffect(() => { loadEvents(statusFilter, typeFilter); setSelectedEvent(null); setEventDetail(null); }, [tab, statusFilter, typeFilter]);

  const handleEventClick = async (ev: any) => {
    setSelectedEvent(ev);
    await loadEventDetail(ev.id);
  };

  const handleStatusChange = async (id: number, status: string) => {
    const r = await apiFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) { toast({ title: `Статус: ${STATUS_UA[status]}` }); loadEvents(statusFilter, typeFilter); loadStats(); loadEventDetail(id); }
  };

  const handleTaskToggle = async (taskId: number, currentStatus: string) => {
    const newStatus = currentStatus === "done" ? "pending" : "done";
    const r = await apiFetch(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
    if (r.ok && eventDetail) { await loadEventDetail(eventDetail.event.id); }
  };

  const handleServiceConfirm = async (svcId: number, isConfirmed: boolean) => {
    const r = await apiFetch(`/services/${svcId}`, { method: "PATCH", body: JSON.stringify({ isConfirmed: !isConfirmed }) });
    if (r.ok && eventDetail) { await loadEventDetail(eventDetail.event.id); }
  };

  const handleDepositToggle = async (id: number, current: boolean) => {
    const r = await apiFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ depositPaid: !current }) });
    if (r.ok) { toast({ title: !current ? "Депозит оплачено ✓" : "Депозит скасовано" }); loadEvents(statusFilter, typeFilter); loadEventDetail(id); }
  };

  if (selectedEvent && eventDetail) {
    return <EventDetailView event={eventDetail.event} services={eventDetail.services || []} tasks={eventDetail.tasks || []}
      spaces={spaces} onBack={() => { setSelectedEvent(null); setEventDetail(null); }}
      onStatusChange={handleStatusChange} onTaskToggle={handleTaskToggle} onServiceConfirm={handleServiceConfirm}
      onDepositToggle={handleDepositToggle} onAddService={() => setShowNewService(true)}
      showNewService={showNewService} onCloseService={() => setShowNewService(false)}
      onSaveService={async (data: any) => {
        const r = await apiFetch(`/${eventDetail.event.id}/services`, { method: "POST", body: JSON.stringify(data) });
        if (r.ok) { toast({ title: "Послугу додано" }); setShowNewService(false); loadEventDetail(eventDetail.event.id); }
        else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
      }} />;
  }

  const upcomingList = events.filter(e => !["cancelled", "completed"].includes(e.status));
  const displayList = tab === "upcoming" ? upcomingList : events;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PartyPopper className="h-7 w-7 text-purple-600" /> Events & Banquet
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Управління заходами, банкетами та залами</p>
          </div>
          {tab !== "spaces" && (
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowNewEvent(true)}>
              <Plus className="h-4 w-4 mr-2" /> Новий захід
            </Button>
          )}
          {tab === "spaces" && (
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowNewSpace(true)}>
              <Plus className="h-4 w-4 mr-2" /> Новий зал
            </Button>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Майбутніх заходів</p>
              <p className="text-2xl font-bold text-purple-600">{stats.upcoming}</p>
              <p className="text-xs text-gray-400">Цього тижня: {stats.thisWeek}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Підтверджено</p>
              <p className="text-2xl font-bold text-blue-600">{stats.confirmed}</p>
              <p className="text-xs text-gray-400">Проведено: {stats.completed}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Виручка (проведені)</p>
              <p className="text-2xl font-bold text-green-600">{stats.totalRevenue?.toLocaleString()} ₴</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Очікується виручка</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.upcomingRevenue?.toLocaleString()} ₴</p>
            </CardContent></Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* Filters (events tabs) */}
        {tab !== "spaces" && (
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Статус" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі статуси</SelectItem>
                {Object.entries(STATUS_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Тип" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі типи</SelectItem>
                {Object.entries(EVENT_TYPE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* EVENTS LIST */}
        {tab !== "spaces" && (
          <div className="space-y-3">
            {displayList.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-gray-400">
                <PartyPopper className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Заходів не знайдено</p>
                <Button className="mt-4 bg-purple-600 hover:bg-purple-700" onClick={() => setShowNewEvent(true)}><Plus className="h-4 w-4 mr-1" />Створити захід</Button>
              </CardContent></Card>
            ) : displayList.map(ev => {
              const TypeIcon = EVENT_TYPE_ICON[ev.eventType] || PartyPopper;
              const daysLeft = Math.ceil((new Date(ev.eventDate + "T12:00:00").getTime() - Date.now()) / 86400000);
              return (
                <Card key={ev.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleEventClick(ev)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: ev.spaceColor ? ev.spaceColor + "20" : "#8b5cf620" }}>
                        <TypeIcon className="h-5 w-5" style={{ color: ev.spaceColor || "#8b5cf6" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{ev.name}</p>
                          <Badge className={`text-xs ${EVENT_TYPE_COLOR[ev.eventType]}`}>{EVENT_TYPE_UA[ev.eventType]}</Badge>
                          <Badge className={`text-xs border ${STATUS_COLORS[ev.status]}`}>{STATUS_UA[ev.status]}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />
                            {format(new Date(ev.eventDate + "T12:00:00"), "d MMMM yyyy", { locale: uk })}
                            {daysLeft > 0 && daysLeft < 30 && <span className="text-orange-600 font-medium ml-1">({daysLeft} дн.)</span>}
                            {daysLeft <= 0 && daysLeft > -3 && <span className="text-blue-600 font-medium ml-1">(сьогодні/вчора)</span>}
                          </span>
                          <span>{ev.startTime}–{ev.endTime}</span>
                          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{ev.guestCount} гостей</span>
                          {ev.spaceName && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{ev.spaceName}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-gray-500">{ev.clientName}</span>
                          <span className="font-bold text-purple-700 text-sm">{parseFloat(ev.totalPrice || 0).toLocaleString()} ₴</span>
                          {ev.depositPaid && <Badge className="text-xs bg-green-100 text-green-700">Депозит ✓</Badge>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* SPACES */}
        {tab === "spaces" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spaces.map(sp => (
              <Card key={sp.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: sp.color + "20" }}>
                      <Building2 className="h-6 w-6" style={{ color: sp.color }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-base">{sp.name}</p>
                      {sp.description && <p className="text-sm text-gray-500 mt-0.5">{sp.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
                        <span className="flex items-center gap-1 text-gray-600"><Users className="h-3.5 w-3.5" />{sp.capacityMin}–{sp.capacityMax} осіб</span>
                        {sp.areaSqm && <span className="text-gray-500">{sp.areaSqm} м²</span>}
                        <span className="font-medium text-purple-700">{parseFloat(sp.pricePerDay || 0).toLocaleString()} ₴/день</span>
                        <span className="text-gray-400">{parseFloat(sp.pricePerHour || 0).toLocaleString()} ₴/год</span>
                      </div>
                      {Array.isArray(sp.amenities) && sp.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sp.amenities.map((a: string) => <Badge key={a} variant="outline" className="text-xs">{a}</Badge>)}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <NewEventDialog open={showNewEvent} onClose={() => setShowNewEvent(false)} spaces={spaces}
        onSave={async (data: any) => {
          const r = await apiFetch("/", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Захід створено" }); setShowNewEvent(false); loadEvents(statusFilter, typeFilter); loadStats(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />

      <NewSpaceDialog open={showNewSpace} onClose={() => setShowNewSpace(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/spaces", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Зал додано" }); setShowNewSpace(false); loadSpaces(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />
    </AppLayout>
  );
}

// ── Event Detail View ─────────────────────────────────────────────────────────
function EventDetailView({ event, services, tasks, spaces, onBack, onStatusChange, onTaskToggle, onServiceConfirm, onDepositToggle, onAddService, showNewService, onCloseService, onSaveService }: any) {
  const TypeIcon = EVENT_TYPE_ICON[event.eventType] || PartyPopper;
  const doneTasks = tasks.filter((t: any) => t.status === "done").length;
  const taskProgress = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
        {/* Back + header */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="mt-0.5 flex-shrink-0"><ArrowLeft className="h-4 w-4 mr-1" />Назад</Button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{event.name}</h1>
              <Badge className={`text-xs ${EVENT_TYPE_COLOR[event.eventType]}`}>{EVENT_TYPE_UA[event.eventType]}</Badge>
              <Badge className={`text-xs border ${STATUS_COLORS[event.status]}`}>{STATUS_UA[event.status]}</Badge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {format(new Date(event.eventDate + "T12:00:00"), "d MMMM yyyy (EEEE)", { locale: uk })} · {event.startTime}–{event.endTime}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Info */}
          <div className="space-y-4">
            {/* Client */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Клієнт</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                <p className="font-semibold">{event.clientName}</p>
                {event.clientPhone && <p className="flex items-center gap-1.5 text-sm text-gray-600"><Phone className="h-3.5 w-3.5" />{event.clientPhone}</p>}
                {event.clientEmail && <p className="flex items-center gap-1.5 text-sm text-gray-600"><Mail className="h-3.5 w-3.5" />{event.clientEmail}</p>}
              </CardContent>
            </Card>

            {/* Details */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Деталі</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  ["Гостей", `${event.guestCount} осіб`],
                  ["Зал", event.spaceName || "—"],
                  ["Площадка", event.areaSqm ? `${event.areaSqm} м²` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm"><span className="text-gray-500">{k}</span><span className="font-medium">{v}</span></div>
                ))}
                {event.notes && <div className="pt-1 text-sm text-gray-600 border-t border-gray-100">{event.notes}</div>}
              </CardContent>
            </Card>

            {/* Financials */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-1"><DollarSign className="h-4 w-4" />Фінанси</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  ["Зал", `${parseFloat(event.venuePrice || 0).toLocaleString()} ₴`],
                  ["Послуги", `${parseFloat(event.servicesPrice || 0).toLocaleString()} ₴`],
                  ["ВСЬОГО", `${parseFloat(event.totalPrice || 0).toLocaleString()} ₴`],
                  ["Депозит", `${parseFloat(event.depositAmount || 0).toLocaleString()} ₴`],
                ].map(([k, v], i) => (
                  <div key={k} className={`flex justify-between text-sm ${i === 2 ? "font-bold border-t border-gray-200 pt-1" : ""}`}>
                    <span className={i === 2 ? "text-gray-800" : "text-gray-500"}>{k}</span>
                    <span className={i === 2 ? "text-purple-700 text-base" : ""}>{v}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-sm text-gray-500">Статус депозиту</span>
                  <button onClick={() => onDepositToggle(event.id, event.depositPaid)}
                    className={`text-xs px-2 py-1 rounded-full font-medium border transition ${event.depositPaid ? "bg-green-100 text-green-700 border-green-300" : "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-green-100"}`}>
                    {event.depositPaid ? "✓ Оплачено" : "Не оплачено — натисніть"}
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Status change */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Змінити статус</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_UA).map(([s, l]) => (
                    <button key={s} onClick={() => onStatusChange(event.id, s)}
                      disabled={event.status === s}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${event.status === s ? `${STATUS_COLORS[s]} opacity-100 cursor-default` : "bg-white border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-700"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Tasks + Services */}
          <div className="space-y-4">
            {/* Tasks */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-1"><CheckSquare className="h-4 w-4" />Завдання</CardTitle>
                  <span className="text-xs text-gray-400">{doneTasks}/{tasks.length} · {taskProgress}%</span>
                </div>
                {tasks.length > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                    <div className="bg-purple-500 h-1.5 rounded-full transition-all" style={{ width: `${taskProgress}%` }} />
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-1">
                {tasks.map((task: any) => (
                  <div key={task.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <button onClick={() => onTaskToggle(task.id, task.status)} className="mt-0.5 flex-shrink-0">
                      {task.status === "done"
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : task.status === "in_progress"
                          ? <Clock className="h-4 w-4 text-blue-500" />
                          : <Circle className="h-4 w-4 text-gray-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${task.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>{task.title}</p>
                      {task.dueDate && <p className="text-xs text-gray-400">{task.dueDate}</p>}
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Завдань немає</p>}
              </CardContent>
            </Card>

            {/* Services */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Замовлені послуги</CardTitle>
                  <Button size="sm" variant="outline" onClick={onAddService} className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Додати</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {services.map((svc: any) => {
                  const Icon = SERVICE_CAT_ICON[svc.category] || Tag;
                  return (
                    <div key={svc.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
                      <Icon className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium">{svc.name}</p>
                          <Badge variant="outline" className="text-xs">{SERVICE_CAT_UA[svc.category]}</Badge>
                          {svc.isConfirmed && <Badge className="text-xs bg-green-100 text-green-700">✓</Badge>}
                        </div>
                        {svc.vendorName && <p className="text-xs text-gray-500">{svc.vendorName}</p>}
                        <p className="text-xs text-gray-600">{svc.quantity} × {parseFloat(svc.unitPrice || 0).toLocaleString()} = <span className="font-medium">{parseFloat(svc.totalPrice || 0).toLocaleString()} ₴</span></p>
                      </div>
                      <button onClick={() => onServiceConfirm(svc.id, svc.isConfirmed)}
                        className={`text-xs px-2 py-0.5 rounded border transition ${svc.isConfirmed ? "bg-green-50 border-green-200 text-green-600" : "bg-white border-gray-200 text-gray-400 hover:border-green-300"}`}>
                        {svc.isConfirmed ? "✓" : "○"}
                      </button>
                    </div>
                  );
                })}
                {services.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Послуг не додано</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <NewEventServiceDialog open={showNewService} onClose={onCloseService} onSave={onSaveService} />
    </AppLayout>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────────
function NewEventDialog({ open, onClose, spaces, onSave }: any) {
  const tomorrow = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const [form, setForm] = useState({ name: "", clientName: "", clientPhone: "", clientEmail: "", eventType: "wedding", eventSpaceId: "", eventDate: tomorrow, startTime: "14:00", endTime: "22:00", guestCount: 50, venuePrice: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!form.name || !form.clientName || !form.eventDate) return;
    setLoading(true);
    await onSave({ ...form, eventSpaceId: form.eventSpaceId ? parseInt(form.eventSpaceId) : null, guestCount: parseInt(String(form.guestCount)) });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Новий захід</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Назва заходу *</Label><Input placeholder="Весілля Олексія та Анни" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Клієнт *</Label><Input placeholder="Ім'я" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div>
            <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} /></div>
          </div>
          <div><Label>Email</Label><Input placeholder="client@email.com" value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Тип заходу</Label>
              <Select value={form.eventType} onValueChange={v => setForm(f => ({ ...f, eventType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EVENT_TYPE_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Зал</Label>
              <Select value={form.eventSpaceId} onValueChange={v => setForm(f => ({ ...f, eventSpaceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Оберіть зал" /></SelectTrigger>
                <SelectContent>{spaces.filter((s: any) => s.isActive).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name} (до {s.capacityMax} ос.)</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Дата *</Label><Input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} /></div>
            <div><Label>Початок</Label><Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} /></div>
            <div><Label>Кінець</Label><Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Гостей</Label><Input type="number" value={form.guestCount} onChange={e => setForm(f => ({ ...f, guestCount: parseInt(e.target.value) }))} /></div>
            <div><Label>Вартість залу (₴)</Label><Input type="number" value={form.venuePrice} onChange={e => setForm(f => ({ ...f, venuePrice: e.target.value }))} /></div>
          </div>
          <div><Label>Примітки</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-purple-600 hover:bg-purple-700">{loading ? "…" : "Створити"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewEventServiceDialog({ open, onClose, onSave }: any) {
  const [form, setForm] = useState({ category: "catering", name: "", quantity: 1, unitPrice: "", vendorName: "", vendorPhone: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!form.name || !form.unitPrice) return;
    setLoading(true);
    await onSave({ ...form, quantity: parseInt(String(form.quantity)) });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Додати послугу до заходу</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Категорія</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SERVICE_CAT_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Назва *</Label><Input placeholder="Банкетне меню" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Кількість</Label><Input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) }))} /></div>
            <div><Label>Ціна за одиницю (₴) *</Label><Input type="number" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Підрядник</Label><Input placeholder="Назва компанії" value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} /></div>
            <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.vendorPhone} onChange={e => setForm(f => ({ ...f, vendorPhone: e.target.value }))} /></div>
          </div>
          <div><Label>Примітки</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-700">{loading ? "…" : "Додати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSpaceDialog({ open, onClose, onSave }: any) {
  const [form, setForm] = useState({ name: "", description: "", capacityMin: 10, capacityMax: 100, areaSqm: "", pricePerHour: "", pricePerDay: "", amenities: "", color: "#8b5cf6" });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!form.name) return;
    setLoading(true);
    await onSave({ ...form, capacityMin: parseInt(String(form.capacityMin)), capacityMax: parseInt(String(form.capacityMax)), areaSqm: form.areaSqm ? parseInt(form.areaSqm) : null, amenities: form.amenities.split(",").map((s: string) => s.trim()).filter(Boolean) });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новий зал / майданчик</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Назва *</Label><Input placeholder="Великий банкетний зал" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Опис</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Мін. гостей</Label><Input type="number" value={form.capacityMin} onChange={e => setForm(f => ({ ...f, capacityMin: parseInt(e.target.value) }))} /></div>
            <div><Label>Макс. гостей</Label><Input type="number" value={form.capacityMax} onChange={e => setForm(f => ({ ...f, capacityMax: parseInt(e.target.value) }))} /></div>
            <div><Label>Площа (м²)</Label><Input type="number" value={form.areaSqm} onChange={e => setForm(f => ({ ...f, areaSqm: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Ціна/год (₴)</Label><Input type="number" value={form.pricePerHour} onChange={e => setForm(f => ({ ...f, pricePerHour: e.target.value }))} /></div>
            <div><Label>Ціна/день (₴)</Label><Input type="number" value={form.pricePerDay} onChange={e => setForm(f => ({ ...f, pricePerDay: e.target.value }))} /></div>
          </div>
          <div><Label>Зручності (через кому)</Label><Input placeholder="сцена, проектор, кондиціонер" value={form.amenities} onChange={e => setForm(f => ({ ...f, amenities: e.target.value }))} /></div>
          <div><Label>Колір</Label><Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 p-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">{loading ? "…" : "Додати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
