import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Wrench, AlertTriangle, Clock, CheckCircle2, AlertCircle,
  ChevronRight, Building2, MapPin, Play, PackageX, LogOut,
  Bell, BellOff, RefreshCw, ChevronDown, ChevronUp, User,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_ROOT = BASE.replace("/maison-hd", "");
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch(API_ROOT + path, {
    ...opts,
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  critical: { label: "Критичний", color: "text-red-700", bg: "bg-red-50", border: "border-red-300", icon: AlertTriangle },
  high:     { label: "Високий",   color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-300", icon: AlertCircle },
  medium:   { label: "Середній",  color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", icon: Clock },
  low:      { label: "Низький",   color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: ChevronRight },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  open:          { label: "Відкрита",         badge: "bg-gray-100 text-gray-700" },
  in_progress:   { label: "В роботі",         badge: "bg-blue-100 text-blue-700" },
  pending_parts: { label: "Очікує запчастини", badge: "bg-yellow-100 text-yellow-700" },
  resolved:      { label: "Вирішено",          badge: "bg-green-100 text-green-700" },
  cancelled:     { label: "Скасовано",         badge: "bg-gray-100 text-gray-500" },
  escalated:     { label: "Ескалація",         badge: "bg-red-100 text-red-700" },
};

const CATEGORY_LABELS: Record<string, string> = {
  plumbing: "Сантехніка", electrical: "Електрика", hvac: "HVAC/Клімат",
  carpentry: "Столярні", cleaning: "Прибирання", painting: "Фарбування",
  elevator: "Ліфт", pool: "Басейн", garden: "Сад", security: "Безпека",
  it: "IT", furniture: "Меблі", appliances: "Техніка",
  structural: "Конструкція", other: "Інше",
};

function fmtDate(d: any) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function RequestCard({ req, onStatusChange }: { req: any; onStatusChange: (id: number, status: string, note?: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const pCfg = PRIORITY_CONFIG[req.priority] ?? PRIORITY_CONFIG.medium;
  const sCfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.open;
  const PIcon = pCfg.icon;

  return (
    <div className={`rounded-2xl border-2 ${pCfg.border} ${pCfg.bg} overflow-hidden shadow-sm`}>
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <PIcon className={`w-5 h-5 shrink-0 ${pCfg.color}`} />
            <span className="font-semibold text-gray-900 leading-tight">{req.title}</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${sCfg.badge}`}>
            {sCfg.label}
          </span>
        </div>

        {req.description && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{req.description}</p>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          {req.property_name && (
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{req.property_name}</span>
          )}
          {req.unit_name && (
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{req.unit_name}</span>
          )}
          <span className="flex items-center gap-1">{CATEGORY_LABELS[req.category] ?? req.category}</span>
          {req.due_date && (
            <span className="flex items-center gap-1 text-orange-600 font-medium">
              <Clock className="w-3.5 h-3.5" />до {fmtDate(req.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {req.status !== "resolved" && req.status !== "cancelled" && (
        <div className="px-4 pb-3 flex gap-2">
          {req.status === "open" && (
            <button
              onClick={() => onStatusChange(req.id, "in_progress")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm active:scale-95 transition-transform"
            >
              <Play className="w-4 h-4" /> Взяти в роботу
            </button>
          )}
          {req.status === "in_progress" && (
            <>
              <button
                onClick={() => onStatusChange(req.id, "pending_parts")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-500 text-white font-semibold text-sm active:scale-95 transition-transform"
              >
                <PackageX className="w-4 h-4" /> Потребує матеріалів
              </button>
              <button
                onClick={() => setExpanded(e => !e)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm active:scale-95 transition-transform"
              >
                <CheckCircle2 className="w-4 h-4" /> Виконано
              </button>
            </>
          )}
          {req.status === "pending_parts" && (
            <button
              onClick={() => onStatusChange(req.id, "in_progress")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm active:scale-95 transition-transform"
            >
              <Play className="w-4 h-4" /> Продовжити роботу
            </button>
          )}
        </div>
      )}

      {/* Expanded "resolve" form */}
      {expanded && req.status === "in_progress" && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/60 pt-3">
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Що було зроблено? (необов'язково)"
            rows={3}
            className="text-sm bg-white/80"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onStatusChange(req.id, "resolved", note); setExpanded(false); setNote(""); }}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm active:scale-95 transition-transform"
            >
              Підтвердити виконання ✓
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="px-4 py-3 rounded-xl bg-white text-gray-600 font-medium text-sm border border-gray-200 active:scale-95 transition-transform"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {req.status === "resolved" && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" /> Виконано
          </div>
        </div>
      )}
    </div>
  );
}

export default function TechPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [myOnly, setMyOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState("open");
  const [pushEnabled, setPushEnabled] = useState(() => {
    return Notification?.permission === "granted";
  });

  usePushNotifications(true);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tech-requests", myOnly, filterStatus],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "100" });
      if (filterStatus !== "all") p.set("status", filterStatus);
      if (myOnly) p.set("assignedToMe", "true");
      return apiFetch(`/api/maintenance?${p}`);
    },
    refetchInterval: 30000,
  });

  const { data: me } = useQuery({
    queryKey: ["me-tech"],
    queryFn: () => apiFetch("/api/auth/me"),
  });

  const updateM = useMutation({
    mutationFn: ({ id, status, note }: any) =>
      apiFetch(`/api/maintenance/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, resolutionNotes: note }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["tech-requests"] });
      const msg: Record<string, string> = {
        in_progress: "Заявку взято в роботу",
        pending_parts: "Позначено: очікує матеріалів",
        resolved: "Заявку виконано! ✓",
      };
      toast({ title: msg[vars.status] ?? "Оновлено" });
    },
  });

  const requests = data?.requests ?? [];
  const myCount = requests.filter((r: any) => r.assigned_to_user_id === me?.id).length;

  function handleStatusChange(id: number, status: string, note?: string) {
    updateM.mutate({ id, status, note });
  }

  async function togglePush() {
    if (!("PushManager" in window)) {
      toast({ title: "Push не підтримується у цьому браузері" });
      return;
    }
    if (Notification.permission === "denied") {
      toast({ title: "Push-сповіщення заблоковані", description: "Дозвольте їх у налаштуваннях браузера" });
      return;
    }
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setPushEnabled(true);
        toast({ title: "Push-сповіщення увімкнено!" });
      }
      return;
    }
    setPushEnabled(e => !e);
  }

  function logout() {
    localStorage.removeItem("hms_token");
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-gray-900 text-sm leading-tight">Технічна служба</div>
            {me?.name && <div className="text-xs text-gray-500">{me.name}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95 transition-transform">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={togglePush} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95 transition-transform">
            {pushEnabled ? <Bell className="w-4 h-4 text-blue-600" /> : <BellOff className="w-4 h-4" />}
          </button>
          <button onClick={logout} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95 transition-transform">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bg-white border-b px-4 pt-3 pb-0">
        {/* My / All toggle */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setMyOnly(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!myOnly ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            Всі заявки
          </button>
          <button
            onClick={() => setMyOnly(true)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${myOnly ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            Мої задачі {myCount > 0 && <span className="ml-1 bg-white/30 px-1.5 rounded-full text-xs">{myCount}</span>}
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {[
            { val: "open", label: "Відкриті" },
            { val: "in_progress", label: "В роботі" },
            { val: "pending_parts", label: "Запчастини" },
            { val: "all", label: "Всі" },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === val ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Завантаження...
          </div>
        )}

        {!isLoading && requests.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Немає заявок</p>
            <p className="text-gray-400 text-sm mt-1">
              {myOnly ? "Немає задач призначених на вас" : "Немає активних заявок"}
            </p>
          </div>
        )}

        {requests.map((req: any) => (
          <RequestCard key={req.id} req={req} onStatusChange={handleStatusChange} />
        ))}

        <div className="h-4" />
      </div>

      {/* Bottom badge */}
      <div className="bg-white border-t px-4 py-2 text-center">
        <span className="text-xs text-gray-400">Maison HD · Технічна служба</span>
      </div>
    </div>
  );
}
