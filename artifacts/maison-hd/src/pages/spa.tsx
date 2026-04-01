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
  Waves, Calendar, Users, Star, Clock, Plus, CheckCircle2,
  XCircle, RefreshCw, ChevronRight, Ticket, Award, Search,
  Coffee, Dumbbell, Sparkles, Filter, Edit, Activity, DollarSign,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/spa";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const TABS = [
  { id: "schedule", label: "Розклад", icon: Calendar },
  { id: "appointments", label: "Записи", icon: Sparkles },
  { id: "services", label: "Послуги", icon: Star },
  { id: "specialists", label: "Спеціалісти", icon: Users },
  { id: "memberships", label: "Абонементи", icon: Award },
  { id: "daypasses", label: "Day Pass", icon: Ticket },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  no_show: "bg-red-100 text-red-800 border-red-200",
};
const STATUS_UA: Record<string, string> = {
  pending: "Очікує", confirmed: "Підтверджено", in_progress: "В процесі",
  completed: "Завершено", cancelled: "Скасовано", no_show: "Не з'явився",
};
const CATEGORY_UA: Record<string, string> = {
  massage: "Масаж", body: "Тіло", face: "Обличчя", pool: "Басейн",
  sauna: "Сауна", jacuzzi: "Джакузі", fitness: "Фітнес", wellness: "Велнес", other: "Інше",
};
const CATEGORY_ICON: Record<string, any> = {
  massage: Waves, body: Sparkles, face: Star, pool: Waves, sauna: Coffee,
  jacuzzi: Waves, fitness: Dumbbell, wellness: Activity, other: Star,
};
const MEMBERSHIP_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800", paused: "bg-yellow-100 text-yellow-800",
  expired: "bg-gray-100 text-gray-600", cancelled: "bg-red-100 text-red-800",
};

