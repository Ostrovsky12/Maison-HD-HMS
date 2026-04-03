import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, AlertTriangle, Clock, CheckCircle2, XCircle, TrendingUp, Plus,
  Calendar, Building2, User, DollarSign, ChevronRight, RefreshCw, AlertCircle,
  BarChart3, Zap, Filter, Search, Play, ArrowRight, Tag, ClipboardList,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_ROOT = BASE.replace("/maison-hd", "");
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API_ROOT + path, {
    ...opts,
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  }).then(r => r.json());

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  critical: { label: "Критичний", color: "text-red-700", bg: "bg-red-100 border-red-300", icon: AlertTriangle },
  high: { label: "Високий", color: "text-orange-700", bg: "bg-orange-100 border-orange-300", icon: AlertCircle },
  medium: { label: "Середній", color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-300", icon: Clock },
  low: { label: "Низький", color: "text-blue-700", bg: "bg-blue-100 border-blue-300", icon: ChevronRight },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  open: { label: "Відкрита", badge: "bg-gray-100 text-gray-700" },
  in_progress: { label: "В роботі", badge: "bg-blue-100 text-blue-700" },
  pending_parts: { label: "Очікує запчастини", badge: "bg-yellow-100 text-yellow-700" },
  resolved: { label: "Вирішено", badge: "bg-green-100 text-green-700" },
  cancelled: { label: "Скасовано", badge: "bg-gray-100 text-gray-500" },
  escalated: { label: "Ескалація", badge: "bg-red-100 text-red-700" },
};

const CATEGORY_LABELS: Record<string, string> = {
  plumbing: "Сантехніка", electrical: "Електрика", hvac: "HVAC/Клімат",
  carpentry: "Столярні роботи", cleaning: "Прибирання", painting: "Фарбування",
  elevator: "Ліфт", pool: "Басейн", garden: "Сад/Прибудинкова", security: "Безпека",
  it: "IT та зв'язок", furniture: "Меблі", appliances: "Техніка",
  structural: "Конструкція", other: "Інше",
};

const FREQ_LABELS: Record<string, string> = {
  daily: "Щоденно", weekly: "Щотижня", biweekly: "Кожні 2 тижні",
  monthly: "Щомісяця", quarterly: "Раз на квартал",
  semiannual: "Раз на пів року", annual: "Раз на рік",
};

