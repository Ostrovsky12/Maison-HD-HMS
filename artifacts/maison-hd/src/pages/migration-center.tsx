import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderOpen, Upload, ScanLine, GitMerge, ShieldCheck, FlaskConical,
  BarChart3, GitCompare, Rocket, Archive, ClipboardList, Plus,
  CheckCircle2, AlertTriangle, XCircle, ChevronRight, Sparkles,
  RefreshCw, Loader2, FileText, Bot, Undo2, ArrowRight,
  TrendingUp, Database, Users, Receipt, Package, ArrowUpRight,
  CheckCheck, Circle, Clock, Info, Play, Zap, Target, Lock,
} from "lucide-react";

// ── API ───────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const mFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${tok()}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

const mGet = async (path: string) => {
  const r = await mFetch(`${API}/acc-migration${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const mPost = async (path: string, body?: any) => {
  const r = await mFetch(`${API}/acc-migration${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const mPatch = async (path: string, body?: any) => {
  const r = await mFetch(`${API}/acc-migration${path}`, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface Project {
  id: number;
  name: string;
  source_system: string;
  status: string;
  health_score?: number;
  file_count?: number;
  entity_count?: number;
  critical_errors?: number;
  warnings?: number;
  created_at: string;
  cutoff_date?: string;
  go_live_date?: string;
  notes?: string;
}

// ── NAV SECTIONS ─────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: "overview",      icon: FolderOpen,    label: "Огляд" },
  { id: "files",         icon: Upload,        label: "Файли джерела" },
  { id: "scan",          icon: ScanLine,      label: "Сканування" },
  { id: "mapping",       icon: GitMerge,      label: "Mapping Center" },
  { id: "validation",    icon: ShieldCheck,   label: "Валідація" },
  { id: "trial",         icon: FlaskConical,  label: "Пробний імпорт" },
  { id: "reconciliation",icon: BarChart3,     label: "Звірка" },
  { id: "parallel",      icon: GitCompare,    label: "Паралельна робота" },
  { id: "golive",        icon: Rocket,        label: "Go Live" },
  { id: "archive",       icon: Archive,       label: "Архів" },
  { id: "audit",         icon: ClipboardList, label: "Audit Log" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:             { label: "Чернетка",        color: "bg-gray-100 text-gray-600" },
  source_connected:  { label: "Підключено",       color: "bg-blue-100 text-blue-700" },
  data_scanned:      { label: "Дані відскановано",color: "bg-indigo-100 text-indigo-700" },
  mapping_required:  { label: "Потрібен маппінг", color: "bg-amber-100 text-amber-700" },
  validation_failed: { label: "Помилки валідації",color: "bg-red-100 text-red-700" },
  ready_for_trial:   { label: "Готово до тесту",  color: "bg-emerald-100 text-emerald-700" },
  trial_imported:    { label: "Пробний імпорт",   color: "bg-teal-100 text-teal-700" },
  reconciliation:    { label: "Звірка",            color: "bg-purple-100 text-purple-700" },
  parallel_run:      { label: "Паралельний режим", color: "bg-violet-100 text-violet-700" },
  completed:         { label: "Завершено ✓",       color: "bg-green-100 text-green-700" },
  archived:          { label: "Архів",             color: "bg-gray-100 text-gray-500" },
};

const SOURCE_SYSTEMS = [
  { value: "bas_xml",  label: "BAS / 1C (XML)" },
  { value: "bas_excel",label: "BAS / 1C (Excel)" },
  { value: "excel",    label: "Excel / CSV" },
  { value: "csv",      label: "CSV" },
  { value: "poster",   label: "Poster (скоро)" },
  { value: "servio",   label: "Servio (скоро)" },
];

// ── HEALTH SCORE GAUGE ────────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  const color = score >= 81 ? "#22c55e" : score >= 51 ? "#f59e0b" : "#ef4444";
  const label = score >= 81 ? "Безпечно" : score >= 51 ? "Потребує уваги" : "Критично";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{score}%</span>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

// ── STEP INDICATOR ────────────────────────────────────────────────────────────

const STEPS = [
  { key: "files",         label: "Файли" },
  { key: "scan",          label: "Сканування" },
  { key: "mapping",       label: "Маппінг" },
  { key: "validation",    label: "Валідація" },
  { key: "trial",         label: "Тест" },
  { key: "reconciliation",label: "Звірка" },
  { key: "golive",        label: "Go Live" },
];

const statusToStep: Record<string, number> = {
  draft: 0, source_connected: 0, data_scanned: 1,
  mapping_required: 2, validation_failed: 3, ready_for_trial: 3,
  trial_imported: 4, reconciliation: 5, parallel_run: 5,
  completed: 6, archived: 6,
};

function StepBar({ status }: { status: string }) {
  const current = statusToStep[status] ?? 0;
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                done ? "bg-indigo-600 text-white" : active ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400" : "bg-gray-100 text-gray-400"
              }`}>
                {done ? <CheckCheck size={13} /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${done ? "text-indigo-600" : active ? "text-indigo-500" : "text-gray-400"}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mb-4 mx-1 ${done ? "bg-indigo-500" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── NEW PROJECT MODAL ─────────────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
  const [name, setName] = useState("");
  const [system, setSystem] = useState("excel");
  const [cutoff, setCutoff] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try { await onCreate({ name: name.trim(), source_system: system, cutoff_date: cutoff || undefined, notes }); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Новий міграційний проект</h2>
          <p className="text-sm text-gray-500 mt-1">Переводимо ваш бізнес до MaisonHD безпечно</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Назва проекту</label>
            <Input className="mt-1" placeholder="напр. BAS → MaisonHD 2026" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Система-джерело</label>
            <Select value={system} onValueChange={setSystem}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_SYSTEMS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Дата зрізу (cutoff date)</label>
            <Input className="mt-1" type="date" value={cutoff} onChange={e => setCutoff(e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-1">Дані до цієї дати → архів. Активна бухгалтерія — після.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Примітки</label>
            <Input className="mt-1" placeholder="Додаткова інформація..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Скасувати</Button>
          <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={submit} disabled={!name.trim() || loading}>
            {loading ? <Loader2 size={15} className="animate-spin mr-2" /> : <Plus size={15} className="mr-2" />}
            Створити проект
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function MigrationCenterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeSection, setActiveSection] = useState("overview");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [mappingType, setMappingType] = useState("account");
  const [newMapping, setNewMapping] = useState({ source_value: "", source_label: "", target_value: "", target_label: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pid = selectedProject?.id;

  // Queries
  const projectsQ = useQuery({ queryKey: ["mig-projects"], queryFn: () => mGet("/projects"), refetchInterval: 15000 });
  const projectDetailQ = useQuery({ queryKey: ["mig-project", pid], queryFn: () => mGet(`/projects/${pid}`), enabled: !!pid, refetchInterval: 10000 });
  const scanQ = useQuery({ queryKey: ["mig-scan", pid], queryFn: () => mGet(`/projects/${pid}/scan`), enabled: !!pid && activeSection === "scan" });
  const entitiesQ = useQuery({ queryKey: ["mig-entities", pid], queryFn: () => mGet(`/projects/${pid}/entities?limit=50`), enabled: !!pid && activeSection === "scan" });
  const mappingsQ = useQuery({ queryKey: ["mig-mappings", pid, mappingType], queryFn: () => mGet(`/projects/${pid}/mappings?type=${mappingType}`), enabled: !!pid && activeSection === "mapping" });
  const validationQ = useQuery({ queryKey: ["mig-validation", pid], queryFn: () => mGet(`/projects/${pid}/validation`), enabled: !!pid && activeSection === "validation", refetchInterval: activeSection === "validation" ? 8000 : false });
  const batchesQ = useQuery({ queryKey: ["mig-batches", pid], queryFn: () => mGet(`/projects/${pid}/batches`), enabled: !!pid && activeSection === "trial", refetchInterval: activeSection === "trial" ? 5000 : false });
  const reconQ = useQuery({ queryKey: ["mig-recon", pid], queryFn: () => mGet(`/projects/${pid}/reconciliation`), enabled: !!pid && activeSection === "reconciliation" });
  const auditQ = useQuery({ queryKey: ["mig-audit", pid], queryFn: () => mGet(`/projects/${pid}/audit`), enabled: !!pid && activeSection === "audit" });

  // Mutations
  const createProject = useMutation({
    mutationFn: (data: any) => mPost("/projects", data),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ["mig-projects"] });
      setSelectedProject(proj);
      setActiveSection("files");
      setShowNewProject(false);
      toast({ title: "Проект створено", description: proj.name });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const runValidation = useMutation({
    mutationFn: () => mPost(`/projects/${pid}/validate`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["mig-validation", pid] });
      qc.invalidateQueries({ queryKey: ["mig-project", pid] });
      qc.invalidateQueries({ queryKey: ["mig-projects"] });
      toast({ title: `Валідація завершена`, description: `${res.errors_found} проблем знайдено (${res.critical} критичних)` });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const aiSuggest = useMutation({
    mutationFn: () => mPost(`/projects/${pid}/mappings/ai-suggest`, { mapping_type: mappingType }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["mig-mappings", pid, mappingType] });
      toast({ title: `AI запропонував ${res.total} маппінгів`, description: "Перевірте та підтвердьте пропозиції" });
    },
    onError: (e: any) => toast({ title: "Помилка AI", description: e.message, variant: "destructive" }),
  });

  const addMapping = useMutation({
    mutationFn: () => mPost(`/projects/${pid}/mappings`, { mapping_type: mappingType, ...newMapping }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mig-mappings", pid, mappingType] });
      setNewMapping({ source_value: "", source_label: "", target_value: "", target_label: "" });
      toast({ title: "Маппінг збережено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const approveMapping = useMutation({
    mutationFn: ({ mid, target_value, target_label }: any) =>
      mPatch(`/projects/${pid}/mappings/${mid}`, { target_value, target_label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mig-mappings", pid, mappingType] });
      toast({ title: "Маппінг підтверджено" });
    },
  });

  const resolveError = useMutation({
    mutationFn: (eid: number) => mPatch(`/projects/${pid}/validation/${eid}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mig-validation", pid] });
      qc.invalidateQueries({ queryKey: ["mig-project", pid] });
    },
  });

  const startTrial = useMutation({
    mutationFn: () => mPost(`/projects/${pid}/trial-import`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["mig-batches", pid] });
      qc.invalidateQueries({ queryKey: ["mig-project", pid] });
      toast({ title: "Пробний імпорт запущено", description: `${res.total} записів у черзі` });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const rollback = useMutation({
    mutationFn: (batchId: number) => mPost(`/projects/${pid}/batches/${batchId}/rollback`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mig-batches", pid] });
      qc.invalidateQueries({ queryKey: ["mig-project", pid] });
      toast({ title: "Rollback виконано", description: "Всі записи повернуто до стану 'pending'" });
    },
  });

  const goLive = useMutation({
    mutationFn: () => mPost(`/projects/${pid}/go-live`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["mig-project", pid] });
      qc.invalidateQueries({ queryKey: ["mig-projects"] });
      toast({ title: "🎉 Go Live підтверджено!", description: res.message });
    },
    onError: (e: any) => toast({ title: "Go Live заблоковано", description: e.message, variant: "destructive" }),
  });

  const handleFileUpload = useCallback(async () => {
    if (!uploadFile || !pid) return;
    setUploadLoading(true);
    try {
      const ext = uploadFile.name.split(".").pop()?.toLowerCase() || "csv";
      const b64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          res(result.split(",")[1] || "");
        };
        reader.onerror = rej;
        reader.readAsDataURL(uploadFile);
      });
      await mPost(`/projects/${pid}/files`, { filename: uploadFile.name, file_type: ext, content_base64: b64 });
      qc.invalidateQueries({ queryKey: ["mig-project", pid] });
      qc.invalidateQueries({ queryKey: ["mig-scan", pid] });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Файл завантажено", description: `${uploadFile.name} — аналіз в процесі` });
    } catch (e: any) {
      toast({ title: "Помилка завантаження", description: e.message, variant: "destructive" });
    } finally { setUploadLoading(false); }
  }, [uploadFile, pid, qc, toast]);

  const proj = projectDetailQ.data as any;
  const health = proj?.health_score ?? selectedProject?.health_score ?? 72;
  const status = proj?.status ?? selectedProject?.status ?? "draft";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50/50">

        {/* ── Left Panel: Project List + Nav ──────────────────────────────── */}
        <div className="w-64 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
          {/* Header */}
          <div className="px-5 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-base font-semibold text-gray-900">Migration Center</h1>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => setShowNewProject(true)}>
                <Plus size={15} className="text-indigo-600" />
              </Button>
            </div>
            <p className="text-xs text-gray-400">Безпечний перехід до MaisonHD</p>
          </div>

          {/* Project list */}
          <div className="px-3 py-3 border-b border-gray-100 space-y-1 max-h-56 overflow-y-auto">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Проекти</p>
            {projectsQ.isLoading && <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
            {projectsQ.data?.length === 0 && (
              <button
                onClick={() => setShowNewProject(true)}
                className="w-full text-left px-3 py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-xs hover:border-indigo-300 hover:text-indigo-500 transition-all"
              >
                <Plus size={13} className="inline mr-1" />Перший проект
              </button>
            )}
            {projectsQ.data?.map((p: Project) => (
              <button
                key={p.id}
                onClick={() => { setSelectedProject(p); setActiveSection("overview"); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                  selectedProject?.id === p.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                <div className="font-medium text-xs truncate">{p.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_LABELS[p.status]?.color || "bg-gray-100 text-gray-500"}`}>
                    {STATUS_LABELS[p.status]?.label || p.status}
                  </span>
                  {(p.critical_errors ?? 0) > 0 && (
                    <span className="text-[9px] text-red-500 font-medium">{p.critical_errors} крит.</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Section nav — only show when project selected */}
          {selectedProject && (
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Розділи</p>
              {NAV_SECTIONS.map(s => {
                const Icon = s.icon;
                const active = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                      active ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="font-medium text-xs">{s.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedProject ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center gap-6 px-8">
              <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <Rocket size={36} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Migration Center</h2>
                <p className="text-gray-500 mt-2 max-w-sm text-sm leading-relaxed">
                  Переводьте бізнес з BAS / 1C / Excel до MaisonHD без втрати даних, зупинки роботи та бухгалтерського хаосу.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-lg w-full">
                {[
                  { icon: ShieldCheck, label: "Валідація даних",    desc: "Автоматична перевірка якості" },
                  { icon: GitMerge,    label: "AI Маппінг",          desc: "Розумне зіставлення рахунків" },
                  { icon: BarChart3,   label: "Звірка 99.97%",       desc: "Точний контроль переносу" },
                ].map(f => (
                  <div key={f.label} className="bg-white rounded-2xl p-4 text-left border border-gray-100">
                    <f.icon size={20} className="text-indigo-500 mb-2" />
                    <div className="text-sm font-medium text-gray-800">{f.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{f.desc}</div>
                  </div>
                ))}
              </div>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6" onClick={() => setShowNewProject(true)}>
                <Plus size={16} className="mr-2" />Почати міграцію
              </Button>
            </div>
          ) : (
            <div className="p-6 max-w-5xl mx-auto space-y-6">

              {/* Top bar */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{proj?.name || selectedProject.name}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_LABELS[status]?.color || "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABELS[status]?.label || status}
                    </span>
                    <span className="text-xs text-gray-400">{SOURCE_SYSTEMS.find(s => s.value === (proj?.source_system || selectedProject.source_system))?.label}</span>
                  </div>
                </div>
                <StepBar status={status} />
              </div>

              {/* ── OVERVIEW ───────────────────────────────────────────────── */}
              {activeSection === "overview" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-4">
                    {/* Health Score */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 flex flex-col items-center gap-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Migration Health Score</p>
                      <HealthGauge score={health} />
                    </div>
                    {/* Stats */}
                    <div className="col-span-2 grid grid-cols-2 gap-4">
                      {[
                        { icon: FileText, label: "Файлів завантажено", value: proj?.file_count ?? 0, color: "text-blue-500" },
                        { icon: Database, label: "Сутностей знайдено", value: proj?.entity_count ?? 0, color: "text-indigo-500" },
                        { icon: XCircle, label: "Критичних помилок", value: proj?.critical_errors ?? 0, color: "text-red-500" },
                        { icon: AlertTriangle, label: "Попереджень", value: proj?.warnings ?? 0, color: "text-amber-500" },
                      ].map(s => (
                        <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100">
                          <s.icon size={20} className={s.color} />
                          <div className="text-2xl font-bold text-gray-900 mt-2">{s.value}</div>
                          <div className="text-xs text-gray-400">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Entity breakdown */}
                  {proj?.entity_stats?.length > 0 && (
                    <div className="bg-white rounded-2xl p-5 border border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-700 mb-4">Дані знайдено</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {proj.entity_stats.map((es: any) => {
                          const icons: Record<string, any> = { journal_entry: Receipt, counterparty: Users, product: Package, account: Database, balance: TrendingUp, general_record: FileText };
                          const Icon = icons[es.source_type] || Database;
                          return (
                            <div key={es.source_type} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                              <Icon size={16} className="text-indigo-500 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-gray-700 capitalize">{es.source_type.replace(/_/g, ' ')}</div>
                                <div className="text-lg font-bold text-gray-900">{Number(es.cnt).toLocaleString()}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Next step CTA */}
                  <div className="bg-indigo-50 rounded-2xl p-5 flex items-center justify-between border border-indigo-100">
                    <div>
                      <div className="text-sm font-semibold text-indigo-800">Наступний крок</div>
                      <div className="text-xs text-indigo-600 mt-0.5">
                        {status === 'draft' && 'Завантажте файли з вашої системи-джерела'}
                        {status === 'data_scanned' && 'Налаштуйте маппінг рахунків та контрагентів'}
                        {status === 'mapping_required' && 'Запустіть AI-маппінг або налаштуйте вручну'}
                        {status === 'validation_failed' && 'Виправте критичні помилки перед імпортом'}
                        {status === 'ready_for_trial' && 'Запустіть пробний імпорт у sandbox'}
                        {status === 'trial_imported' && 'Перевірте результати у розділі Звірка'}
                        {status === 'completed' && 'Міграція завершена! MaisonHD у продакшні.'}
                      </div>
                    </div>
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs" onClick={() => {
                      if (status === 'draft') setActiveSection('files');
                      else if (['data_scanned', 'mapping_required'].includes(status)) setActiveSection('mapping');
                      else if (status === 'validation_failed') setActiveSection('validation');
                      else if (status === 'ready_for_trial') setActiveSection('trial');
                      else if (status === 'trial_imported') setActiveSection('reconciliation');
                      else setActiveSection('golive');
                    }}>
                      Перейти <ArrowRight size={13} className="ml-1" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── FILES ──────────────────────────────────────────────────── */}
              {activeSection === "files" && (
                <div className="space-y-5">
                  {/* Upload zone */}
                  <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Завантажити файл</h3>
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${uploadFile ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"}`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
                    >
                      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.xml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }} />
                      <Upload size={28} className={`mx-auto mb-3 ${uploadFile ? "text-indigo-500" : "text-gray-300"}`} />
                      {uploadFile ? (
                        <div>
                          <div className="text-sm font-medium text-indigo-700">{uploadFile.name}</div>
                          <div className="text-xs text-gray-400 mt-1">{(uploadFile.size / 1024).toFixed(1)} KB</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm text-gray-500">Перетягніть файл або <span className="text-indigo-600 font-medium">виберіть</span></div>
                          <div className="text-xs text-gray-400 mt-1">CSV, Excel, BAS XML • до 10 MB</div>
                        </div>
                      )}
                    </div>
                    {uploadFile && (
                      <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl" onClick={handleFileUpload} disabled={uploadLoading}>
                        {uploadLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Upload size={14} className="mr-2" />}
                        Завантажити та проаналізувати
                      </Button>
                    )}
                  </div>

                  {/* File list */}
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-700">Завантажені файли</h3>
                    </div>
                    {!proj?.files?.length ? (
                      <div className="px-5 py-8 text-center text-sm text-gray-400">Файлів ще немає</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {proj.files.map((f: any) => (
                          <div key={f.id} className="px-5 py-3.5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileText size={16} className="text-indigo-400" />
                              <div>
                                <div className="text-sm font-medium text-gray-800">{f.filename}</div>
                                <div className="text-xs text-gray-400">{(f.size_bytes / 1024).toFixed(1)} KB • {new Date(f.uploaded_at).toLocaleDateString("uk-UA")}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {f.entities_found > 0 && <span className="text-xs text-indigo-600 font-medium">{f.entities_found} записів</span>}
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                f.parse_status === 'done' ? "bg-green-100 text-green-700" :
                                f.parse_status === 'error' ? "bg-red-100 text-red-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>
                                {f.parse_status === 'done' ? "Готово" : f.parse_status === 'error' ? "Помилка" : "Аналіз..."}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── SCAN ───────────────────────────────────────────────────── */}
              {activeSection === "scan" && (
                <div className="space-y-5">
                  {scanQ.isLoading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-4">
                        {[
                          { label: "Всього сутностей", value: scanQ.data?.total_entities ?? 0, icon: Database, color: "text-indigo-500" },
                          { label: "Health Score", value: `${scanQ.data?.health_score ?? health}%`, icon: Target, color: "text-emerald-500" },
                          { label: "Файлів оброблено", value: scanQ.data?.files?.filter((f: any) => f.parse_status === 'done').length ?? 0, icon: CheckCircle2, color: "text-green-500" },
                          { label: "Типів даних", value: scanQ.data?.entity_breakdown?.length ?? 0, icon: ScanLine, color: "text-blue-500" },
                        ].map(s => (
                          <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100">
                            <s.icon size={18} className={s.color} />
                            <div className="text-2xl font-bold text-gray-900 mt-2">{s.value}</div>
                            <div className="text-xs text-gray-400">{s.label}</div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-white rounded-2xl border border-gray-100">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-700">Розбивка за типами</h3>
                        </div>
                        {!scanQ.data?.entity_breakdown?.length ? (
                          <div className="px-5 py-8 text-center text-sm text-gray-400">
                            Завантажте файли щоб розпочати сканування
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-50">
                            {scanQ.data.entity_breakdown.map((e: any) => {
                              const total = scanQ.data.total_entities;
                              const pct = total > 0 ? Math.round((e.cnt / total) * 100) : 0;
                              return (
                                <div key={e.source_type} className="px-5 py-3.5">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm font-medium text-gray-700 capitalize">{e.source_type.replace(/_/g, ' ')}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-semibold text-gray-900">{Number(e.cnt).toLocaleString()}</span>
                                      <span className="text-xs text-gray-400">{pct}%</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className="bg-indigo-500 rounded-full h-1.5 transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Sample entities */}
                      {entitiesQ.data?.rows?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                          <div className="px-5 py-4 border-b border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-700">Приклади знайдених записів</h3>
                          </div>
                          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                            {entitiesQ.data.rows.slice(0, 20).map((e: any) => (
                              <div key={e.id} className="px-5 py-2.5 flex items-center gap-3">
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0">
                                  {e.source_type.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs text-gray-600 truncate font-mono">
                                  {Object.values(e.source_payload as Record<string, string>).filter(Boolean).slice(0, 4).join(' · ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── MAPPING CENTER ─────────────────────────────────────────── */}
              {activeSection === "mapping" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <Select value={mappingType} onValueChange={setMappingType}>
                      <SelectTrigger className="w-44 h-9 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="account">Рахунки</SelectItem>
                        <SelectItem value="counterparty">Контрагенти</SelectItem>
                        <SelectItem value="product">Товари/Послуги</SelectItem>
                        <SelectItem value="warehouse">Склади</SelectItem>
                        <SelectItem value="tax">Податки</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={() => aiSuggest.mutate()} disabled={aiSuggest.isPending} className="bg-violet-600 hover:bg-violet-700 rounded-xl h-9 text-xs gap-2">
                      {aiSuggest.isPending ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
                      AI маппінг
                    </Button>
                    <span className="text-xs text-gray-400 ml-auto">{mappingsQ.data?.length ?? 0} маппінгів</span>
                  </div>

                  {/* Add manual mapping */}
                  <div className="bg-white rounded-2xl p-4 border border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-3">Додати маппінг вручну</p>
                    <div className="grid grid-cols-4 gap-2">
                      <Input placeholder="Джерело (код)" className="h-8 text-xs rounded-lg" value={newMapping.source_value} onChange={e => setNewMapping(p => ({ ...p, source_value: e.target.value }))} />
                      <Input placeholder="Назва джерела" className="h-8 text-xs rounded-lg" value={newMapping.source_label} onChange={e => setNewMapping(p => ({ ...p, source_label: e.target.value }))} />
                      <Input placeholder="MaisonHD (код)" className="h-8 text-xs rounded-lg" value={newMapping.target_value} onChange={e => setNewMapping(p => ({ ...p, target_value: e.target.value }))} />
                      <Input placeholder="Назва MaisonHD" className="h-8 text-xs rounded-lg" value={newMapping.target_label} onChange={e => setNewMapping(p => ({ ...p, target_label: e.target.value }))} />
                    </div>
                    <Button size="sm" className="mt-3 h-8 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700" onClick={() => addMapping.mutate()} disabled={!newMapping.source_value || !newMapping.target_value || addMapping.isPending}>
                      <Plus size={12} className="mr-1" />Зберегти
                    </Button>
                  </div>

                  {/* Mappings table */}
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="grid grid-cols-5 gap-0 px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50/50">
                      <span className="col-span-2">Джерело</span>
                      <span className="col-span-2">MaisonHD</span>
                      <span className="text-right">Дія</span>
                    </div>
                    {mappingsQ.isLoading && <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
                    {!mappingsQ.isLoading && !mappingsQ.data?.length && (
                      <div className="px-5 py-8 text-center">
                        <p className="text-sm text-gray-400">Маппінгів немає</p>
                        <p className="text-xs text-gray-300 mt-1">Запустіть AI або додайте вручну</p>
                      </div>
                    )}
                    <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                      {mappingsQ.data?.map((m: any) => (
                        <div key={m.id} className="grid grid-cols-5 gap-0 px-5 py-3 items-center">
                          <div className="col-span-2">
                            <div className="text-xs font-medium text-gray-800">{m.source_value}</div>
                            {m.source_label && <div className="text-[11px] text-gray-400">{m.source_label}</div>}
                          </div>
                          <div className="col-span-2 flex items-center gap-2">
                            {m.target_value ? (
                              <div>
                                <div className="text-xs font-medium text-indigo-700">{m.target_value}</div>
                                {m.target_label && <div className="text-[11px] text-gray-400">{m.target_label}</div>}
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-300 italic">Не призначено</span>
                            )}
                            {m.is_ai_suggested && !m.approved_at && (
                              <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">AI {m.confidence_score}%</span>
                            )}
                            {m.approved_at && <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />}
                          </div>
                          <div className="flex justify-end gap-1">
                            {m.is_ai_suggested && !m.approved_at && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                onClick={() => approveMapping.mutate({ mid: m.id, target_value: m.target_value, target_label: m.target_label })}>
                                <CheckCheck size={11} className="mr-1" />OK
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── VALIDATION ─────────────────────────────────────────────── */}
              {activeSection === "validation" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <Button onClick={() => runValidation.mutate()} disabled={runValidation.isPending} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-9 text-xs gap-2">
                      {runValidation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      Запустити валідацію
                    </Button>
                    <span className="text-xs text-gray-400 ml-auto">{validationQ.data?.length ?? 0} проблем</span>
                  </div>

                  {validationQ.isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-indigo-500" /></div>}
                  {!validationQ.isLoading && !validationQ.data?.length && (
                    <div className="bg-white rounded-2xl p-10 border border-gray-100 text-center">
                      <ShieldCheck size={36} className="text-emerald-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-600">Проблем не знайдено</p>
                      <p className="text-xs text-gray-400 mt-1">Запустіть валідацію або дані ще не завантажено</p>
                    </div>
                  )}

                  {validationQ.data?.length > 0 && (
                    <div className="space-y-2.5">
                      {validationQ.data.map((e: any) => (
                        <div key={e.id} className={`bg-white rounded-2xl p-4 border flex items-start gap-4 ${
                          e.severity === 'critical' ? 'border-red-200 bg-red-50/30' :
                          e.severity === 'warning' ? 'border-amber-200 bg-amber-50/30' :
                          'border-gray-100'
                        }`}>
                          <div className="flex-shrink-0 mt-0.5">
                            {e.severity === 'critical' ? <XCircle size={18} className="text-red-500" /> :
                             e.severity === 'warning' ? <AlertTriangle size={18} className="text-amber-500" /> :
                             <Info size={18} className="text-blue-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold uppercase ${
                                e.severity === 'critical' ? 'text-red-600' : e.severity === 'warning' ? 'text-amber-600' : 'text-blue-500'
                              }`}>{e.severity}</span>
                              {e.error_code && <span className="text-[10px] text-gray-400 font-mono">{e.error_code}</span>}
                            </div>
                            <p className="text-sm font-medium text-gray-800">{e.message}</p>
                            {e.suggested_fix && (
                              <p className="text-xs text-gray-500 mt-1">💡 {e.suggested_fix}</p>
                            )}
                          </div>
                          {e.status === 'open' && (
                            <Button size="sm" variant="ghost" className="h-7 px-3 text-xs text-gray-500 hover:bg-gray-100 rounded-lg flex-shrink-0"
                              onClick={() => resolveError.mutate(e.id)}>
                              Вирішено
                            </Button>
                          )}
                          {e.status === 'resolved' && (
                            <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TRIAL IMPORT ───────────────────────────────────────────── */}
              {activeSection === "trial" && (
                <div className="space-y-5">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-start gap-4">
                    <FlaskConical size={22} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-indigo-800">Sandbox-режим</p>
                      <p className="text-xs text-indigo-600 mt-0.5">Пробний імпорт не впливає на продакшн дані. Всі записи ізольовані і можуть бути відкочені.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button onClick={() => startTrial.mutate()} disabled={startTrial.isPending} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-9 text-xs gap-2">
                      {startTrial.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      Запустити пробний імпорт
                    </Button>
                  </div>

                  {batchesQ.isLoading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-500" /></div>}
                  {!batchesQ.isLoading && batchesQ.data?.length === 0 && (
                    <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-sm text-gray-400">
                      Пробних імпортів ще не було
                    </div>
                  )}
                  <div className="space-y-3">
                    {batchesQ.data?.map((b: any) => (
                      <div key={b.id} className="bg-white rounded-2xl p-5 border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              b.status === 'completed' ? 'bg-green-500' :
                              b.status === 'running' ? 'bg-amber-400 animate-pulse' :
                              b.status === 'rolled_back' ? 'bg-gray-400' : 'bg-blue-400'
                            }`} />
                            <span className="text-sm font-semibold text-gray-800">Batch #{b.id}</span>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              b.status === 'completed' ? 'bg-green-100 text-green-700' :
                              b.status === 'running' ? 'bg-amber-100 text-amber-700' :
                              b.status === 'rolled_back' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
                            }`}>{b.status}</span>
                          </div>
                          <span className="text-xs text-gray-400">{b.started_at ? new Date(b.started_at).toLocaleString("uk-UA") : ""}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-gray-50 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold text-gray-900">{b.records_total}</div>
                            <div className="text-[11px] text-gray-400">Всього</div>
                          </div>
                          <div className="bg-green-50 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold text-green-700">{b.records_imported}</div>
                            <div className="text-[11px] text-gray-400">Імпортовано</div>
                          </div>
                          <div className="bg-red-50 rounded-xl p-3 text-center">
                            <div className="text-lg font-bold text-red-600">{b.records_failed}</div>
                            <div className="text-[11px] text-gray-400">Помилок</div>
                          </div>
                        </div>

                        {b.report?.accuracy !== undefined && (
                          <div className="flex items-center gap-2 mb-4">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-indigo-500 rounded-full h-2 transition-all" style={{ width: `${b.report.accuracy}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-indigo-700">{b.report.accuracy}%</span>
                          </div>
                        )}

                        {b.rollback_available && b.status === 'completed' && (
                          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                            onClick={() => rollback.mutate(b.id)}>
                            <Undo2 size={11} />Rollback
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── RECONCILIATION ─────────────────────────────────────────── */}
              {activeSection === "reconciliation" && (
                <div className="space-y-5">
                  {reconQ.isLoading && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-500" /></div>}
                  {reconQ.data && (
                    <>
                      <div className="bg-white rounded-2xl p-6 border border-gray-100 flex items-center gap-8">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`text-4xl font-bold ${
                            reconQ.data.accuracy >= 99 ? 'text-green-600' :
                            reconQ.data.accuracy >= 95 ? 'text-amber-500' : 'text-red-500'
                          }`}>{reconQ.data.accuracy}%</div>
                          <div className="text-xs text-gray-400">Точність міграції</div>
                          <div className={`text-xs font-semibold px-2.5 py-1 rounded-full mt-1 ${
                            reconQ.data.status === 'excellent' ? 'bg-green-100 text-green-700' :
                            reconQ.data.status === 'good' ? 'bg-emerald-100 text-emerald-700' :
                            reconQ.data.status === 'acceptable' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {reconQ.data.status === 'excellent' ? 'Відмінно' : reconQ.data.status === 'good' ? 'Добре' : reconQ.data.status === 'acceptable' ? 'Прийнятно' : 'Потребує виправлень'}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="w-full bg-gray-100 rounded-full h-3 mb-3">
                            <div className={`rounded-full h-3 transition-all ${
                              reconQ.data.accuracy >= 99 ? 'bg-green-500' : reconQ.data.accuracy >= 95 ? 'bg-amber-400' : 'bg-red-400'
                            }`} style={{ width: `${reconQ.data.accuracy}%` }} />
                          </div>
                          <div className="grid grid-cols-4 gap-3">
                            {[
                              { label: "Всього",      value: reconQ.data.total,    color: "text-gray-700" },
                              { label: "Перенесено",  value: reconQ.data.imported, color: "text-green-600" },
                              { label: "Пропущено",   value: reconQ.data.skipped,  color: "text-amber-500" },
                              { label: "Помилок",     value: reconQ.data.failed,   color: "text-red-500" },
                            ].map(s => (
                              <div key={s.label} className="text-center">
                                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                                <div className="text-[11px] text-gray-400">{s.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {reconQ.data.breakdown?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                          <div className="px-5 py-4 border-b border-gray-100">
                            <h3 className="text-sm font-semibold text-gray-700">Звірка за типами</h3>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {reconQ.data.breakdown.map((b: any) => {
                              const pct = b.total > 0 ? Math.round((b.imported / b.total) * 100) : 0;
                              return (
                                <div key={b.source_type} className="px-5 py-3.5 flex items-center gap-4">
                                  <span className="text-xs font-medium text-gray-600 capitalize w-36">{b.source_type.replace(/_/g,' ')}</span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                                    <div className={`rounded-full h-2 ${pct === 100 ? 'bg-green-500' : pct >= 90 ? 'bg-indigo-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs font-semibold text-gray-700 w-20 text-right">{b.imported}/{b.total} ({pct}%)</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── PARALLEL RUN ───────────────────────────────────────────── */}
              {activeSection === "parallel" && (
                <div className="space-y-5">
                  <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
                    <GitCompare size={36} className="text-indigo-400 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-gray-800 mb-2">Паралельна робота (2–4 тижні)</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                      Запустіть MaisonHD паралельно зі старою системою. Порівнюйте продажі, виплати, залишки та проводки щодня. Після підтвердження точності — переходьте до Go Live.
                    </p>
                    <div className="mt-6 grid grid-cols-3 gap-4 max-w-sm mx-auto text-left">
                      {[
                        { label: "Продажі", icon: TrendingUp },
                        { label: "Баланси", icon: BarChart3 },
                        { label: "Проводки", icon: Receipt },
                      ].map(f => (
                        <div key={f.label} className="bg-gray-50 rounded-xl p-3 text-center">
                          <f.icon size={18} className="text-indigo-400 mx-auto mb-1" />
                          <div className="text-xs font-medium text-gray-600">{f.label}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Порівнюється</div>
                        </div>
                      ))}
                    </div>
                    <Button className="mt-6 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs" onClick={async () => {
                      try { await mPatch(`/projects/${pid}`, { status: 'parallel_run' }); qc.invalidateQueries({ queryKey: ["mig-project", pid] }); toast({ title: "Паралельний режим активовано" }); } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
                    }}>
                      <Zap size={13} className="mr-2" />Активувати паралельний режим
                    </Button>
                  </div>
                </div>
              )}

              {/* ── GO LIVE ────────────────────────────────────────────────── */}
              {activeSection === "golive" && (
                <div className="space-y-5">
                  <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <h3 className="text-base font-semibold text-gray-800 mb-5">Чекліст Go Live</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Всі критичні помилки вирішені", done: (proj?.critical_errors ?? 1) === 0 },
                        { label: "Health Score ≥ 70%", done: health >= 70 },
                        { label: "Пробний імпорт виконано", done: ['trial_imported','reconciliation','parallel_run','completed'].includes(status) },
                        { label: "Звірка пройдена", done: ['parallel_run','completed'].includes(status) },
                        { label: "Дата зрізу встановлена", done: !!(proj?.cutoff_date || selectedProject.cutoff_date) },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? "bg-green-100" : "bg-gray-100"}`}>
                            {item.done ? <CheckCheck size={11} className="text-green-600" /> : <Circle size={10} className="text-gray-400" />}
                          </div>
                          <span className={`text-sm ${item.done ? "text-gray-700" : "text-gray-400"}`}>{item.label}</span>
                          {item.done && <span className="ml-auto text-xs text-green-600 font-medium">✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 border border-gray-100 flex items-start gap-5">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Lock size={16} className="text-amber-500" />
                        <h3 className="text-sm font-semibold text-gray-800">Підтвердження Go Live</h3>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Після підтвердження MaisonHD стає основною системою. Стара система переходить в режим "тільки читання" (архів). Дія незворотна.
                      </p>
                    </div>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs gap-2 flex-shrink-0"
                      onClick={() => goLive.mutate()}
                      disabled={goLive.isPending || status === 'completed'}
                    >
                      {goLive.isPending ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                      {status === 'completed' ? "Завершено ✓" : "Go Live"}
                    </Button>
                  </div>

                  {status === 'completed' && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                      <CheckCircle2 size={36} className="text-green-500 mx-auto mb-3" />
                      <h3 className="text-base font-semibold text-green-800">Міграція завершена!</h3>
                      <p className="text-sm text-green-600 mt-1">MaisonHD тепер є основною операційною системою вашого бізнесу.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── ARCHIVE ────────────────────────────────────────────────── */}
              {activeSection === "archive" && (
                <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
                  <Archive size={36} className="text-gray-300 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-gray-600">Архів документів</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                    Тут зберігатимуться архівні документи зі старої системи: PDF, XML, Excel. Доступні лише для перегляду.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 text-xs text-indigo-500 bg-indigo-50 px-4 py-2 rounded-full">
                    <Clock size={12} />Буде доступно після Go Live
                  </div>
                </div>
              )}

              {/* ── AUDIT LOG ──────────────────────────────────────────────── */}
              {activeSection === "audit" && (
                <div className="space-y-5">
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-700">Журнал аудиту</h3>
                      <span className="text-xs text-gray-400">{auditQ.data?.length ?? 0} записів</span>
                    </div>
                    {auditQ.isLoading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" size={16} /></div>}
                    {!auditQ.isLoading && !auditQ.data?.length && (
                      <div className="px-5 py-8 text-center text-sm text-gray-400">Дій ще не зафіксовано</div>
                    )}
                    <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
                      {auditQ.data?.map((log: any) => (
                        <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <ClipboardList size={12} className="text-indigo-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-800">{log.action.replace(/_/g, ' ')}</span>
                              {log.entity_type && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">{log.entity_type}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-gray-400">{log.user_name || "Система"}</span>
                              <span className="text-[11px] text-gray-300">•</span>
                              <span className="text-[11px] text-gray-400">{new Date(log.created_at).toLocaleString("uk-UA")}</span>
                            </div>
                          </div>
                          {log.new_value && (
                            <span className="text-[10px] text-gray-400 font-mono truncate max-w-32">{JSON.stringify(log.new_value)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={createProject.mutate}
        />
      )}
    </AppLayout>
  );
}
