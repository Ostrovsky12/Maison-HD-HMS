import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Sparkles, Wrench, Search, Package, ClipboardList, LayoutGrid,
  Plus, X, ChevronRight, ChevronDown, AlertTriangle, Clock, CheckCircle2,
  Circle, Loader2, Filter, RefreshCw, User, Calendar, MessageSquare,
  Camera, Star, MapPin, Phone, Tag, Zap, ShieldCheck, ArrowRight,
  Building2, Layers, MoreVertical, Edit2, CheckSquare, AlertCircle,
  PauseCircle, XCircle, Home, TrendingUp
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "dashboard" | "rooms" | "cleaning" | "maintenance" | "lost" | "inspections" | "preventive";

// ─── Status/Priority config ───────────────────────────────────────────────────
const HK_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "Очікує",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  in_progress:{ label: "В роботі",   color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  completed:  { label: "Завершено",  color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  verified:   { label: "Перевірено", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  cancelled:  { label: "Скасовано",  color: "text-gray-500",   bg: "bg-gray-50 border-gray-200" },
};
const TASK_TYPE: Record<string, { label: string; icon: string }> = {
  cleaning:     { label: "Прибирання",    icon: "✨" },
  deep_cleaning:{ label: "Генеральне",    icon: "🧹" },
  linen_change: { label: "Заміна білизни",icon: "🛏" },
  maintenance:  { label: "Обслуговування",icon: "🔧" },
  check:        { label: "Перевірка",     icon: "✅" },
  other:        { label: "Інше",          icon: "📌" },
};
const MNT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open:          { label: "Відкрито",      color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  in_progress:   { label: "В роботі",      color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  pending_parts: { label: "Деталі",        color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  resolved:      { label: "Вирішено",      color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  cancelled:     { label: "Скасовано",     color: "text-gray-500",   bg: "bg-gray-50 border-gray-200" },
  escalated:     { label: "Ескалація",     color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
};
const MNT_PRIORITY: Record<string, { label: string; color: string }> = {
  low:      { label: "Низький",    color: "text-gray-500" },
  medium:   { label: "Середній",  color: "text-amber-600" },
  high:     { label: "Високий",   color: "text-orange-600" },
  critical: { label: "Критичний", color: "text-red-600" },
};
const MNT_CATEGORY: Record<string, string> = {
  plumbing:"Сантехніка", electrical:"Електрика", hvac:"HVAC", carpentry:"Теслярство",
  cleaning:"Прибирання", painting:"Фарбування", elevator:"Ліфт", pool:"Басейн",
  garden:"Сад", security:"Безпека", it:"IT", furniture:"Меблі",
  appliances:"Техніка", structural:"Конструктив", other:"Інше"
};
const ROOM_HK: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  clean:      { label: "Чиста",    color: "text-green-700",  bg: "bg-green-100", dot: "bg-green-500" },
  dirty:      { label: "Брудна",   color: "text-red-700",    bg: "bg-red-100",   dot: "bg-red-500" },
  in_progress:{ label: "В роботі", color: "text-blue-700",   bg: "bg-blue-100",  dot: "bg-blue-500" },
};
const LOST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  found:    { label: "Знайдено",  color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  claimed:  { label: "Повернено", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  donated:  { label: "Пожертвовано", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  disposed: { label: "Утилізовано", color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
};
const LOST_CATEGORY: Record<string, string> = {
  clothing:"Одяг", electronics:"Електроніка", jewelry:"Ювелірні",
  documents:"Документи", bags:"Сумки", accessories:"Аксесуари", other:"Інше"
};
const INSP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "Очікує",    color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  in_progress:{ label: "Виконується",color: "text-blue-700",  bg: "bg-blue-50 border-blue-200" },
  completed:  { label: "Завершено", color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  failed:     { label: "Провалено", color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  approved:   { label: "Схвалено",  color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
};
const INSP_TYPE: Record<string, string> = {
  pre_checkin:"До заїзду", post_checkout:"Після виїзду",
  routine:"Планова", deep:"Генеральна", maintenance:"Технічна"
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color} ${bg}`}>
      {text}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10 rounded-t-2xl">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
const selectCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400";

// ─── Priority dot ─────────────────────────────────────────────────────────────
function PriorityDot({ p }: { p: string }) {
  const colors: Record<string, string> = {
    low: "bg-gray-400", medium: "bg-amber-400", high: "bg-orange-500", critical: "bg-red-600"
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[p] ?? "bg-gray-400"}`} />;
}

// ─── Relative time ────────────────────────────────────────────────────────────
function relTime(dt: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  const diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 60) return `${Math.round(diff)}хв тому`;
  if (diff < 1440) return `${Math.round(diff / 60)}г тому`;
  return `${Math.round(diff / 1440)}д тому`;
}

// ─── Comment Thread ───────────────────────────────────────────────────────────
function CommentThread({
  comments, onAdd
}: {
  comments: any[];
  onAdd: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    await onAdd(text.trim());
    setText("");
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      {comments.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                {(c.user_name ?? "?")[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-gray-800">{c.user_name}</span>
                  <span className="text-xs text-gray-400">{relTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-2">Ще немає коментарів</p>
      )}
      <div className="flex gap-2">
        <input
          className={inputCls + " flex-1"}
          placeholder="Додати коментар..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
        />
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : "→"}
        </button>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 p-4 text-left hover:border-indigo-200 transition-all shadow-sm hover:shadow-md w-full"
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function OperationsPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [lostItems, setLostItems] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProp, setFilterProp] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [roomFilter, setRoomFilter] = useState<"all" | "clean" | "dirty" | "in_progress">("all");

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    const r = await apiFetch("/api/operations/dashboard");
    if (r.ok) setDashboard(await r.json());
  }, []);

  const loadRooms = useCallback(async () => {
    setLoading(p => ({ ...p, rooms: true }));
    const q = filterProp ? `?property_id=${filterProp}` : "";
    const r = await apiFetch(`/api/operations/room-board${q}`);
    if (r.ok) setRooms(await r.json());
    setLoading(p => ({ ...p, rooms: false }));
  }, [filterProp]);

  const loadTasks = useCallback(async () => {
    setLoading(p => ({ ...p, tasks: true }));
    let q = "?";
    if (filterStatus) q += `status=${filterStatus}&`;
    if (filterProp) q += `property_id=${filterProp}&`;
    const r = await apiFetch(`/api/operations/tasks${q}`);
    if (r.ok) setTasks(await r.json());
    setLoading(p => ({ ...p, tasks: false }));
  }, [filterStatus, filterProp]);

  const loadMaintenance = useCallback(async () => {
    setLoading(p => ({ ...p, mnt: true }));
    let q = "?";
    if (filterStatus) q += `status=${filterStatus}&`;
    if (filterProp) q += `property_id=${filterProp}&`;
    const r = await apiFetch(`/api/operations/maintenance${q}`);
    if (r.ok) setMaintenance(await r.json());
    setLoading(p => ({ ...p, mnt: false }));
  }, [filterStatus, filterProp]);

  const loadLost = useCallback(async () => {
    setLoading(p => ({ ...p, lost: true }));
    const r = await apiFetch("/api/operations/lost-found");
    if (r.ok) setLostItems(await r.json());
    setLoading(p => ({ ...p, lost: false }));
  }, []);

  const loadInspections = useCallback(async () => {
    setLoading(p => ({ ...p, insp: true }));
    const r = await apiFetch("/api/operations/inspections");
    if (r.ok) setInspections(await r.json());
    setLoading(p => ({ ...p, insp: false }));
  }, []);

  const loadSchedules = useCallback(async () => {
    const r = await apiFetch("/api/operations/maintenance/schedules");
    if (r.ok) setSchedules(await r.json());
  }, []);

  const loadSupport = useCallback(async () => {
    const [sRes, pRes, uRes] = await Promise.all([
      apiFetch("/api/operations/staff"),
      apiFetch("/api/operations/properties"),
      apiFetch("/api/operations/units"),
    ]);
    if (sRes.ok) setStaff(await sRes.json());
    if (pRes.ok) setProperties(await pRes.json());
    if (uRes.ok) setUnits(await uRes.json());
  }, []);

  useEffect(() => { loadDashboard(); loadSupport(); }, []);

  useEffect(() => {
    if (tab === "rooms") loadRooms();
    else if (tab === "cleaning") loadTasks();
    else if (tab === "maintenance") loadMaintenance();
    else if (tab === "lost") loadLost();
    else if (tab === "inspections") loadInspections();
    else if (tab === "preventive") loadSchedules();
  }, [tab, filterStatus, filterProp]);

  // ── Room status update ─────────────────────────────────────────────────────
  const updateRoomStatus = async (unitId: number, status: string) => {
    await apiFetch(`/api/operations/room-board/${unitId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setRooms(prev => prev.map(r => r.id === unitId ? { ...r, housekeeping_status: status } : r));
  };

  // ── Task status update ─────────────────────────────────────────────────────
  const updateTask = async (id: number, updates: any) => {
    await apiFetch(`/api/operations/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    loadTasks();
  };

  // ── Maintenance status update ──────────────────────────────────────────────
  const updateMnt = async (id: number, updates: any) => {
    await apiFetch(`/api/operations/maintenance/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    loadMaintenance();
  };

  // ── Lost & Found status update ─────────────────────────────────────────────
  const updateLost = async (id: number, updates: any) => {
    await apiFetch(`/api/operations/lost-found/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    loadLost();
  };

  // ── Inspection update ──────────────────────────────────────────────────────
  const updateInspection = async (id: number, updates: any) => {
    await apiFetch(`/api/operations/inspections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    loadInspections();
  };

  const tabs = [
    { id: "dashboard",    label: "Огляд",        icon: LayoutGrid },
    { id: "rooms",        label: "Кімнати",       icon: Home },
    { id: "cleaning",     label: "Прибирання",    icon: Sparkles },
    { id: "maintenance",  label: "Техн.",          icon: Wrench },
    { id: "lost",         label: "Знахідки",      icon: Package },
    { id: "inspections",  label: "Перевірки",     icon: ClipboardList },
    { id: "preventive",   label: "Профілак.",     icon: ShieldCheck },
  ] as const;

  const filtered = (arr: any[]) => {
    if (!search) return arr;
    const q = search.toLowerCase();
    return arr.filter(i =>
      Object.values(i).some(v => String(v ?? "").toLowerCase().includes(q))
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // DASHBOARD TAB
  // ════════════════════════════════════════════════════════════════════════════
  const renderDashboard = () => {
    if (!dashboard) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>;
    const hk = dashboard.housekeeping ?? {};
    const mnt = dashboard.maintenance ?? {};
    const lost = dashboard.lostFound ?? {};
    const insp = dashboard.inspections ?? {};
    const rooms = dashboard.rooms ?? {};
    return (
      <div className="space-y-6">
        {/* Rooms Summary */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Статус кімнат</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Чисті", value: rooms.clean ?? 0, color: "bg-green-100 text-green-700", tab: "rooms" as Tab },
              { label: "Брудні", value: rooms.dirty ?? 0, color: "bg-red-100 text-red-700", tab: "rooms" as Tab },
              { label: "В роботі", value: rooms.in_progress ?? 0, color: "bg-blue-100 text-blue-700", tab: "rooms" as Tab },
            ].map(r => (
              <button key={r.label} onClick={() => setTab(r.tab)}
                className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm hover:shadow-md transition-all">
                <p className={`text-3xl font-bold ${r.color.split(" ")[1]}`}>{r.value}</p>
                <p className="text-xs text-gray-500 mt-1">{r.label}</p>
              </button>
            ))}
          </div>
        </section>

        {/* HK Tasks */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Прибирання</h3>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Очікує" value={hk.pending ?? 0} icon={Circle}
              color="bg-amber-100 text-amber-700" onClick={() => { setTab("cleaning"); setFilterStatus("pending"); }} />
            <KpiCard label="В роботі" value={hk.in_progress ?? 0} icon={Loader2}
              color="bg-blue-100 text-blue-700" onClick={() => { setTab("cleaning"); setFilterStatus("in_progress"); }} />
            <KpiCard label="На сьогодні" value={hk.due_today ?? 0} icon={Calendar}
              color="bg-indigo-100 text-indigo-700" onClick={() => setTab("cleaning")} />
            <KpiCard label="Прострочено" value={hk.overdue ?? 0} icon={AlertTriangle}
              color="bg-red-100 text-red-700" onClick={() => setTab("cleaning")} />
          </div>
        </section>

        {/* Maintenance */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Технічна служба</h3>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Відкрито" value={mnt.open ?? 0} icon={AlertCircle}
              color="bg-red-100 text-red-700" onClick={() => { setTab("maintenance"); setFilterStatus("open"); }} />
            <KpiCard label="Критичних" value={mnt.critical ?? 0} icon={Zap}
              color="bg-red-100 text-red-800" onClick={() => { setTab("maintenance"); setFilterStatus(""); }} />
            <KpiCard label="В роботі" value={mnt.in_progress ?? 0} icon={Wrench}
              color="bg-blue-100 text-blue-700" onClick={() => { setTab("maintenance"); setFilterStatus("in_progress"); }} />
            <KpiCard label="Прострочено SLA" value={mnt.overdue ?? 0} icon={Clock}
              color="bg-orange-100 text-orange-700" onClick={() => setTab("maintenance")} />
          </div>
        </section>

        {/* Lost & Inspections */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Знахідки та Перевірки</h3>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Нових знахідок" value={lost.unclaimed ?? 0} icon={Package}
              color="bg-amber-100 text-amber-700" onClick={() => setTab("lost")} />
            <KpiCard label="Перевірок pending" value={insp.pending ?? 0} icon={ClipboardList}
              color="bg-purple-100 text-purple-700" onClick={() => setTab("inspections")} />
          </div>
        </section>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ROOM BOARD TAB
  // ════════════════════════════════════════════════════════════════════════════
  const renderRooms = () => {
    const grouped: Record<string, any[]> = {};
    const filtered2 = rooms.filter(r =>
      roomFilter === "all" || r.housekeeping_status === roomFilter
    );
    for (const r of filtered2) {
      const key = r.property_name ?? "Інше";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }
    return (
      <div className="space-y-4">
        {/* Filter buttons */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "all", label: "Всі", color: "bg-gray-100 text-gray-700" },
            { id: "clean", label: "Чисті", color: "bg-green-100 text-green-700" },
            { id: "dirty", label: "Брудні", color: "bg-red-100 text-red-700" },
            { id: "in_progress", label: "В роботі", color: "bg-blue-100 text-blue-700" },
          ].map(f => (
            <button key={f.id} onClick={() => setRoomFilter(f.id as any)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                roomFilter === f.id ? f.color + " border-current" : "bg-white text-gray-500 border-gray-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading.rooms && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" size={22} /></div>}

        {Object.entries(grouped).map(([prop, units]) => (
          <div key={prop}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
              <Building2 size={12} />{prop}
              <span className="text-gray-300">({units.length})</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {units.map(room => {
                const hk = ROOM_HK[room.housekeeping_status] ?? ROOM_HK.clean;
                const hasTask = room.activeTasks?.length > 0;
                const booking = room.booking;
                return (
                  <div key={room.id}
                    className={`rounded-xl border p-3 cursor-pointer hover:shadow-md transition-all ${hk.bg} border-current/20`}
                    onClick={() => { setSelected(room); setModal("room"); }}>
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-sm font-semibold text-gray-900 truncate">{room.name}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${hk.dot} shrink-0 mt-0.5`} />
                    </div>
                    <p className={`text-xs font-medium ${hk.color}`}>{hk.label}</p>
                    {booking && (
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {booking.booking_status === "checked_in" ? "🏠 " : "📅 "}{booking.guest_name}
                      </p>
                    )}
                    {hasTask && (
                      <p className="text-xs text-indigo-600 mt-1">
                        {room.activeTasks.length} {room.activeTasks[0].task_type === "cleaning" ? "✨" : "🔧"} задач
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filtered2.length === 0 && !loading.rooms && (
          <div className="text-center py-12 text-gray-400">
            <Home size={40} className="mx-auto mb-2 opacity-30" />
            <p>Кімнат не знайдено</p>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // CLEANING TAB
  // ════════════════════════════════════════════════════════════════════════════
  const renderCleaning = () => {
    const filteredTasks = filtered(tasks);
    const statusGroups = ["pending", "in_progress", "completed", "verified"];

    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { v: "", l: "Всі" },
            { v: "pending", l: "Очікує" },
            { v: "in_progress", l: "В роботі" },
            { v: "completed", l: "Завершено" },
            { v: "verified", l: "Перевірено" },
          ].map(f => (
            <button key={f.v} onClick={() => setFilterStatus(f.v)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filterStatus === f.v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200"
              }`}>
              {f.l}
            </button>
          ))}
        </div>

        {loading.tasks && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" size={22} /></div>}

        <div className="space-y-2">
          {filteredTasks.map(task => {
            const st = HK_STATUS[task.status] ?? HK_STATUS.pending;
            const tp = TASK_TYPE[task.task_type] ?? TASK_TYPE.other;
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !["completed","verified","cancelled"].includes(task.status);
            return (
              <div key={task.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 cursor-pointer hover:border-indigo-200 transition-all shadow-sm"
                onClick={() => { setSelected(task); setModal("task"); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{tp.icon}</span>
                      <span className="text-sm font-semibold text-gray-900 truncate">{task.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <MapPin size={11} />{task.unit_name} · {task.property_name}
                    </div>
                    {task.assigned_to_name && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <User size={11} />{task.assigned_to_name}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge text={st.label} color={st.color} bg={st.bg} />
                    {isOverdue && <Badge text="Прострочено" color="text-red-700" bg="bg-red-50 border-red-200" />}
                  </div>
                </div>
                {task.due_date && (
                  <div className={`flex items-center gap-1 text-xs mt-2 ${isOverdue ? "text-red-600" : "text-gray-400"}`}>
                    <Calendar size={11} />{new Date(task.due_date).toLocaleDateString("uk-UA")}
                    {task.estimated_minutes && <span className="ml-2"><Clock size={11} className="inline" /> {task.estimated_minutes}хв</span>}
                  </div>
                )}
                {task.comments?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-indigo-500 mt-1.5">
                    <MessageSquare size={11} />{task.comments.length} коментар(ів)
                  </div>
                )}
              </div>
            );
          })}
          {filteredTasks.length === 0 && !loading.tasks && (
            <div className="text-center py-12 text-gray-400">
              <Sparkles size={40} className="mx-auto mb-2 opacity-30" />
              <p>Задач не знайдено</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // MAINTENANCE TAB
  // ════════════════════════════════════════════════════════════════════════════
  const renderMaintenance = () => {
    const filteredMnt = filtered(maintenance);
    return (
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { v: "", l: "Всі" },
            { v: "open", l: "Відкрито" },
            { v: "in_progress", l: "В роботі" },
            { v: "pending_parts", l: "Деталі" },
            { v: "escalated", l: "Ескалація" },
            { v: "resolved", l: "Вирішено" },
          ].map(f => (
            <button key={f.v} onClick={() => setFilterStatus(f.v)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filterStatus === f.v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200"
              }`}>
              {f.l}
            </button>
          ))}
        </div>

        {loading.mnt && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" size={22} /></div>}

        <div className="space-y-2">
          {filteredMnt.map(ticket => {
            const st = MNT_STATUS[ticket.status] ?? MNT_STATUS.open;
            const pr = MNT_PRIORITY[ticket.priority] ?? MNT_PRIORITY.medium;
            return (
              <div key={ticket.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 cursor-pointer hover:border-indigo-200 transition-all shadow-sm"
                onClick={() => { setSelected(ticket); setModal("mnt"); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <PriorityDot p={ticket.priority} />
                      <span className="text-sm font-semibold text-gray-900 truncate">{ticket.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                      {ticket.unit_name && <><MapPin size={11} />{ticket.unit_name} · {ticket.property_name}</>}
                      {ticket.category && <><Tag size={11} />{MNT_CATEGORY[ticket.category] ?? ticket.category}</>}
                    </div>
                    {ticket.assigned_to_name && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <User size={11} />{ticket.assigned_to_name}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge text={st.label} color={st.color} bg={st.bg} />
                    {ticket.sla_breached && <Badge text="SLA !" color="text-red-700" bg="bg-red-50 border-red-200" />}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span className={pr.color + " font-medium"}>{pr.label}</span>
                  <span>{ticket.age_days ?? 0}д тому</span>
                  {ticket.comments?.length > 0 && (
                    <span className="text-indigo-500"><MessageSquare size={11} className="inline" /> {ticket.comments.length}</span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredMnt.length === 0 && !loading.mnt && (
            <div className="text-center py-12 text-gray-400">
              <Wrench size={40} className="mx-auto mb-2 opacity-30" />
              <p>Заявок не знайдено</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // LOST & FOUND TAB
  // ════════════════════════════════════════════════════════════════════════════
  const renderLost = () => {
    const filteredLost = filtered(lostItems);
    return (
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { v: "", l: "Всі" },
            { v: "found", l: "Знайдено" },
            { v: "claimed", l: "Повернено" },
            { v: "donated", l: "Пожертвовано" },
          ].map(f => (
            <button key={f.v} onClick={() => setFilterStatus(f.v)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filterStatus === f.v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200"
              }`}>
              {f.l}
            </button>
          ))}
        </div>
        {loading.lost && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" size={22} /></div>}
        <div className="space-y-2">
          {filteredLost.filter(i => !filterStatus || i.status === filterStatus).map(item => {
            const st = LOST_STATUS[item.status] ?? LOST_STATUS.found;
            return (
              <div key={item.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 cursor-pointer hover:border-indigo-200 transition-all shadow-sm"
                onClick={() => { setSelected(item); setModal("lost"); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.description}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 flex-wrap">
                      <Tag size={11} />{LOST_CATEGORY[item.category] ?? item.category}
                      {item.unit_name && <><MapPin size={11} />{item.unit_name}</>}
                      <Calendar size={11} />{new Date(item.found_date).toLocaleDateString("uk-UA")}
                    </div>
                    {item.guest_name && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <User size={11} />Власник: {item.guest_name}
                      </div>
                    )}
                    {item.storage_location && (
                      <div className="flex items-center gap-1 text-xs text-indigo-600 mt-0.5">
                        <MapPin size={11} />Зберігається: {item.storage_location}
                      </div>
                    )}
                  </div>
                  <Badge text={st.label} color={st.color} bg={st.bg} />
                </div>
              </div>
            );
          })}
          {filteredLost.length === 0 && !loading.lost && (
            <div className="text-center py-12 text-gray-400">
              <Package size={40} className="mx-auto mb-2 opacity-30" />
              <p>Знахідок немає</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // INSPECTIONS TAB
  // ════════════════════════════════════════════════════════════════════════════
  const renderInspections = () => {
    const filteredInsp = filtered(inspections);
    return (
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { v: "", l: "Всі" },
            { v: "pending", l: "Очікує" },
            { v: "in_progress", l: "В роботі" },
            { v: "completed", l: "Завершено" },
            { v: "failed", l: "Провалено" },
            { v: "approved", l: "Схвалено" },
          ].map(f => (
            <button key={f.v} onClick={() => setFilterStatus(f.v)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filterStatus === f.v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200"
              }`}>
              {f.l}
            </button>
          ))}
        </div>
        {loading.insp && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" size={22} /></div>}
        <div className="space-y-2">
          {filteredInsp.filter(i => !filterStatus || i.status === filterStatus).map(insp => {
            const st = INSP_STATUS[insp.status] ?? INSP_STATUS.pending;
            const checklist = Array.isArray(insp.checklist) ? insp.checklist : [];
            const done = checklist.filter((c: any) => c.ok === true).length;
            return (
              <div key={insp.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 cursor-pointer hover:border-indigo-200 transition-all shadow-sm"
                onClick={() => { setSelected(insp); setModal("inspection"); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {INSP_TYPE[insp.inspection_type] ?? insp.inspection_type} — {insp.unit_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <Building2 size={11} />{insp.property_name}
                      {insp.inspector_name && <><User size={11} />{insp.inspector_name}</>}
                    </div>
                    {checklist.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Чек-лист</span>
                          <span>{done}/{checklist.length}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${checklist.length > 0 ? (done / checklist.length) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge text={st.label} color={st.color} bg={st.bg} />
                    {insp.score != null && (
                      <div className="flex items-center gap-1 text-xs">
                        <Star size={11} className="text-amber-500" />
                        <span className="font-medium">{insp.score}/100</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">{relTime(insp.created_at)}</p>
              </div>
            );
          })}
          {filteredInsp.length === 0 && !loading.insp && (
            <div className="text-center py-12 text-gray-400">
              <ClipboardList size={40} className="mx-auto mb-2 opacity-30" />
              <p>Перевірок немає</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // PREVENTIVE TAB
  // ════════════════════════════════════════════════════════════════════════════
  const renderPreventive = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {schedules.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    {s.unit_name && <><MapPin size={11} />{s.unit_name}</>}
                    {s.property_name && <><Building2 size={11} />{s.property_name}</>}
                  </div>
                  {s.assigned_to_name && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                      <User size={11} />{s.assigned_to_name}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {s.next_due_at && (
                    <p className="text-xs font-medium text-indigo-600">
                      {new Date(s.next_due_at).toLocaleDateString("uk-UA")}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{s.frequency ?? "—"}</p>
                </div>
              </div>
              {s.description && (
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{s.description}</p>
              )}
            </div>
          ))}
          {schedules.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ShieldCheck size={40} className="mx-auto mb-2 opacity-30" />
              <p>Розкладу немає</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // MODALS
  // ════════════════════════════════════════════════════════════════════════════

  // ── Room Modal ─────────────────────────────────────────────────────────────
  const RoomModal = () => {
    if (!selected) return null;
    return (
      <Modal title={selected.name} onClose={() => setModal(null)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Статус HK</p>
              <p className={`text-sm font-semibold mt-0.5 ${ROOM_HK[selected.housekeeping_status]?.color}`}>
                {ROOM_HK[selected.housekeeping_status]?.label}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Категорія</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{selected.category ?? "—"}</p>
            </div>
          </div>

          {selected.booking && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-1">
                {selected.booking.booking_status === "checked_in" ? "🏠 Зараз проживає" : "📅 Майбутній гість"}
              </p>
              <p className="text-sm text-gray-800">{selected.booking.guest_name}</p>
              <p className="text-xs text-gray-500">
                {new Date(selected.booking.check_in).toLocaleDateString("uk-UA")} – {new Date(selected.booking.check_out).toLocaleDateString("uk-UA")}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Статус прибирання</p>
            <div className="grid grid-cols-3 gap-2">
              {["clean", "dirty", "in_progress"].map(s => {
                const cfg = ROOM_HK[s];
                return (
                  <button key={s} onClick={async () => {
                    await updateRoomStatus(selected.id, s);
                    setSelected({ ...selected, housekeeping_status: s });
                  }}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border-2 transition-all ${
                      selected.housekeeping_status === s
                        ? `${cfg.bg} border-current/40 ${cfg.color}`
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {selected.activeTasks?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Активні задачі ({selected.activeTasks.length})</p>
              <div className="space-y-1.5">
                {selected.activeTasks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{TASK_TYPE[t.task_type]?.icon} {t.title}</span>
                    <Badge text={HK_STATUS[t.status]?.label} color={HK_STATUS[t.status]?.color} bg={HK_STATUS[t.status]?.bg} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => { setModal(null); setTab("cleaning"); }}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium"
          >
            Переглянути всі задачі
          </button>
        </div>
      </Modal>
    );
  };

  // ── Task Modal ─────────────────────────────────────────────────────────────
  const TaskModal = () => {
    if (!selected) return null;
    const [checklist, setChecklist] = useState<any[]>(Array.isArray(selected.checklist) ? selected.checklist : []);
    const [saving, setSaving] = useState(false);

    const toggleChecklist = async (idx: number) => {
      const updated = checklist.map((c, i) => i === idx ? { ...c, done: !c.done } : c);
      setChecklist(updated);
      await apiFetch(`/api/operations/tasks/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ checklist: updated })
      });
    };

    const changeStatus = async (status: string) => {
      setSaving(true);
      await updateTask(selected.id, { status });
      setSelected({ ...selected, status });
      setSaving(false);
    };

    return (
      <Modal title={selected.title} onClose={() => { setModal(null); }}>
        <div className="space-y-4">
          {/* Info */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Кімната</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{selected.unit_name}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Тип</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{TASK_TYPE[selected.task_type]?.label}</p>
            </div>
          </div>
          {selected.assigned_to_name && (
            <div className="flex items-center gap-2 text-sm text-gray-700 bg-indigo-50 rounded-xl px-3 py-2">
              <User size={14} className="text-indigo-600" />
              <span>Призначено: <strong>{selected.assigned_to_name}</strong></span>
            </div>
          )}
          {selected.notes && (
            <div className="bg-amber-50 rounded-xl px-3 py-2 text-sm text-gray-700 border border-amber-100">
              {selected.notes}
            </div>
          )}

          {/* Assign */}
          <Field label="Змінити виконавця">
            <select className={selectCls} defaultValue={selected.assigned_to_id ?? ""}
              onChange={async e => {
                await updateTask(selected.id, { assigned_to_id: e.target.value || null });
              }}>
              <option value="">— Не призначено —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          {/* Checklist */}
          {checklist.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">
                Чек-лист ({checklist.filter(c => c.done).length}/{checklist.length})
              </p>
              <div className="space-y-1.5">
                {checklist.map((item: any, i: number) => (
                  <button key={i} onClick={() => toggleChecklist(i)}
                    className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-lg hover:bg-gray-50">
                    <CheckSquare size={16} className={item.done ? "text-green-500" : "text-gray-300"} />
                    <span className={`text-sm ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                      {item.title ?? item.text ?? item.item ?? JSON.stringify(item)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status buttons */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Змінити статус</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { s: "in_progress", l: "Почати роботу", color: "bg-blue-600" },
                { s: "completed", l: "Завершити", color: "bg-green-600" },
                { s: "verified", l: "Верифіковано", color: "bg-purple-600" },
                { s: "cancelled", l: "Скасувати", color: "bg-gray-500" },
              ].map(btn => (
                <button key={btn.s} onClick={() => changeStatus(btn.s)}
                  disabled={saving || selected.status === btn.s}
                  className={`py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 ${btn.color}`}>
                  {btn.l}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Коментарі</p>
            <CommentThread
              comments={selected.comments ?? []}
              onAdd={async text => {
                await apiFetch(`/api/operations/tasks/${selected.id}/comment`, {
                  method: "POST",
                  body: JSON.stringify({ text })
                });
                loadTasks();
              }}
            />
          </div>
        </div>
      </Modal>
    );
  };

  // ── Maintenance Modal ──────────────────────────────────────────────────────
  const MntModal = () => {
    if (!selected) return null;
    const [saving, setSaving] = useState(false);

    const changeStatus = async (status: string) => {
      setSaving(true);
      await updateMnt(selected.id, { status });
      setSelected({ ...selected, status });
      setSaving(false);
    };

    const nextStatuses: Record<string, { s: string; l: string; color: string }[]> = {
      open: [
        { s: "in_progress", l: "Взяти в роботу", color: "bg-blue-600" },
        { s: "escalated", l: "Ескалація", color: "bg-purple-600" },
        { s: "cancelled", l: "Скасувати", color: "bg-gray-500" },
      ],
      in_progress: [
        { s: "pending_parts", l: "Очікую деталі", color: "bg-orange-500" },
        { s: "resolved", l: "Вирішено", color: "bg-green-600" },
      ],
      pending_parts: [
        { s: "in_progress", l: "Деталі отримано", color: "bg-blue-600" },
        { s: "resolved", l: "Вирішено", color: "bg-green-600" },
      ],
      escalated: [
        { s: "in_progress", l: "Взяти в роботу", color: "bg-blue-600" },
        { s: "resolved", l: "Вирішено", color: "bg-green-600" },
      ],
    };
    const actions = nextStatuses[selected.status] ?? [];

    return (
      <Modal title={selected.title} onClose={() => setModal(null)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Статус</p>
              <Badge text={MNT_STATUS[selected.status]?.label ?? selected.status}
                color={MNT_STATUS[selected.status]?.color ?? "text-gray-700"}
                bg={MNT_STATUS[selected.status]?.bg ?? "bg-gray-50 border-gray-200"} />
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Пріоритет</p>
              <p className={`text-sm font-semibold mt-0.5 ${MNT_PRIORITY[selected.priority]?.color}`}>
                {MNT_PRIORITY[selected.priority]?.label}
              </p>
            </div>
            {selected.unit_name && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Кімната</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{selected.unit_name}</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Категорія</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{MNT_CATEGORY[selected.category] ?? selected.category}</p>
            </div>
          </div>

          {selected.description && (
            <div className="bg-amber-50 rounded-xl px-3 py-2 text-sm text-gray-700 border border-amber-100">
              {selected.description}
            </div>
          )}

          {selected.sla_breached && (
            <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2 text-sm text-red-700 border border-red-100">
              <AlertTriangle size={14} /> SLA порушено! Заявка відкрита {selected.age_days} дн.
            </div>
          )}

          {/* Assign */}
          <Field label="Виконавець">
            <select className={selectCls} defaultValue={selected.assigned_to_user_id ?? ""}
              onChange={async e => {
                await updateMnt(selected.id, { assigned_to_user_id: e.target.value || null });
              }}>
              <option value="">— Не призначено —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>

          {/* Costs */}
          {selected.estimated_cost && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="text-xs text-gray-500 mb-1">Фінанси</p>
              <div className="flex gap-4">
                <div><span className="text-gray-500">Оцінка: </span><strong>{selected.estimated_cost} ₴</strong></div>
                {selected.actual_cost && <div><span className="text-gray-500">Факт: </span><strong>{selected.actual_cost} ₴</strong></div>}
              </div>
            </div>
          )}

          {/* Status actions */}
          {actions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Дії</p>
              <div className="grid grid-cols-2 gap-2">
                {actions.map(btn => (
                  <button key={btn.s} onClick={() => changeStatus(btn.s)}
                    disabled={saving}
                    className={`py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 ${btn.color}`}>
                    {btn.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Activity log */}
          {selected.activity?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Журнал активності</p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {selected.activity.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <span className="text-gray-400 shrink-0">{relTime(a.created_at)}</span>
                    <span className="text-gray-600">{a.note ?? a.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Коментарі</p>
            <CommentThread
              comments={selected.comments ?? []}
              onAdd={async text => {
                await apiFetch(`/api/operations/maintenance/${selected.id}/comment`, {
                  method: "POST",
                  body: JSON.stringify({ text })
                });
                loadMaintenance();
              }}
            />
          </div>
        </div>
      </Modal>
    );
  };

  // ── Lost & Found Modal ─────────────────────────────────────────────────────
  const LostModal = () => {
    if (!selected) return null;
    const st = LOST_STATUS[selected.status] ?? LOST_STATUS.found;
    return (
      <Modal title="Знахідка" onClose={() => setModal(null)}>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-base font-semibold text-gray-900 mb-2">{selected.description}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {selected.color && <div><span className="text-gray-500">Колір: </span>{selected.color}</div>}
              {selected.brand && <div><span className="text-gray-500">Бренд: </span>{selected.brand}</div>}
              <div><span className="text-gray-500">Категорія: </span>{LOST_CATEGORY[selected.category] ?? selected.category}</div>
              <div><span className="text-gray-500">Дата: </span>{new Date(selected.found_date).toLocaleDateString("uk-UA")}</div>
              {selected.unit_name && <div className="col-span-2"><span className="text-gray-500">Кімната: </span>{selected.unit_name}</div>}
              {selected.storage_location && <div className="col-span-2"><span className="text-gray-500">Зберігається: </span>{selected.storage_location}</div>}
            </div>
          </div>

          {selected.guest_name && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-1">Власник</p>
              <p className="text-sm text-gray-800">{selected.guest_name}</p>
              {selected.guest_contact && (
                <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                  <Phone size={11} />{selected.guest_contact}
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Змінити статус</p>
            <div className="grid grid-cols-2 gap-2">
              {["found", "claimed", "donated", "disposed"].map(s => (
                <button key={s} onClick={async () => {
                  await updateLost(selected.id, { status: s, claimed_by: s === "claimed" ? "Рецепція" : undefined });
                  setSelected({ ...selected, status: s });
                }}
                  className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                    selected.status === s
                      ? `${LOST_STATUS[s].bg} border-current/40 ${LOST_STATUS[s].color}`
                      : "bg-white border-gray-200 text-gray-500"
                  }`}>
                  {LOST_STATUS[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Коментарі</p>
            <CommentThread
              comments={selected.comments ?? []}
              onAdd={async text => {
                await apiFetch(`/api/operations/lost-found/${selected.id}/comment`, {
                  method: "POST",
                  body: JSON.stringify({ text })
                });
                loadLost();
              }}
            />
          </div>
        </div>
      </Modal>
    );
  };

  // ── Inspection Modal ───────────────────────────────────────────────────────
  const InspectionModal = () => {
    if (!selected) return null;
    const [checklist, setChecklist] = useState<any[]>(
      Array.isArray(selected.checklist) ? selected.checklist : []
    );
    const [score, setScore] = useState<number>(selected.score ?? 0);
    const [saving, setSaving] = useState(false);

    const updateCheck = async (idx: number, ok: boolean | null) => {
      const updated = checklist.map((c, i) => i === idx ? { ...c, ok } : c);
      setChecklist(updated);
      const s = Math.round((updated.filter(c => c.ok === true).length / updated.length) * 100);
      setScore(s);
      await apiFetch(`/api/operations/inspections/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ checklist: updated, score: s })
      });
    };

    const changeStatus = async (status: string) => {
      setSaving(true);
      await updateInspection(selected.id, { status, score });
      setSelected({ ...selected, status });
      setSaving(false);
    };

    return (
      <Modal title={`${INSP_TYPE[selected.inspection_type]} — ${selected.unit_name}`} onClose={() => setModal(null)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Статус</p>
              <Badge text={INSP_STATUS[selected.status]?.label ?? selected.status}
                color={INSP_STATUS[selected.status]?.color ?? "text-gray-700"}
                bg={INSP_STATUS[selected.status]?.bg ?? "bg-gray-50 border-gray-200"} />
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Оцінка</p>
              <div className="flex items-center gap-1">
                <Star size={14} className={score >= 70 ? "text-amber-500" : "text-red-400"} />
                <span className={`text-lg font-bold ${score >= 70 ? "text-green-700" : "text-red-600"}`}>{score}/100</span>
              </div>
            </div>
          </div>

          {/* Checklist */}
          {checklist.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">
                Чек-лист ({checklist.filter(c => c.ok === true).length}/{checklist.length})
              </p>
              <div className="space-y-1">
                {checklist.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 py-1.5 px-2 rounded-lg border border-gray-100">
                    <span className="text-sm text-gray-700 flex-1">{item.item ?? item.title ?? item.text}</span>
                    <div className="flex gap-1">
                      <button onClick={() => updateCheck(idx, true)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          item.ok === true ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400 hover:bg-green-100"
                        }`}>✓</button>
                      <button onClick={() => updateCheck(idx, false)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          item.ok === false ? "bg-red-500 text-white" : "bg-gray-100 text-gray-400 hover:bg-red-100"
                        }`}>✗</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score progress */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Загальна оцінка</span>
              <span className={`font-bold ${score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600"}`}>{score}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"
              }`} style={{ width: `${score}%` }} />
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { s: "in_progress", l: "Почати", color: "bg-blue-600" },
              { s: "completed", l: "Завершити", color: "bg-green-600" },
              { s: "failed", l: "Провалено", color: "bg-red-600" },
              { s: "approved", l: "Схвалити", color: "bg-purple-600" },
            ].map(btn => (
              <button key={btn.s} onClick={() => changeStatus(btn.s)}
                disabled={saving || selected.status === btn.s}
                className={`py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 ${btn.color}`}>
                {btn.l}
              </button>
            ))}
          </div>

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Коментарі</p>
            <CommentThread
              comments={selected.comments ?? []}
              onAdd={async text => {
                await apiFetch(`/api/operations/inspections/${selected.id}/comment`, {
                  method: "POST",
                  body: JSON.stringify({ text })
                });
                loadInspections();
              }}
            />
          </div>
        </div>
      </Modal>
    );
  };

  // ── Create modals ──────────────────────────────────────────────────────────
  const CreateTaskModal = () => {
    const [form, setForm] = useState({
      unit_id: "", title: "", task_type: "cleaning", priority: "medium",
      assigned_to_id: "", due_date: "", estimated_minutes: 30, notes: ""
    });
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

    const submit = async () => {
      if (!form.unit_id || !form.title) return;
      setSaving(true);
      await apiFetch("/api/operations/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          unit_id: Number(form.unit_id),
          assigned_to_id: form.assigned_to_id ? Number(form.assigned_to_id) : null,
        })
      });
      setSaving(false);
      setModal(null);
      loadTasks();
    };

    return (
      <Modal title="Нова задача прибирання" onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Кімната *">
            <select className={selectCls} value={form.unit_id} onChange={e => set("unit_id", e.target.value)}>
              <option value="">Оберіть кімнату</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.property_name})</option>)}
            </select>
          </Field>
          <Field label="Назва задачі *">
            <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Наприклад: Прибрати кімнату після гостя" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Тип">
              <select className={selectCls} value={form.task_type} onChange={e => set("task_type", e.target.value)}>
                {Object.entries(TASK_TYPE).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Пріоритет">
              <select className={selectCls} value={form.priority} onChange={e => set("priority", e.target.value)}>
                <option value="low">Низький</option>
                <option value="medium">Середній</option>
                <option value="high">Високий</option>
              </select>
            </Field>
          </div>
          <Field label="Виконавець">
            <select className={selectCls} value={form.assigned_to_id} onChange={e => set("assigned_to_id", e.target.value)}>
              <option value="">— Не призначено —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Дата виконання">
              <input type="date" className={inputCls} value={form.due_date} onChange={e => set("due_date", e.target.value)} />
            </Field>
            <Field label="Час (хв)">
              <input type="number" className={inputCls} value={form.estimated_minutes}
                onChange={e => set("estimated_minutes", Number(e.target.value))} min={5} max={480} />
            </Field>
          </div>
          <Field label="Нотатки">
            <textarea className={inputCls} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Додаткові інструкції..." />
          </Field>
          <button onClick={submit} disabled={saving || !form.unit_id || !form.title}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Створити задачу"}
          </button>
        </div>
      </Modal>
    );
  };

  const CreateMntModal = () => {
    const [form, setForm] = useState({
      title: "", description: "", category: "other", priority: "medium",
      property_id: "", unit_id: "", assigned_to_user_id: "",
      estimated_duration_min: "", estimated_cost: "", due_date: ""
    });
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
    const filteredUnits = form.property_id ? units.filter(u => String(u.property_id) === form.property_id) : units;

    const submit = async () => {
      if (!form.title) return;
      setSaving(true);
      await apiFetch("/api/operations/maintenance", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          property_id: form.property_id ? Number(form.property_id) : null,
          unit_id: form.unit_id ? Number(form.unit_id) : null,
          assigned_to_user_id: form.assigned_to_user_id ? Number(form.assigned_to_user_id) : null,
          estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
          estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
        })
      });
      setSaving(false);
      setModal(null);
      loadMaintenance();
    };

    return (
      <Modal title="Нова заявка на ремонт" onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Назва *">
            <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Короткий опис проблеми" />
          </Field>
          <Field label="Опис">
            <textarea className={inputCls} rows={2} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Детальний опис..." />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Категорія">
              <select className={selectCls} value={form.category} onChange={e => set("category", e.target.value)}>
                {Object.entries(MNT_CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Пріоритет">
              <select className={selectCls} value={form.priority} onChange={e => set("priority", e.target.value)}>
                <option value="low">Низький</option>
                <option value="medium">Середній</option>
                <option value="high">Високий</option>
                <option value="critical">Критичний</option>
              </select>
            </Field>
          </div>
          <Field label="Об'єкт">
            <select className={selectCls} value={form.property_id} onChange={e => { set("property_id", e.target.value); set("unit_id", ""); }}>
              <option value="">Оберіть об'єкт</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Кімната">
            <select className={selectCls} value={form.unit_id} onChange={e => set("unit_id", e.target.value)}>
              <option value="">Не вказано</option>
              {filteredUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Призначити">
            <select className={selectCls} value={form.assigned_to_user_id} onChange={e => set("assigned_to_user_id", e.target.value)}>
              <option value="">— Не призначено —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Час (хв)">
              <input type="number" className={inputCls} value={form.estimated_duration_min} onChange={e => set("estimated_duration_min", e.target.value)} placeholder="60" />
            </Field>
            <Field label="Орієнтовна вартість">
              <input type="number" className={inputCls} value={form.estimated_cost} onChange={e => set("estimated_cost", e.target.value)} placeholder="₴" />
            </Field>
          </div>
          <Field label="Дедлайн (SLA)">
            <input type="date" className={inputCls} value={form.due_date} onChange={e => set("due_date", e.target.value)} />
          </Field>
          <button onClick={submit} disabled={saving || !form.title}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Створити заявку"}
          </button>
        </div>
      </Modal>
    );
  };

  const CreateLostModal = () => {
    const [form, setForm] = useState({
      property_id: "", unit_id: "", found_date: new Date().toISOString().split("T")[0],
      category: "other", description: "", color: "", brand: "",
      storage_location: "", guest_name: "", guest_contact: "", notes: ""
    });
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
    const filteredUnits = form.property_id ? units.filter(u => String(u.property_id) === form.property_id) : units;

    const submit = async () => {
      if (!form.description) return;
      setSaving(true);
      await apiFetch("/api/operations/lost-found", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          property_id: form.property_id ? Number(form.property_id) : null,
          unit_id: form.unit_id ? Number(form.unit_id) : null,
        })
      });
      setSaving(false);
      setModal(null);
      loadLost();
    };

    return (
      <Modal title="Нова знахідка" onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Опис *">
            <input className={inputCls} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Що знайдено?" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Категорія">
              <select className={selectCls} value={form.category} onChange={e => set("category", e.target.value)}>
                {Object.entries(LOST_CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Дата знахідки">
              <input type="date" className={inputCls} value={form.found_date} onChange={e => set("found_date", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Колір">
              <input className={inputCls} value={form.color} onChange={e => set("color", e.target.value)} placeholder="Чорний" />
            </Field>
            <Field label="Бренд">
              <input className={inputCls} value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Apple" />
            </Field>
          </div>
          <Field label="Об'єкт">
            <select className={selectCls} value={form.property_id} onChange={e => { set("property_id", e.target.value); set("unit_id", ""); }}>
              <option value="">Оберіть об'єкт</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Кімната">
            <select className={selectCls} value={form.unit_id} onChange={e => set("unit_id", e.target.value)}>
              <option value="">Не вказано</option>
              {filteredUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Місце зберігання">
            <input className={inputCls} value={form.storage_location} onChange={e => set("storage_location", e.target.value)} placeholder="Ресепшн, стіл №2" />
          </Field>
          <Field label="Власник (якщо відомо)">
            <input className={inputCls} value={form.guest_name} onChange={e => set("guest_name", e.target.value)} placeholder="Ім'я гостя" />
          </Field>
          <Field label="Контакт власника">
            <input className={inputCls} value={form.guest_contact} onChange={e => set("guest_contact", e.target.value)} placeholder="+380..." />
          </Field>
          <button onClick={submit} disabled={saving || !form.description}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Зареєструвати знахідку"}
          </button>
        </div>
      </Modal>
    );
  };

  const CreateInspectionModal = () => {
    const [form, setForm] = useState({
      unit_id: "", property_id: "", inspection_type: "routine", inspector_id: "", notes: ""
    });
    const [saving, setSaving] = useState(false);
    const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
    const filteredUnits = form.property_id ? units.filter(u => String(u.property_id) === form.property_id) : units;

    const submit = async () => {
      if (!form.unit_id) return;
      setSaving(true);
      await apiFetch("/api/operations/inspections", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          unit_id: Number(form.unit_id),
          property_id: form.property_id ? Number(form.property_id) : null,
          inspector_id: form.inspector_id ? Number(form.inspector_id) : null,
        })
      });
      setSaving(false);
      setModal(null);
      loadInspections();
    };

    return (
      <Modal title="Нова перевірка кімнати" onClose={() => setModal(null)}>
        <div className="space-y-3">
          <Field label="Об'єкт">
            <select className={selectCls} value={form.property_id} onChange={e => { set("property_id", e.target.value); set("unit_id", ""); }}>
              <option value="">Оберіть об'єкт</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Кімната *">
            <select className={selectCls} value={form.unit_id} onChange={e => set("unit_id", e.target.value)}>
              <option value="">Оберіть кімнату</option>
              {filteredUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Тип перевірки">
            <select className={selectCls} value={form.inspection_type} onChange={e => set("inspection_type", e.target.value)}>
              {Object.entries(INSP_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Інспектор">
            <select className={selectCls} value={form.inspector_id} onChange={e => set("inspector_id", e.target.value)}>
              <option value="">— Я сам —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Нотатки">
            <textarea className={inputCls} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Особливі вказівки..." />
          </Field>
          <button onClick={submit} disabled={saving || !form.unit_id}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Створити перевірку (10 пунктів)"}
          </button>
        </div>
      </Modal>
    );
  };

  // ── FAB actions ────────────────────────────────────────────────────────────
  const fabAction = () => {
    if (tab === "cleaning") setModal("create_task");
    else if (tab === "maintenance") setModal("create_mnt");
    else if (tab === "lost") setModal("create_lost");
    else if (tab === "inspections") setModal("create_inspection");
  };
  const showFab = ["cleaning", "maintenance", "lost", "inspections"].includes(tab);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
                <Layers size={16} className="text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-base font-bold text-gray-900">Операції</h1>
                <p className="text-xs text-gray-400">Internal Operations</p>
              </div>
              <button onClick={() => {
                loadDashboard();
                if (tab === "rooms") loadRooms();
                else if (tab === "cleaning") loadTasks();
                else if (tab === "maintenance") loadMaintenance();
                else if (tab === "lost") loadLost();
                else if (tab === "inspections") loadInspections();
                else if (tab === "preventive") loadSchedules();
              }}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Search (not on dashboard/rooms) */}
            {!["dashboard", "rooms", "preventive"].includes(tab) && (
              <div className="pb-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Пошук..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex overflow-x-auto -mx-4 px-4 pb-0 gap-0 scrollbar-hide">
              {tabs.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button key={t.id}
                    onClick={() => { setTab(t.id as Tab); setFilterStatus(""); setSearch(""); }}
                    className={`flex flex-col items-center shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                      active
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}>
                    <Icon size={16} className="mb-0.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
          {tab === "dashboard"   && renderDashboard()}
          {tab === "rooms"       && renderRooms()}
          {tab === "cleaning"    && renderCleaning()}
          {tab === "maintenance" && renderMaintenance()}
          {tab === "lost"        && renderLost()}
          {tab === "inspections" && renderInspections()}
          {tab === "preventive"  && renderPreventive()}
        </div>

        {/* FAB */}
        {showFab && (
          <button onClick={fabAction}
            className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg flex items-center justify-center transition-all hover:scale-105 z-30">
            <Plus size={24} />
          </button>
        )}

        {/* Modals */}
        {modal === "room"             && <RoomModal />}
        {modal === "task"             && <TaskModal />}
        {modal === "mnt"              && <MntModal />}
        {modal === "lost"             && <LostModal />}
        {modal === "inspection"       && <InspectionModal />}
        {modal === "create_task"      && <CreateTaskModal />}
        {modal === "create_mnt"       && <CreateMntModal />}
        {modal === "create_lost"      && <CreateLostModal />}
        {modal === "create_inspection"&& <CreateInspectionModal />}
      </div>
    </AppLayout>
  );
}