function fmt(n: any) { return n ? Number(n).toLocaleString("uk-UA") : "0"; }
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"requests" | "schedules" | "analytics" | "detail">("requests");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch] = useState("");
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showNewSchedule, setShowNewSchedule] = useState(false);
  const [newLog, setNewLog] = useState("");

  const [newReq, setNewReq] = useState({
    title: "", description: "", category: "other", priority: "medium",
    estimatedDurationMin: "", estimatedCost: "", vendorName: "", notes: "", dueDate: "",
  });
  const [newSched, setNewSched] = useState({
    title: "", description: "", category: "other", frequency: "monthly",
    estimatedDurationMin: "", estimatedCost: "", vendorName: "", nextDueAt: "",
    advanceNoticeDays: "3",
  });

  const statsQ = useQuery({
    queryKey: ["maintenance-stats"],
    queryFn: () => apiFetch("/api/maintenance/stats"),
  });

  const listQ = useQuery({
    queryKey: ["maintenance-list", filterStatus, filterPriority, filterCategory, search],
    queryFn: () => {
      const p = new URLSearchParams({ status: filterStatus, limit: "100" });
      if (filterPriority) p.set("priority", filterPriority);
      if (filterCategory) p.set("category", filterCategory);
      if (search) p.set("search", search);
      return apiFetch("/api/maintenance/?" + p.toString());
    },
  });

  const schedulesQ = useQuery({
    queryKey: ["maintenance-schedules"],
    queryFn: () => apiFetch("/api/maintenance/schedules/list"),
  });

  const detailQ = useQuery({
    queryKey: ["maintenance-detail", selectedId],
    queryFn: () => apiFetch(`/api/maintenance/${selectedId}`),
    enabled: !!selectedId,
  });

  const analyticsQ = useQuery({
    queryKey: ["maintenance-analytics"],
    queryFn: () => apiFetch("/api/maintenance/analytics/costs?period=6"),
  });

  const createReqM = useMutation({
    mutationFn: (data: any) => apiFetch("/api/maintenance/", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-list"] });
      qc.invalidateQueries({ queryKey: ["maintenance-stats"] });
      toast({ title: "Заявку створено" });
      setShowNewRequest(false);
      setNewReq({ title: "", description: "", category: "other", priority: "medium", estimatedDurationMin: "", estimatedCost: "", vendorName: "", notes: "", dueDate: "" });
    },
  });

  const updateReqM = useMutation({
    mutationFn: ({ id, data }: any) => apiFetch(`/api/maintenance/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-list"] });
      qc.invalidateQueries({ queryKey: ["maintenance-stats"] });
      qc.invalidateQueries({ queryKey: ["maintenance-detail", selectedId] });
      toast({ title: "Заявку оновлено" });
    },
  });

  const deleteReqM = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/maintenance/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-list"] });
      qc.invalidateQueries({ queryKey: ["maintenance-stats"] });
      setTab("requests");
      setSelectedId(null);
      toast({ title: "Заявку видалено" });
    },
  });

  const addLogM = useMutation({
    mutationFn: ({ id, note }: any) => apiFetch(`/api/maintenance/${id}/logs`, { method: "POST", body: JSON.stringify({ note }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-detail", selectedId] });
      setNewLog("");
      toast({ title: "Коментар додано" });
    },
  });

  const createSchedM = useMutation({
    mutationFn: (data: any) => apiFetch("/api/maintenance/schedules", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-schedules"] });
      qc.invalidateQueries({ queryKey: ["maintenance-stats"] });
      toast({ title: "Розклад ТО створено" });
      setShowNewSchedule(false);
      setNewSched({ title: "", description: "", category: "other", frequency: "monthly", estimatedDurationMin: "", estimatedCost: "", vendorName: "", nextDueAt: "", advanceNoticeDays: "3" });
    },
  });

  const performSchedM = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/maintenance/schedules/${id}/perform`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-schedules"] });
      qc.invalidateQueries({ queryKey: ["maintenance-list"] });
      qc.invalidateQueries({ queryKey: ["maintenance-stats"] });
      toast({ title: "ТО виконано — наступну дату розраховано автоматично" });
    },
  });

  const stats = statsQ.data;
  const requests = listQ.data?.requests ?? [];
  const schedules = schedulesQ.data?.schedules ?? [];
  const detail = detailQ.data?.request;
  const logs = detailQ.data?.logs ?? [];
  const analytics = analyticsQ.data;

  function openDetail(id: number) {
    setSelectedId(id);
    setTab("detail");
  }

  const tabs = [
    { id: "requests", label: "Заявки", icon: Wrench },
    { id: "schedules", label: "Профілактика", icon: Calendar },
    { id: "analytics", label: "Аналітика", icon: BarChart3 },
    ...(selectedId ? [{ id: "detail", label: "Деталі заявки", icon: ClipboardList }] : []),
  ] as const;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="w-7 h-7 text-blue-600" /> Технічна служба
            </h1>
            <p className="text-gray-500 text-sm mt-1">Управління заявками, профілактичним ТО, витратами</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["maintenance-stats"] }); qc.invalidateQueries({ queryKey: ["maintenance-list"] }); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> Оновити
            </Button>
            <Button size="sm" onClick={() => setShowNewRequest(true)}>
              <Plus className="w-4 h-4 mr-1" /> Нова заявка
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: "Всього", value: stats.total, icon: Wrench, color: "text-gray-600", bg: "bg-gray-50" },
              { label: "Відкрито", value: stats.open, icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "В роботі", value: stats.in_progress, icon: Play, color: "text-indigo-600", bg: "bg-indigo-50" },
              { label: "Критичних", value: stats.critical_open, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
              { label: "Ескалація", value: stats.escalated, icon: Zap, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "Прострочено", value: stats.overdue, icon: Clock, color: "text-red-700", bg: "bg-red-50" },
              { label: "ТО найближчі 7д", value: stats.upcomingScheduled, icon: Calendar, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "Серед. час (хв)", value: stats.avg_resolution_min ?? "—", icon: Clock, color: "text-green-600", bg: "bg-green-50" },
            ].map(k => (
              <div key={k.label} className={`rounded-xl border p-3 ${k.bg}`}>
                <k.icon className={`w-4 h-4 mb-1 ${k.color}`} />
                <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-gray-500 leading-tight">{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ─── REQUESTS TAB ─────────────────────────────────────────────────── */}
        {tab === "requests" && (
          <div className="space-y-4">
            {/* New Request Modal */}
            {showNewRequest && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <h2 className="text-lg font-bold mb-4">Нова заявка на ТО</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Назва заявки *</label>
                        <Input value={newReq.title} onChange={e => setNewReq(f => ({ ...f, title: e.target.value }))} placeholder="Коротко опишіть проблему" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Опис</label>
                        <Textarea value={newReq.description} onChange={e => setNewReq(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Детальний опис проблеми" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Категорія</label>
                        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newReq.category} onChange={e => setNewReq(f => ({ ...f, category: e.target.value }))}>
                          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Пріоритет</label>
                        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newReq.priority} onChange={e => setNewReq(f => ({ ...f, priority: e.target.value }))}>
                          {Object.entries(PRIORITY_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Очікуваний час (хв)</label>
                        <Input type="number" value={newReq.estimatedDurationMin} onChange={e => setNewReq(f => ({ ...f, estimatedDurationMin: e.target.value }))} placeholder="60" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Орієнтовна вартість ₴</label>
                        <Input type="number" value={newReq.estimatedCost} onChange={e => setNewReq(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="1500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Підрядник / майстер</label>
                        <Input value={newReq.vendorName} onChange={e => setNewReq(f => ({ ...f, vendorName: e.target.value }))} placeholder="ТОВ Ремонтник" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Дедлайн</label>
                        <Input type="datetime-local" value={newReq.dueDate} onChange={e => setNewReq(f => ({ ...f, dueDate: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Нотатки</label>
                        <Textarea value={newReq.notes} onChange={e => setNewReq(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Додаткова інформація..." />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button className="flex-1" onClick={() => createReqM.mutate({
                        ...newReq,
                        estimatedDurationMin: newReq.estimatedDurationMin ? parseInt(newReq.estimatedDurationMin) : undefined,
                        estimatedCost: newReq.estimatedCost ? parseFloat(newReq.estimatedCost) : undefined,
                      })} disabled={!newReq.title}>Створити заявку</Button>
                      <Button variant="outline" onClick={() => setShowNewRequest(false)}>Скасувати</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                <Input className="pl-8 w-52" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-500"><Filter className="w-4 h-4" /></div>
              {[
                { val: "all", label: "Всі" }, { val: "open", label: "Відкриті" },
                { val: "in_progress", label: "В роботі" }, { val: "escalated", label: "Ескалація" },
                { val: "pending_parts", label: "Запчастини" }, { val: "resolved", label: "Вирішені" },
              ].map(s => (
                <button key={s.val} onClick={() => setFilterStatus(s.val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterStatus === s.val ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                  {s.label}
                </button>
              ))}
              <select className="border rounded-lg px-2 py-1.5 text-xs" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="">Всі пріоритети</option>
                {Object.entries(PRIORITY_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
              <select className="border rounded-lg px-2 py-1.5 text-xs" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="">Всі категорії</option>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* Request list */}
            <div className="space-y-2">
              {listQ.isLoading && <div className="text-center py-8 text-gray-400">Завантаження...</div>}
              {requests.length === 0 && !listQ.isLoading && <div className="text-center py-8 text-gray-400">Заявок не знайдено</div>}
              {requests.map((r: any) => {
                const pCfg = PRIORITY_CONFIG[r.priority] ?? PRIORITY_CONFIG.medium;
                const sCfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.open;
                return (
                  <div key={r.id} onClick={() => openDetail(r.id)}
                    className={`border-l-4 rounded-xl border p-4 bg-white hover:shadow-md cursor-pointer transition-all ${r.priority === "critical" ? "border-l-red-500" : r.priority === "high" ? "border-l-orange-400" : r.priority === "medium" ? "border-l-yellow-400" : "border-l-blue-300"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <pCfg.icon className={`w-4 h-4 ${pCfg.color}`} />
                          <span className="font-semibold text-sm">{r.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sCfg.badge}`}>{sCfg.label}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                        </div>
                        {r.description && <p className="text-xs text-gray-500 mb-1 line-clamp-1">{r.description}</p>}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          {r.property_name && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{r.property_name}</span>}
                          {r.unit_name && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{r.unit_name}</span>}
                          {r.assigned_to_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{r.assigned_to_name}</span>}
                          {r.estimated_cost && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{fmt(r.estimated_cost)} ₴</span>}
                          {r.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(r.due_date)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-gray-400">#{r.id}</span>
                        <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                        <ArrowRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── SCHEDULES TAB ─────────────────────────────────────────────────── */}
        {tab === "schedules" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Профілактичне технічне обслуговування</h2>
              <Button size="sm" onClick={() => setShowNewSchedule(true)}><Plus className="w-4 h-4 mr-1" /> Новий розклад</Button>
            </div>

            {/* New Schedule Modal */}
            {showNewSchedule && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <h2 className="text-lg font-bold mb-4">Новий розклад ТО</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Назва *</label>
                        <Input value={newSched.title} onChange={e => setNewSched(f => ({ ...f, title: e.target.value }))} placeholder="ТО кондиціонерів 2-го поверху" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 mb-1 block">Опис</label>
                        <Textarea value={newSched.description} onChange={e => setNewSched(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Що включає це ТО?" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Категорія</label>
                        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newSched.category} onChange={e => setNewSched(f => ({ ...f, category: e.target.value }))}>
                          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Частота</label>
                        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newSched.frequency} onChange={e => setNewSched(f => ({ ...f, frequency: e.target.value }))}>
                          {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Час виконання (хв)</label>
                        <Input type="number" value={newSched.estimatedDurationMin} onChange={e => setNewSched(f => ({ ...f, estimatedDurationMin: e.target.value }))} placeholder="120" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Орієнтовна вартість ₴</label>
                        <Input type="number" value={newSched.estimatedCost} onChange={e => setNewSched(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="2000" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Підрядник</label>
                        <Input value={newSched.vendorName} onChange={e => setNewSched(f => ({ ...f, vendorName: e.target.value }))} placeholder="ТОВ Сервіс" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Перша дата ТО</label>
                        <Input type="datetime-local" value={newSched.nextDueAt} onChange={e => setNewSched(f => ({ ...f, nextDueAt: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Нагадування (днів до)</label>
                        <Input type="number" value={newSched.advanceNoticeDays} onChange={e => setNewSched(f => ({ ...f, advanceNoticeDays: e.target.value }))} min={0} max={30} />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button className="flex-1" onClick={() => createSchedM.mutate({
                        ...newSched,
                        estimatedDurationMin: newSched.estimatedDurationMin ? parseInt(newSched.estimatedDurationMin) : undefined,
                        estimatedCost: newSched.estimatedCost ? parseFloat(newSched.estimatedCost) : undefined,
                        advanceNoticeDays: parseInt(newSched.advanceNoticeDays),
                      })} disabled={!newSched.title}>Створити розклад</Button>
                      <Button variant="outline" onClick={() => setShowNewSchedule(false)}>Скасувати</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              {schedules.map((s: any) => (
                <div key={s.id} className={`rounded-xl border p-4 bg-white ${s.is_overdue ? "border-red-300 bg-red-50" : s.due_soon ? "border-orange-300 bg-orange-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {s.title}
                        {s.is_overdue && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Прострочено!</span>}
                        {!s.is_overdue && s.due_soon && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Скоро ТО</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{CATEGORY_LABELS[s.category]} · {FREQ_LABELS[s.frequency]}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => performSchedM.mutate(s.id)} className="text-xs shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Виконано
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    {s.property_name && <span className="flex items-center gap-1"><Building2 className="w-3 h-3 text-gray-400" />{s.property_name}</span>}
                    {s.vendor_name && <span className="flex items-center gap-1"><User className="w-3 h-3 text-gray-400" />{s.vendor_name}</span>}
                    {s.estimated_cost && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3 text-gray-400" />{fmt(s.estimated_cost)} ₴</span>}
                    {s.estimated_duration_min && <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-gray-400" />{s.estimated_duration_min} хв</span>}
                  </div>
                  <div className="mt-2 pt-2 border-t flex justify-between text-xs text-gray-500">
                    <span>Останнє: {fmtDate(s.last_performed_at)}</span>
                    <span className={`font-medium ${s.is_overdue ? "text-red-600" : s.due_soon ? "text-orange-600" : "text-gray-600"}`}>
                      Наступне: {fmtDate(s.next_due_at)}
                    </span>
                  </div>
                </div>
              ))}
              {schedules.length === 0 && !schedulesQ.isLoading && (
                <div className="col-span-2 text-center py-8 text-gray-400">Розкладів ТО немає. Натисніть "Новий розклад" для початку.</div>
              )}
            </div>
          </div>
        )}

        {/* ─── ANALYTICS TAB ─────────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Monthly costs */}
              <div className="rounded-xl border p-4 bg-white">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> Витрати по місяцях</h3>
                {analyticsQ.isLoading && <div className="text-center py-4 text-gray-400">Завантаження...</div>}
                <div className="space-y-2">
                  {(analytics?.monthly ?? []).map((m: any) => {
                    const maxCost = Math.max(...(analytics?.monthly ?? []).map((x: any) => Number(x.cost) || 0), 1);
                    return (
                      <div key={m.month}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600">{m.month}</span>
                          <span className="font-medium">{fmt(m.cost)} ₴ · {m.total} зав. · {m.resolved} вир.</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (Number(m.cost) / maxCost) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By category */}
              <div className="rounded-xl border p-4 bg-white">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-500" /> Витрати за категоріями</h3>
                <div className="space-y-2">
                  {(analytics?.byCategory ?? []).slice(0, 8).map((c: any) => {
                    const maxCat = Math.max(...(analytics?.byCategory ?? []).map((x: any) => Number(x.total_cost) || 0), 1);
                    return (
                      <div key={c.category}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600">{CATEGORY_LABELS[c.category] ?? c.category}</span>
                          <span className="font-medium">{fmt(c.total_cost)} ₴ ({c.count} зав.)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, (Number(c.total_cost) / maxCat) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* By priority */}
            <div className="rounded-xl border p-4 bg-white">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-orange-500" /> За пріоритетом — час реакції</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(analytics?.byPriority ?? []).map((p: any) => {
                  const cfg = PRIORITY_CONFIG[p.priority] ?? PRIORITY_CONFIG.medium;
                  return (
                    <div key={p.priority} className={`rounded-lg border p-3 ${cfg.bg}`}>
                      <div className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</div>
                      <div className="text-xl font-bold mt-1">{p.count}</div>
                      <div className="text-xs text-gray-500">заявок</div>
                      <div className="text-xs text-gray-500 mt-1">Сер. час: {p.avg_hours ?? "—"} год</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial summary */}
            {stats && (
              <div className="rounded-xl border p-4 bg-white">
                <h3 className="font-semibold text-sm mb-3">Фінансовий підсумок</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Виконані роботи (факт)</div>
                    <div className="text-2xl font-bold text-green-600">{fmt(stats.total_cost_resolved)} ₴</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Відкриті (кошторис)</div>
                    <div className="text-2xl font-bold text-orange-600">{fmt(stats.total_cost_pending)} ₴</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Середній час вирішення</div>
                    <div className="text-2xl font-bold text-blue-600">{stats.avg_resolution_min ?? "—"} хв</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── DETAIL TAB ─────────────────────────────────────────────────────── */}
        {tab === "detail" && detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setTab("requests")}>← Назад</Button>
              <h2 className="font-bold text-lg">#{detail.id} — {detail.title}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[detail.status]?.badge ?? ""}`}>{STATUS_CONFIG[detail.status]?.label}</span>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Main info */}
              <div className="md:col-span-2 space-y-4">
                <div className="rounded-xl border p-4 bg-white">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {([
                      ["Пріоритет", PRIORITY_CONFIG[detail.priority]?.label ?? detail.priority],
                      ["Категорія", CATEGORY_LABELS[detail.category] ?? detail.category],
                      ["Об'єкт", detail.property_name ?? "—"],
                      ["Номер/кімната", detail.unit_name ?? "—"],
                      ["Звернувся", detail.reported_by_name ?? "—"],
                      ["Виконавець", detail.assigned_to_name ?? "—"],
                      ["Підрядник", detail.vendor_name ?? "—"],
                      ["Рахунок підрядника", detail.vendor_invoice ?? "—"],
                      ["Дедлайн", fmtDate(detail.due_date)],
                      ["Розпочато", fmtDate(detail.started_at)],
                      ["Вирішено", fmtDate(detail.resolved_at)],
                      ["Час виконання", detail.actual_duration_min ? `${detail.actual_duration_min} хв (план: ${detail.estimated_duration_min ?? "—"})` : `план: ${detail.estimated_duration_min ?? "—"} хв`],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label}><div className="text-xs text-gray-500">{label}</div><div className="font-medium">{val}</div></div>
                    ))}
                  </div>
                  {detail.description && <div className="mt-3 pt-3 border-t text-sm text-gray-600">{detail.description}</div>}
                  {detail.notes && <div className="mt-2 text-sm text-gray-500 italic">{detail.notes}</div>}
                  {detail.resolution_notes && <div className="mt-2 p-2 bg-green-50 rounded-lg text-sm text-green-700"><span className="font-medium">Результат:</span> {detail.resolution_notes}</div>}
                </div>

                {/* Change status */}
                <div className="rounded-xl border p-4 bg-white">
                  <h3 className="font-semibold text-sm mb-3">Змінити статус / оновити</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(["open", "in_progress", "pending_parts", "resolved", "cancelled", "escalated"] as const).map(s => (
                      <button key={s} onClick={() => updateReqM.mutate({ id: detail.id, data: { status: s } })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${detail.status === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                        {STATUS_CONFIG[s]?.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Фактичний час (хв)</label>
                      <Input type="number" placeholder="90" onBlur={e => { if (e.target.value) updateReqM.mutate({ id: detail.id, data: { actualDurationMin: parseInt(e.target.value) } }); }} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Фактична вартість ₴</label>
                      <Input type="number" placeholder="1800" onBlur={e => { if (e.target.value) updateReqM.mutate({ id: detail.id, data: { actualCost: parseFloat(e.target.value) } }); }} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Нотатки про результат</label>
                      <Textarea rows={2} placeholder="Опишіть що було зроблено..." onBlur={e => { if (e.target.value) updateReqM.mutate({ id: detail.id, data: { resolutionNotes: e.target.value } }); }} />
                    </div>
                  </div>
                </div>

                {/* Activity log */}
                <div className="rounded-xl border p-4 bg-white">
                  <h3 className="font-semibold text-sm mb-3">Журнал подій</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {logs.map((l: any) => (
                      <div key={l.id} className="flex gap-2 text-xs text-gray-600">
                        <span className="text-gray-400 shrink-0">{fmtDate(l.created_at)}</span>
                        <span className="font-medium text-gray-500">{l.user_name ?? "Система"}</span>
                        {l.action === "status_changed" && <span>→ <b>{STATUS_CONFIG[l.new_status]?.label}</b></span>}
                        {l.action === "comment" && <span className="text-blue-600">{l.note}</span>}
                        {l.action === "created" && <span className="text-green-600">Заявку створено</span>}
                        {!["status_changed", "comment", "created"].includes(l.action) && <span>{l.note ?? l.action}</span>}
                      </div>
                    ))}
                    {logs.length === 0 && <div className="text-gray-400 text-xs">Журнал порожній</div>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input className="flex-1" placeholder="Додати коментар..." value={newLog} onChange={e => setNewLog(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newLog.trim()) addLogM.mutate({ id: detail.id, note: newLog }); }} />
                    <Button size="sm" onClick={() => addLogM.mutate({ id: detail.id, note: newLog })} disabled={!newLog.trim()}>
                      Надіслати
                    </Button>
                  </div>
                </div>
              </div>

              {/* Side: Financial summary + actions */}
              <div className="space-y-3">
                <div className="rounded-xl border p-4 bg-white">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-1"><DollarSign className="w-4 h-4 text-green-600" /> Фінанси</h3>
                  <div className="space-y-2 text-sm">
                    {([
                      ["Кошторис", detail.estimated_cost, "text-gray-600"],
                      ["Запчастини", detail.parts_cost, "text-orange-600"],
                      ["Праця", detail.labor_cost, "text-blue-600"],
                      ["Фактично", detail.actual_cost, "text-green-700 font-bold"],
                    ] as [string, any, string][]).map(([label, val, cls]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-gray-500">{label}</span>
                        <span className={cls}>{val ? fmt(val) + " ₴" : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {detail.guest_rating && (
                  <div className="rounded-xl border p-4 bg-white">
                    <h3 className="font-semibold text-sm mb-2">Оцінка гостя</h3>
                    <div className="text-2xl font-bold text-yellow-500">{"★".repeat(detail.guest_rating)}{"☆".repeat(5 - detail.guest_rating)}</div>
                    {detail.guest_feedback && <p className="text-xs text-gray-500 mt-1">{detail.guest_feedback}</p>}
                  </div>
                )}

                <Button variant="destructive" size="sm" className="w-full" onClick={() => {
                  if (window.confirm("Видалити заявку?")) deleteReqM.mutate(detail.id);
                }}>
                  <XCircle className="w-4 h-4 mr-1" /> Видалити заявку
                </Button>
              </div>
            </div>
          </div>
        )}

        {tab === "detail" && !detail && selectedId && (
          <div className="text-center py-8 text-gray-400">Завантаження деталей...</div>
        )}

      </div>
    </AppLayout>
  );
}