export default function SpaPage() {
  const [tab, setTab] = useState("schedule");
  const [stats, setStats] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [specialists, setSpecialists] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [dayPasses, setDayPasses] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [showNewMembership, setShowNewMembership] = useState(false);
  const [showNewDayPass, setShowNewDayPass] = useState(false);
  const [showNewService, setShowNewService] = useState(false);
  const [showNewSpecialist, setShowNewSpecialist] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadStats = async () => {
    const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json());
  };
  const loadAppointments = async (date?: string, status?: string) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (status && status !== "all") params.set("status", status);
    const r = await apiFetch(`/appointments?${params}`);
    if (r.ok) { const d = await r.json(); setAppointments(d.appointments || []); }
  };
  const loadServices = async () => {
    const r = await apiFetch("/services"); if (r.ok) { const d = await r.json(); setServices(d.services || []); }
  };
  const loadSpecialists = async () => {
    const r = await apiFetch("/specialists"); if (r.ok) { const d = await r.json(); setSpecialists(d.specialists || []); }
  };
  const loadResources = async () => {
    const r = await apiFetch("/resources"); if (r.ok) { const d = await r.json(); setResources(d.resources || []); }
  };
  const loadMemberships = async (status?: string) => {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    const r = await apiFetch(`/memberships?${params}`);
    if (r.ok) { const d = await r.json(); setMemberships(d.memberships || []); }
  };
  const loadDayPasses = async (date?: string) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    const r = await apiFetch(`/day-passes?${params}`);
    if (r.ok) { const d = await r.json(); setDayPasses(d.passes || []); }
  };

  useEffect(() => { loadStats(); loadServices(); loadSpecialists(); loadResources(); }, []);
  useEffect(() => { if (tab === "schedule" || tab === "appointments") loadAppointments(tab === "schedule" ? selectedDate : undefined, statusFilter); }, [tab, selectedDate, statusFilter]);
  useEffect(() => { if (tab === "memberships") loadMemberships(); }, [tab]);
  useEffect(() => { if (tab === "daypasses") loadDayPasses(selectedDate); }, [tab, selectedDate]);

  const handleStatusChange = async (id: number, status: string) => {
    const r = await apiFetch(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) {
      toast({ title: `Статус: ${STATUS_UA[status]}` });
      loadAppointments(tab === "schedule" ? selectedDate : undefined, statusFilter);
      loadStats();
      setSelectedAppt(null);
    }
  };

  const todayAppts = appointments.filter(a => a.appointmentDate === selectedDate);
  const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

  const filteredAppts = appointments.filter(a => {
    if (search && !a.guestName?.toLowerCase().includes(search.toLowerCase()) &&
      !a.serviceName?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Waves className="h-7 w-7 text-blue-600" /> SPA & Wellness
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Управління SPA-процедурами, записами та абонементами</p>
          </div>
          {tab === "schedule" && (
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowNewAppt(true)}>
              <Plus className="h-4 w-4 mr-2" /> Новий запис
            </Button>
          )}
          {tab === "memberships" && (
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowNewMembership(true)}>
              <Plus className="h-4 w-4 mr-2" /> Новий абонемент
            </Button>
          )}
          {tab === "daypasses" && (
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setShowNewDayPass(true)}>
              <Plus className="h-4 w-4 mr-2" /> Видати Day Pass
            </Button>
          )}
          {tab === "services" && (
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowNewService(true)}>
              <Plus className="h-4 w-4 mr-2" /> Нова послуга
            </Button>
          )}
          {tab === "specialists" && (
            <Button className="bg-pink-600 hover:bg-pink-700" onClick={() => setShowNewSpecialist(true)}>
              <Plus className="h-4 w-4 mr-2" /> Новий спеціаліст
            </Button>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Сьогодні записів</p>
                <p className="text-2xl font-bold text-blue-600">{stats.today.total}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stats.today.confirmed} підтв. · {stats.today.pending} очік.</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Завершено сьогодні</p>
                <p className="text-2xl font-bold text-green-600">{stats.today.completed}</p>
                <p className="text-xs text-gray-400 mt-0.5">Day Pass: {stats.today.dayPasses}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Виручка сьогодні</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.today.revenue.toLocaleString()} ₴</p>
                <p className="text-xs text-gray-400 mt-0.5">Day Pass: {stats.today.dayPassRevenue} ₴</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Активні абонементи</p>
                <p className="text-2xl font-bold text-purple-600">{stats.memberships.active}</p>
                <p className="text-xs text-gray-400 mt-0.5">Разом: {stats.memberships.total}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-1 border-b border-gray-200 pb-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ── SCHEDULE ── */}
        {tab === "schedule" && (
          <div className="space-y-4">
            {/* Date nav */}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(d => format(addDays(new Date(d), -1), "yyyy-MM-dd"))}>←</Button>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-44 text-center" />
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(d => format(addDays(new Date(d), 1), "yyyy-MM-dd"))}>→</Button>
              <span className="text-sm text-gray-500 capitalize">{format(new Date(selectedDate + "T12:00:00"), "EEEE, d MMMM", { locale: uk })}</span>
              {selectedDate !== format(new Date(), "yyyy-MM-dd") && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}>Сьогодні</Button>
              )}
            </div>

            {/* Schedule grid */}
            {todayAppts.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-gray-400">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>На цей день записів немає</p>
                <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => setShowNewAppt(true)}><Plus className="h-4 w-4 mr-1" /> Додати запис</Button>
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {todayAppts.map(appt => (
                  <Card key={appt.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAppt(appt)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="w-1 self-stretch rounded-full mt-1" style={{ backgroundColor: appt.specialistColor || "#6366f1", minWidth: 4 }} />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{appt.startTime} – {appt.endTime}</span>
                              <Badge className={`text-xs border ${STATUS_COLORS[appt.status]}`}>{STATUS_UA[appt.status]}</Badge>
                              {appt.isHotelGuest && <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">Гість готелю</Badge>}
                            </div>
                            <p className="font-medium text-gray-800 mt-0.5">{appt.serviceName || "Процедура"}</p>
                            <p className="text-sm text-gray-500">{appt.guestName} · {appt.guestPhone}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {appt.specialistName && <span>{appt.specialistName} · </span>}
                              {appt.resourceName && <span>{appt.resourceName} · </span>}
                              <span className="font-medium text-gray-600">{parseFloat(appt.price || 0).toLocaleString()} ₴</span>
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── APPOINTMENTS ── */}
        {tab === "appointments" && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Пошук по гостю або послузі…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); loadAppointments(undefined, v); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі статуси</SelectItem>
                  {Object.entries(STATUS_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {filteredAppts.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Записів не знайдено</CardContent></Card>
              ) : filteredAppts.map(appt => (
                <Card key={appt.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setSelectedAppt(appt)}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-1 h-12 rounded-full" style={{ backgroundColor: appt.specialistColor || "#6366f1" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{appt.appointmentDate} {appt.startTime}</span>
                        <Badge className={`text-xs border ${STATUS_COLORS[appt.status]}`}>{STATUS_UA[appt.status]}</Badge>
                      </div>
                      <p className="font-semibold truncate">{appt.guestName}</p>
                      <p className="text-sm text-gray-500 truncate">{appt.serviceName} · {appt.specialistName || "—"}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-gray-800">{parseFloat(appt.price || 0).toLocaleString()} ₴</p>
                      <p className="text-xs text-gray-400">{appt.durationMinutes} хв</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── SERVICES ── */}
        {tab === "services" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(svc => {
              const Icon = CATEGORY_ICON[svc.category] || Star;
              return (
                <Card key={svc.id} className={`border-0 shadow-sm ${!svc.isActive ? "opacity-50" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-semibold leading-snug">{svc.name}</p>
                          <Badge variant="outline" className="text-xs flex-shrink-0">{CATEGORY_UA[svc.category]}</Badge>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{svc.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-sm">
                          <span className="flex items-center gap-1 text-gray-600"><Clock className="h-3.5 w-3.5" />{svc.durationMinutes} хв</span>
                          <span className="font-bold text-blue-700">{parseFloat(svc.price).toLocaleString()} ₴</span>
                          {svc.maxGuests && svc.maxGuests > 1 && <span className="text-gray-400">до {svc.maxGuests} ос.</span>}
                        </div>
                        {Array.isArray(svc.tags) && svc.tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {svc.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── SPECIALISTS ── */}
        {tab === "specialists" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {specialists.map(sp => {
              const days = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
              return (
                <Card key={sp.id} className={`border-0 shadow-sm ${!sp.isActive ? "opacity-50" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: sp.color || "#6366f1" }}>
                        {sp.firstName[0]}{sp.lastName[0]}
                      </div>
                      <div>
                        <p className="font-semibold">{sp.firstName} {sp.lastName}</p>
                        <p className="text-sm text-gray-500">{sp.phone}</p>
                      </div>
                    </div>
                    {sp.bio && <p className="text-sm text-gray-600 mb-2">{sp.bio}</p>}
                    {Array.isArray(sp.specializations) && sp.specializations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {sp.specializations.map((s: string) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-2">
                      {days.map((d, i) => (
                        <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${Array.isArray(sp.workDays) && sp.workDays.includes(i) ? "bg-blue-100 text-blue-700 font-medium" : "bg-gray-100 text-gray-400"}`}>{d}</span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{sp.workStart} – {sp.workEnd}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── MEMBERSHIPS ── */}
        {tab === "memberships" && (
          <div className="space-y-3">
            {memberships.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">Абонементів немає</CardContent></Card>
            ) : memberships.map(m => {
              const progress = m.sessionsTotal ? Math.round((m.sessionsUsed / m.sessionsTotal) * 100) : 0;
              const remaining = (m.sessionsTotal || 0) - m.sessionsUsed;
              return (
                <Card key={m.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{m.name}</p>
                          <Badge className={`text-xs ${MEMBERSHIP_STATUS_COLORS[m.status]}`}>{m.status === "active" ? "Активний" : m.status === "paused" ? "Пауза" : m.status === "expired" ? "Вичерпано" : "Скасовано"}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">{m.guestName} · {m.guestPhone}</p>
                        {m.sessionsTotal > 0 && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Використано: {m.sessionsUsed}/{m.sessionsTotal}</span>
                              <span>Залишилось: {remaining}</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{m.startsAt} → {m.expiresAt || "Безстроково"} · Оплата: {parseFloat(m.pricePaid || 0).toLocaleString()} ₴</p>
                      </div>
                      {m.status === "active" && m.sessionsTotal > m.sessionsUsed && (
                        <Button size="sm" variant="outline" className="flex-shrink-0 text-purple-700 border-purple-300 hover:bg-purple-50" onClick={async () => {
                          const r = await apiFetch(`/memberships/${m.id}/use`, { method: "POST" });
                          if (r.ok) { toast({ title: "Сеанс списано" }); loadMemberships(); loadStats(); }
                        }}>Списати сеанс</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── DAY PASSES ── */}
        {tab === "daypasses" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(d => format(addDays(new Date(d), -1), "yyyy-MM-dd"))}>←</Button>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-44 text-center" />
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(d => format(addDays(new Date(d), 1), "yyyy-MM-dd"))}>→</Button>
            </div>
            {dayPasses.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-10 text-center text-gray-400">
                <Ticket className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>Day Pass на цей день не видано</p>
                <Button className="mt-3 bg-teal-600 hover:bg-teal-700" onClick={() => setShowNewDayPass(true)}><Plus className="h-4 w-4 mr-1" />Видати</Button>
              </CardContent></Card>
            ) : dayPasses.map(p => (
              <Card key={p.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center"><Ticket className="h-5 w-5 text-teal-600" /></div>
                    <div className="flex-1">
                      <p className="font-semibold">{p.guestName}</p>
                      <p className="text-sm text-gray-500">{p.guestPhone} · {p.guestCount} {p.guestCount === 1 ? "особа" : "особи"}</p>
                      {Array.isArray(p.includes) && p.includes.length > 0 && (
                        <div className="flex gap-1 mt-1">{p.includes.map((inc: string) => <Badge key={inc} variant="outline" className="text-xs">{inc}</Badge>)}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-teal-700">{parseFloat(p.price || 0).toLocaleString()} ₴</p>
                      <Badge className={`text-xs ${p.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>{p.isActive ? "Активний" : "Закритий"}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Appointment Detail Dialog ── */}
      <Dialog open={!!selectedAppt} onOpenChange={() => setSelectedAppt(null)}>
        <DialogContent className="max-w-md">
          {selectedAppt && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Waves className="h-5 w-5 text-blue-600" /> {selectedAppt.serviceName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Гість</span><span className="font-medium">{selectedAppt.guestName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Телефон</span><span>{selectedAppt.guestPhone}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Дата / час</span><span>{selectedAppt.appointmentDate} {selectedAppt.startTime}–{selectedAppt.endTime}</span></div>
                {selectedAppt.specialistName && <div className="flex justify-between text-sm"><span className="text-gray-500">Спеціаліст</span><span>{selectedAppt.specialistName}</span></div>}
                {selectedAppt.resourceName && <div className="flex justify-between text-sm"><span className="text-gray-500">Кабінет</span><span>{selectedAppt.resourceName}</span></div>}
                <div className="flex justify-between text-sm"><span className="text-gray-500">Ціна</span><span className="font-bold text-blue-700">{parseFloat(selectedAppt.price || 0).toLocaleString()} ₴</span></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Змінити статус:</p>
                <div className="flex flex-wrap gap-2">
                  {["confirmed", "in_progress", "completed", "cancelled", "no_show"].map(s => (
                    <Button key={s} size="sm" variant={selectedAppt.status === s ? "default" : "outline"}
                      className={selectedAppt.status === s ? "bg-blue-600" : ""}
                      onClick={() => handleStatusChange(selectedAppt.id, s)}
                      disabled={selectedAppt.status === s}>
                      {STATUS_UA[s]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      {/* ── New Appointment Dialog ── */}
      <NewAppointmentDialog open={showNewAppt} onClose={() => setShowNewAppt(false)}
        services={services} specialists={specialists} resources={resources}
        defaultDate={selectedDate}
        onSave={async (data: any) => {
          const r = await apiFetch("/appointments", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Запис створено" }); setShowNewAppt(false); loadAppointments(selectedDate, statusFilter); loadStats(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />

      {/* ── New Membership Dialog ── */}
      <NewMembershipDialog open={showNewMembership} onClose={() => setShowNewMembership(false)}
        services={services}
        onSave={async (data: any) => {
          const r = await apiFetch("/memberships", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Абонемент створено" }); setShowNewMembership(false); loadMemberships(); loadStats(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />

      {/* ── New Day Pass Dialog ── */}
      <NewDayPassDialog open={showNewDayPass} onClose={() => setShowNewDayPass(false)}
        defaultDate={selectedDate}
        onSave={async (data: any) => {
          const r = await apiFetch("/day-passes", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Day Pass видано" }); setShowNewDayPass(false); loadDayPasses(selectedDate); loadStats(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />

      {/* ── New Service Dialog ── */}
      <NewServiceDialog open={showNewService} onClose={() => setShowNewService(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/services", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Послугу додано" }); setShowNewService(false); loadServices(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />

      {/* ── New Specialist Dialog ── */}
      <NewSpecialistDialog open={showNewSpecialist} onClose={() => setShowNewSpecialist(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/specialists", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Спеціаліста додано" }); setShowNewSpecialist(false); loadSpecialists(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />
    </AppLayout>
  );
}

// ── Dialog Components ──────────────────────────────────────────────────────────

function NewAppointmentDialog({ open, onClose, services, specialists, resources, defaultDate, onSave }: any) {
  const [form, setForm] = useState({ guestName: "", guestPhone: "", serviceId: "", specialistId: "", resourceId: "", appointmentDate: defaultDate, startTime: "10:00", notes: "", isHotelGuest: false, price: "" });
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) setForm(f => ({ ...f, appointmentDate: defaultDate })); }, [open, defaultDate]);
  const selectedService = services.find((s: any) => String(s.id) === form.serviceId);
  const handleSubmit = async () => {
    if (!form.guestName || !form.serviceId || !form.appointmentDate || !form.startTime) return;
    setLoading(true);
    await onSave({ ...form, serviceId: parseInt(form.serviceId), specialistId: form.specialistId ? parseInt(form.specialistId) : null, resourceId: form.resourceId ? parseInt(form.resourceId) : null, durationMinutes: selectedService?.durationMinutes || 60, price: form.price || selectedService?.price || 0 });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новий запис</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Гість *</Label><Input placeholder="Ім'я гостя" value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} /></div>
            <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.guestPhone} onChange={e => setForm(f => ({ ...f, guestPhone: e.target.value }))} /></div>
          </div>
          <div><Label>Послуга *</Label>
            <Select value={form.serviceId} onValueChange={v => { const svc = services.find((s: any) => String(s.id) === v); setForm(f => ({ ...f, serviceId: v, price: svc?.price || "" })); }}>
              <SelectTrigger><SelectValue placeholder="Оберіть послугу" /></SelectTrigger>
              <SelectContent>{services.filter((s: any) => s.isActive).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.durationMinutes} хв · {parseFloat(s.price).toLocaleString()} ₴)</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Дата *</Label><Input type="date" value={form.appointmentDate} onChange={e => setForm(f => ({ ...f, appointmentDate: e.target.value }))} /></div>
            <div><Label>Час *</Label><Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} /></div>
          </div>
          {selectedService?.requiresSpecialist !== false && (
            <div><Label>Спеціаліст</Label>
              <Select value={form.specialistId} onValueChange={v => setForm(f => ({ ...f, specialistId: v }))}>
                <SelectTrigger><SelectValue placeholder="Оберіть спеціаліста" /></SelectTrigger>
                <SelectContent>{specialists.filter((s: any) => s.isActive).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Кабінет / ресурс</Label>
            <Select value={form.resourceId} onValueChange={v => setForm(f => ({ ...f, resourceId: v }))}>
              <SelectTrigger><SelectValue placeholder="Оберіть кабінет" /></SelectTrigger>
              <SelectContent>{resources.filter((r: any) => r.isActive).map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Ціна (₴)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.isHotelGuest} onChange={e => setForm(f => ({ ...f, isHotelGuest: e.target.checked }))} /> Гість готелю</label></div>
          </div>
          <div><Label>Примітки</Label><Textarea placeholder="Нотатки…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-700">{loading ? "Збереження…" : "Записати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewMembershipDialog({ open, onClose, services, onSave }: any) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({ guestName: "", guestPhone: "", membershipType: "sessions", name: "", sessionsTotal: 10, pricePaid: "", startsAt: today, expiresAt: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!form.guestName || !form.name) return;
    setLoading(true);
    await onSave({ ...form, sessionsTotal: parseInt(String(form.sessionsTotal)) });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новий абонемент</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Гість *</Label><Input placeholder="Ім'я" value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} /></div>
            <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.guestPhone} onChange={e => setForm(f => ({ ...f, guestPhone: e.target.value }))} /></div>
          </div>
          <div><Label>Назва абонементу *</Label><Input placeholder="Абонемент масаж 10 сеансів" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Тип</Label>
              <Select value={form.membershipType} onValueChange={v => setForm(f => ({ ...f, membershipType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sessions">Сеансовий</SelectItem>
                  <SelectItem value="monthly">Місячний</SelectItem>
                  <SelectItem value="annual">Річний</SelectItem>
                  <SelectItem value="day_pass_bundle">Day Pass набір</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Кількість сеансів</Label><Input type="number" value={form.sessionsTotal} onChange={e => setForm(f => ({ ...f, sessionsTotal: parseInt(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Початок</Label><Input type="date" value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} /></div>
            <div><Label>Закінчення</Label><Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
          </div>
          <div><Label>Оплата (₴)</Label><Input type="number" value={form.pricePaid} onChange={e => setForm(f => ({ ...f, pricePaid: e.target.value }))} /></div>
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

function NewDayPassDialog({ open, onClose, defaultDate, onSave }: any) {
  const [form, setForm] = useState({ guestName: "", guestPhone: "", guestCount: 1, passDate: defaultDate, price: "300", includes: "сауна,джакузі", notes: "" });
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) setForm(f => ({ ...f, passDate: defaultDate })); }, [open, defaultDate]);
  const handleSubmit = async () => {
    if (!form.guestName) return;
    setLoading(true);
    await onSave({ ...form, guestCount: parseInt(String(form.guestCount)), includes: form.includes.split(",").map((s: string) => s.trim()).filter(Boolean) });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Видати Day Pass</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Гість *</Label><Input placeholder="Ім'я" value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} /></div>
            <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.guestPhone} onChange={e => setForm(f => ({ ...f, guestPhone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Дата</Label><Input type="date" value={form.passDate} onChange={e => setForm(f => ({ ...f, passDate: e.target.value }))} /></div>
            <div><Label>Осіб</Label><Input type="number" min={1} value={form.guestCount} onChange={e => setForm(f => ({ ...f, guestCount: parseInt(e.target.value) }))} /></div>
            <div><Label>Ціна (₴)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
          </div>
          <div><Label>Включає (через кому)</Label><Input placeholder="сауна, джакузі, басейн" value={form.includes} onChange={e => setForm(f => ({ ...f, includes: e.target.value }))} /></div>
          <div><Label>Примітки</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-teal-600 hover:bg-teal-700">{loading ? "…" : "Видати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewServiceDialog({ open, onClose, onSave }: any) {
  const [form, setForm] = useState({ name: "", description: "", category: "massage", durationMinutes: 60, price: "", maxGuests: 1, requiresSpecialist: true, tags: "" });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    setLoading(true);
    await onSave({ ...form, durationMinutes: parseInt(String(form.durationMinutes)), maxGuests: parseInt(String(form.maxGuests)), tags: form.tags.split(",").map((s: string) => s.trim()).filter(Boolean) });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Нова послуга</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Назва *</Label><Input placeholder="Класичний масаж" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>Опис</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Категорія</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORY_UA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Тривалість (хв)</Label><Input type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: parseInt(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Ціна (₴) *</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
            <div><Label>Макс. гостей</Label><Input type="number" value={form.maxGuests} onChange={e => setForm(f => ({ ...f, maxGuests: parseInt(e.target.value) }))} /></div>
          </div>
          <div><Label>Теги (через кому)</Label><Input placeholder="популярне, преміум" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></div>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.requiresSpecialist} onChange={e => setForm(f => ({ ...f, requiresSpecialist: e.target.checked }))} /> Потребує спеціаліста</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">{loading ? "…" : "Додати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSpecialistDialog({ open, onClose, onSave }: any) {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", bio: "", specializations: "", workStart: "09:00", workEnd: "18:00", color: "#6366f1" });
  const [workDays, setWorkDays] = useState([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(false);
  const DAYS = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName) return;
    setLoading(true);
    await onSave({ ...form, workDays, specializations: form.specializations.split(",").map((s: string) => s.trim()).filter(Boolean) });
    setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новий спеціаліст</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Ім'я *</Label><Input placeholder="Олена" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
            <div><Label>Прізвище *</Label><Input placeholder="Коваль" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
          </div>
          <div><Label>Телефон</Label><Input placeholder="+38050…" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><Label>Спеціалізації (через кому)</Label><Input placeholder="масаж, SPA, ароматерапія" value={form.specializations} onChange={e => setForm(f => ({ ...f, specializations: e.target.value }))} /></div>
          <div><Label>Про спеціаліста</Label><Textarea rows={2} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} /></div>
          <div><Label>Робочі дні</Label>
            <div className="flex gap-1 mt-1 flex-wrap">
              {DAYS.map((d, i) => (
                <button key={i} type="button" onClick={() => setWorkDays(w => w.includes(i) ? w.filter(x => x !== i) : [...w, i])}
                  className={`text-xs px-2 py-1 rounded-full border transition ${workDays.includes(i) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>{d}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Початок</Label><Input type="time" value={form.workStart} onChange={e => setForm(f => ({ ...f, workStart: e.target.value }))} /></div>
            <div><Label>Кінець</Label><Input type="time" value={form.workEnd} onChange={e => setForm(f => ({ ...f, workEnd: e.target.value }))} /></div>
            <div><Label>Колір</Label><Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 p-1" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-pink-600 hover:bg-pink-700">{loading ? "…" : "Додати"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
