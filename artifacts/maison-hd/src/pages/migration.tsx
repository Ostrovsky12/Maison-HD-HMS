import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle, CheckCircle2, Loader2, ServerCrash, Wifi, WifiOff,
  Database, Users, CalendarDays, Home, TrendingUp, ArrowRight,
  ArrowLeft, RefreshCw, Eye, Play, AlertTriangle, FileCheck,
  ToggleLeft, ToggleRight, Plug, ChevronRight, Info, XCircle,
  ChevronDown, ChevronUp, CheckSquare, Square,
} from "lucide-react";

// ── API helpers ─────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${tok()}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

// ── Types ───────────────────────────────────────────────────────
interface Connection {
  id: number;
  systemSlug: string;
  systemName: string;
  displayName?: string;
  baseUrl?: string;
  hotelCode?: string;
  status: string;
  lastTestAt?: string;
  lastSyncAt?: string;
  isCutoverMode: boolean;
  metadata?: Record<string, any>;
}

interface Stats {
  connections: Connection[];
  totalBatches: number;
  completedBatches: number;
  totalImported: number;
  totalConflicts: number;
  totalMappings: number;
  unresolvedConflicts: number;
}

interface Batch {
  id: number;
  status: string;
  batchType: string;
  entityTypes: string[];
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  conflictItems: number;
  skippedItems: number;
  createdAt: string;
  completedAt?: string;
  startedAt?: string;
  itemStats?: { status: string; count: number }[];
}

interface Conflict {
  id: number;
  entityType: string;
  externalId: string;
  internalId: number;
  conflictType: string;
  externalData: any;
  internalData: any;
  resolution?: string;
}

// ── Wizard steps ────────────────────────────────────────────────
const STEPS = [
  { id: "connect",   label: "Підключення",   icon: Plug },
  { id: "preview",   label: "Перегляд",      icon: Eye },
  { id: "configure", label: "Налаштування",  icon: Database },
  { id: "import",    label: "Імпорт",        icon: Play },
  { id: "conflicts", label: "Конфлікти",     icon: AlertTriangle },
  { id: "summary",   label: "Підсумок",      icon: FileCheck },
  { id: "cutover",   label: "Перехід",       icon: ToggleRight },
];

const ENTITY_TYPES = [
  { key: "guests",   label: "Гості",             icon: "👤", description: "База гостей, профілі, контакти" },
  { key: "bookings", label: "Бронювання",         icon: "📅", description: "Минулі, активні, майбутні" },
  { key: "rooms",    label: "Номери / Юніти",     icon: "🏠", description: "Кімнати, типи, категорії" },
  { key: "rates",    label: "Тарифи",             icon: "💰", description: "Прайс-листи, умови" },
  { key: "companies",label: "Контрагенти",        icon: "🏢", description: "Корпоративні клієнти" },
  { key: "services", label: "Послуги",            icon: "✨", description: "Додаткові послуги" },
];

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-green-100 text-green-700 border-green-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  error:     "bg-red-100 text-red-700 border-red-200",
  disconnected: "bg-gray-100 text-gray-600 border-gray-200",
  running:   "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

// ── Main component ───────────────────────────────────────────────
export default function MigrationPage() {
  const { toast } = useToast();

  // Overview state
  const [stats, setStats] = useState<Stats | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(0);

  // Step 0 — Connection form
  const [connForm, setConnForm] = useState({ displayName: "Servio Import", baseUrl: "demo", apiKey: "", username: "", hotelCode: "" });
  const [savedConnection, setSavedConnection] = useState<Connection | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1 — Preview
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [expandedSample, setExpandedSample] = useState<string | null>(null);

  // Step 2 — Configure
  const [selectedEntities, setSelectedEntities] = useState<string[]>(["guests", "bookings", "rooms"]);
  const [batchConfig, setBatchConfig] = useState({ dateRangeFrom: "", dateRangeTo: "", deduplicationMode: "phone_email", conflictMode: "flag", notes: "" });

  // Step 3 — Import
  const [currentBatch, setCurrentBatch] = useState<Batch | null>(null);
  const [startingImport, setStartingImport] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 4 — Conflicts
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set());

  // Step 6 — Cutover
  const [cutoverChecks, setCutoverChecks] = useState<Record<string, boolean>>({});
  const [cutoverMode, setCutoverMode] = useState(false);
  const [enablingCutover, setEnablingCutover] = useState(false);

  const cutoverItems = [
    { key: "data_verified", label: "Дані перевірені та підтверджені" },
    { key: "conflicts_resolved", label: "Всі конфлікти вирішені" },
    { key: "staff_trained", label: "Персонал навчено роботі в Maison HD" },
    { key: "payments_configured", label: "LiqPay / платежі налаштовані" },
    { key: "channels_connected", label: "OTA-канали підключені (Booking.com та ін.)" },
    { key: "old_system_blocked", label: "Servio заблоковано для нових бронювань" },
    { key: "team_notified", label: "Команда отримала сповіщення про перехід" },
    { key: "backup_done", label: "Резервна копія Servio зроблена" },
  ];

  const allChecked = cutoverItems.every(i => cutoverChecks[i.key]);

  // ── Data fetchers ─────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, batchesRes] = await Promise.all([
        apiFetch(`${API}/migration/stats`),
        apiFetch(`${API}/migration/batches`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (batchesRes.ok) setBatches(await batchesRes.json());
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Poll batch progress while running
  useEffect(() => {
    if (currentBatch?.status === "running") {
      pollRef.current = setInterval(async () => {
        const res = await apiFetch(`${API}/migration/batches/${currentBatch.id}`);
        if (res.ok) {
          const updated = await res.json();
          setCurrentBatch(updated);
          if (updated.status !== "running") {
            if (pollRef.current) clearInterval(pollRef.current);
            fetchConflicts(updated.id);
          }
        }
      }, 1500);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [currentBatch?.id, currentBatch?.status]);

  const fetchConflicts = async (batchId?: number) => {
    setLoadingConflicts(true);
    try {
      const url = batchId ? `${API}/migration/conflicts?batchId=${batchId}` : `${API}/migration/conflicts`;
      const res = await apiFetch(url);
      if (res.ok) setConflicts(await res.json());
    } finally {
      setLoadingConflicts(false);
    }
  };

  // ── Wizard actions ────────────────────────────────────────────
  const handleSaveAndTest = async () => {
    setSaving(true);
    try {
      let conn = savedConnection;
      if (!conn) {
        const res = await apiFetch(`${API}/migration/connections`, {
          method: "POST", body: JSON.stringify({ ...connForm, systemSlug: "servio", systemName: "Servio HMS" }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        conn = await res.json();
        setSavedConnection(conn);
      }

      setTesting(true);
      const testRes = await apiFetch(`${API}/migration/connections/${conn!.id}/test`, { method: "POST" });
      const result = await testRes.json();
      setTestResult(result);
      if (result.success) {
        toast({ title: "Підключення успішне!", description: `Знайдено ${result.totalGuests} гостей, ${result.totalBookings} бронювань` });
      } else {
        toast({ title: "Помилка підключення", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setTesting(false);
    }
  };

  const handlePreview = async () => {
    if (!savedConnection) return;
    setLoadingPreview(true);
    try {
      const res = await apiFetch(`${API}/migration/connections/${savedConnection.id}/preview`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      setPreviewData(await res.json());
      setStep(1);
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleStartImport = async () => {
    if (!savedConnection) return;
    setStartingImport(true);
    try {
      // Create batch
      const batchRes = await apiFetch(`${API}/migration/batches`, {
        method: "POST",
        body: JSON.stringify({
          connectionId: savedConnection.id,
          batchType: "full",
          entityTypes: selectedEntities,
          ...batchConfig,
        }),
      });
      if (!batchRes.ok) throw new Error((await batchRes.json()).error);
      const batch = await batchRes.json();

      // Start it
      const startRes = await apiFetch(`${API}/migration/batches/${batch.id}/start`, { method: "POST" });
      if (!startRes.ok) throw new Error((await startRes.json()).error);

      // Poll for progress
      const pollRes = await apiFetch(`${API}/migration/batches/${batch.id}`);
      const runningBatch = await pollRes.json();
      setCurrentBatch(runningBatch);
      setStep(3);
    } catch (e: any) {
      toast({ title: "Помилка старту", description: e.message, variant: "destructive" });
    } finally {
      setStartingImport(false);
    }
  };

  const handleResolveConflict = async (id: number, resolution: string) => {
    setResolvingIds(prev => new Set([...prev, id]));
    try {
      const res = await apiFetch(`${API}/migration/conflicts/${id}/resolve`, {
        method: "PATCH", body: JSON.stringify({ resolution }),
      });
      if (res.ok) setConflicts(prev => prev.map(c => c.id === id ? { ...c, resolution } : c));
    } finally {
      setResolvingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleBulkResolve = async (resolution: string) => {
    const unresolved = conflicts.filter(c => !c.resolution).map(c => c.id);
    if (!unresolved.length) return;
    const res = await apiFetch(`${API}/migration/conflicts/bulk-resolve`, {
      method: "POST", body: JSON.stringify({ conflictIds: unresolved, resolution }),
    });
    if (res.ok) {
      setConflicts(prev => prev.map(c => !c.resolution ? { ...c, resolution } : c));
      toast({ title: `${unresolved.length} конфліктів вирішено`, description: `Метод: ${resolution}` });
    }
  };

  const handleEnableCutover = async () => {
    if (!savedConnection) return;
    setEnablingCutover(true);
    try {
      await apiFetch(`${API}/migration/connections/${savedConnection.id}`, {
        method: "PATCH", body: JSON.stringify({ isCutoverMode: true }),
      });
      setCutoverMode(true);
      toast({ title: "Режим переходу активовано", description: "Maison HD тепер є основною системою" });
    } finally {
      setEnablingCutover(false);
    }
  };

  // ── Progress helpers ──────────────────────────────────────────
  const getProgress = (batch: Batch) => {
    if (!batch.totalItems) return 0;
    return Math.round((batch.processedItems / batch.totalItems) * 100);
  };

  const getStepColor = (index: number) => {
    if (index < step) return "bg-green-500 text-white";
    if (index === step) return "bg-primary text-white";
    return "bg-gray-200 text-gray-500";
  };

  // ── Overview page ─────────────────────────────────────────────
  if (!showWizard) {
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Міграція з Servio</h1>
              <p className="text-sm text-gray-500 mt-0.5">Перенесіть дані з Servio HMS в Maison HD без втрат і простою</p>
            </div>
            <Button onClick={() => { setShowWizard(true); setStep(0); }} className="gap-2">
              <Play className="w-4 h-4" /> Новий імпорт
            </Button>
          </div>

          {/* Stats cards */}
          {loadingStats ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Підключень", value: stats.connections.length, icon: Plug, color: "text-blue-600" },
                  { label: "Імпортовано", value: stats.totalImported.toLocaleString(), icon: Database, color: "text-green-600" },
                  { label: "Маппінгів", value: stats.totalMappings.toLocaleString(), icon: TrendingUp, color: "text-purple-600" },
                  { label: "Конфліктів", value: stats.unresolvedConflicts, icon: AlertTriangle, color: stats.unresolvedConflicts > 0 ? "text-red-600" : "text-gray-400" },
                ].map(s => (
                  <div key={s.label} className="bg-white border rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                      <span className="text-xs text-gray-500">{s.label}</span>
                    </div>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Connections list */}
              {stats.connections.length > 0 && (
                <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b">
                    <h2 className="font-semibold text-gray-800">Активні підключення</h2>
                  </div>
                  <div className="divide-y">
                    {stats.connections.map(conn => (
                      <div key={conn.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                            <ServerCrash className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{conn.displayName || conn.systemName}</p>
                            <p className="text-xs text-gray-400">{conn.hotelCode || "Немає коду"} · {conn.lastTestAt ? new Date(conn.lastTestAt).toLocaleDateString("uk-UA") : "Не перевірялось"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {conn.isCutoverMode && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200">Основна система</Badge>
                          )}
                          <Badge className={`border text-xs ${STATUS_COLORS[conn.status] || ""}`}>
                            {conn.status === "connected" ? "Підключено" : conn.status === "error" ? "Помилка" : "Очікування"}
                          </Badge>
                          <Button variant="outline" size="sm" onClick={() => { setSavedConnection(conn); setShowWizard(true); setStep(1); }}>
                            Продовжити
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent batches */}
              {batches.length > 0 && (
                <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b">
                    <h2 className="font-semibold text-gray-800">Останні імпорти</h2>
                  </div>
                  <div className="divide-y">
                    {batches.slice(0, 5).map(b => (
                      <div key={b.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            Batch #{b.id} · {b.batchType === "full" ? "Повний" : "Вибірковий"}
                          </p>
                          <p className="text-xs text-gray-400">{new Date(b.createdAt).toLocaleString("uk-UA")}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs text-gray-500">
                            <p>✅ {b.successItems} · ⚠️ {b.conflictItems} · ❌ {b.failedItems}</p>
                          </div>
                          <Badge className={`border text-xs ${STATUS_COLORS[b.status] || ""}`}>
                            {b.status === "completed" ? "Завершено" : b.status === "running" ? "Виконується" : b.status === "failed" ? "Помилка" : b.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {stats.connections.length === 0 && batches.length === 0 && (
                <div className="bg-white border-2 border-dashed rounded-xl p-12 text-center">
                  <ServerCrash className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-600 mb-1">Жодного підключення</h3>
                  <p className="text-sm text-gray-400 mb-4">Підключіться до Servio щоб розпочати міграцію даних</p>
                  <Button onClick={() => { setShowWizard(true); setStep(0); }} className="gap-2">
                    <Plug className="w-4 h-4" /> Підключити Servio
                  </Button>
                </div>
              )}
            </>
          ) : null}

          {/* Info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: "🔒", title: "Без ризику", desc: "Старий Servio залишається активним до підтвердження переходу" },
              { icon: "🔄", title: "Дедуплікація", desc: "Гості знаходяться за телефоном/email та не дублюються" },
              { icon: "⚡", title: "Швидко", desc: "2000+ гостей і 5000+ бронювань менш ніж за 5 хвилин" },
            ].map(c => (
              <div key={c.title} className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-2xl mb-2">{c.icon}</p>
                <p className="font-semibold text-sm text-gray-800">{c.title}</p>
                <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── WIZARD ────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header + back */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setShowWizard(false)} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Назад
          </Button>
          <div className="h-5 w-px bg-gray-200" />
          <h1 className="text-lg font-semibold text-gray-800">Майстер міграції Servio → Maison HD</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${i < step ? "bg-green-100 text-green-700 cursor-pointer hover:bg-green-200" : ""}
                  ${i === step ? "bg-primary text-white" : ""}
                  ${i > step ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""}`}
              >
                {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className={`w-3 h-3 flex-shrink-0 ${i < step ? "text-green-400" : "text-gray-300"}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 0: Connect ──────────────────────────────────── */}
        {step === 0 && (
          <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Підключення до Servio</h2>
              <p className="text-sm text-gray-500">Вкажіть параметри вашої інсталяції Servio HMS. Для тестування використайте режим "demo".</p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2 text-sm text-blue-700">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Залиште URL як "demo" для тестового режиму з реалістичними даними українського готелю</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Назва підключення</Label>
                <Input value={connForm.displayName} onChange={e => setConnForm(p => ({ ...p, displayName: e.target.value }))} placeholder="Servio основний" />
              </div>
              <div className="space-y-1.5">
                <Label>Код готелю (Hotel Code)</Label>
                <Input value={connForm.hotelCode} onChange={e => setConnForm(p => ({ ...p, hotelCode: e.target.value }))} placeholder="HOTEL001" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>URL Servio API <span className="text-gray-400 font-normal">(або "demo")</span></Label>
                <Input value={connForm.baseUrl} onChange={e => setConnForm(p => ({ ...p, baseUrl: e.target.value }))} placeholder="https://servio.yourhotel.com/api" />
              </div>
              <div className="space-y-1.5">
                <Label>API ключ <span className="text-gray-400 font-normal">(якщо є)</span></Label>
                <Input type="password" value={connForm.apiKey} onChange={e => setConnForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="••••••••" />
              </div>
              <div className="space-y-1.5">
                <Label>Логін <span className="text-gray-400 font-normal">(якщо є)</span></Label>
                <Input value={connForm.username} onChange={e => setConnForm(p => ({ ...p, username: e.target.value }))} placeholder="admin" />
              </div>
            </div>

            {testResult && (
              <div className={`rounded-lg p-4 border ${testResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                  <span className={`font-semibold ${testResult.success ? "text-green-700" : "text-red-700"}`}>
                    {testResult.success ? "Підключення успішне" : "Помилка підключення"}
                  </span>
                  {testResult.latencyMs && <span className="text-xs text-gray-400 ml-auto">{testResult.latencyMs}ms</span>}
                </div>
                {testResult.success ? (
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {[
                      { label: "Назва готелю", val: testResult.hotelName },
                      { label: "Версія Servio", val: testResult.servioVersion },
                      { label: "Гостей", val: testResult.totalGuests?.toLocaleString() },
                      { label: "Бронювань", val: testResult.totalBookings?.toLocaleString() },
                      { label: "Номерів", val: testResult.totalRooms?.toLocaleString() },
                    ].map(f => (
                      <div key={f.label} className="bg-white rounded p-2">
                        <p className="text-xs text-gray-500">{f.label}</p>
                        <p className="font-semibold text-sm">{f.val}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-red-600">{testResult.error}</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleSaveAndTest} disabled={saving || testing} className="gap-2">
                {(saving || testing) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                {saving ? "Зберігаємо..." : testing ? "Перевіряємо..." : "Зберегти та перевірити"}
              </Button>
              {testResult?.success && (
                <Button onClick={handlePreview} disabled={loadingPreview} variant="outline" className="gap-2 ml-auto">
                  {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Перегляд даних
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 1: Preview ──────────────────────────────────── */}
        {step === 1 && previewData && (
          <div className="space-y-5">
            <div className="bg-white border rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Дані в Servio</h2>
              <p className="text-sm text-gray-500 mb-4">Готель: <strong>{previewData.hotel.name}</strong> · {previewData.hotel.rooms} номерів</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Гостей", val: previewData.counts.guests, icon: "👤", sub: "профілів" },
                  { label: "Бронювань", val: previewData.counts.bookings, icon: "📅", sub: `${previewData.counts.activeBookings} активних` },
                  { label: "Майбутніх", val: previewData.counts.futureBookings, icon: "🗓️", sub: "підтверджені" },
                  { label: "Номерів", val: previewData.counts.rooms, icon: "🏠", sub: "юнітів" },
                  { label: "Тарифів", val: previewData.counts.ratePlans, icon: "💰", sub: "прайс-листів" },
                  { label: "Контрагентів", val: previewData.counts.companies, icon: "🏢", sub: "компаній" },
                  { label: "Послуг", val: previewData.counts.services, icon: "✨", sub: "записів" },
                  { label: "Оплат", val: previewData.counts.payments, icon: "💳", sub: "транзакцій" },
                ].map(c => (
                  <div key={c.label} className="bg-gray-50 border rounded-lg p-3">
                    <p className="text-lg">{c.icon}</p>
                    <p className="text-xl font-bold text-gray-900">{c.val?.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className="text-xs text-gray-400">{c.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample data tables */}
            {[
              { key: "guests", label: "Приклад гостей", cols: ["ПІБ", "Телефон", "Email", "Заїздів", "Категорія"], rows: previewData.samples.guests?.map((g: any) => [`${g.lastName} ${g.firstName}`, g.phone, g.email, g.totalStays, g.category]) },
              { key: "bookings", label: "Приклад бронювань", cols: ["ID", "Гість", "Номер", "Заїзд", "Виїзд", "Статус", "Сума"], rows: previewData.samples.bookings?.map((b: any) => [b.confirmationNumber, b.guestName, b.roomNumber, b.checkIn, b.checkOut, b.status, `${b.totalAmount?.toLocaleString()} ₴`]) },
              { key: "rooms", label: "Приклад номерів", cols: ["Номер", "Тип", "Поверх", "Місць", "Тариф", "Статус"], rows: previewData.samples.rooms?.map((r: any) => [r.number, r.type, r.floor, r.capacity, `${r.baseRate?.toLocaleString()} ₴`, r.status]) },
            ].map(table => (
              <div key={table.key} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <button
                  className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedSample(expandedSample === table.key ? null : table.key)}
                >
                  <span className="font-medium text-sm text-gray-700">{table.label}</span>
                  {expandedSample === table.key ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {expandedSample === table.key && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-y">
                        <tr>{table.cols.map(c => <th key={c} className="px-3 py-2 text-left text-gray-500 font-medium">{c}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y">
                        {table.rows?.map((row: any[], ri: number) => (
                          <tr key={ri} className="hover:bg-gray-50">
                            {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-gray-700">{cell ?? "—"}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Назад</Button>
              <Button onClick={() => setStep(2)} className="gap-1.5">Налаштувати імпорт <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Configure ────────────────────────────────── */}
        {step === 2 && (
          <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Налаштування імпорту</h2>
              <p className="text-sm text-gray-500">Оберіть що імпортувати та як вирішувати конфлікти</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Які дані імпортувати</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ENTITY_TYPES.map(et => (
                  <label key={et.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${selectedEntities.includes(et.key) ? "border-primary bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <Checkbox
                      checked={selectedEntities.includes(et.key)}
                      onCheckedChange={v => setSelectedEntities(prev => v ? [...prev, et.key] : prev.filter(e => e !== et.key))}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span>{et.icon}</span>
                        <span className="font-medium text-sm">{et.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{et.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Дата від (для часткового імпорту)</Label>
                <Input type="date" value={batchConfig.dateRangeFrom} onChange={e => setBatchConfig(p => ({ ...p, dateRangeFrom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Дата до</Label>
                <Input type="date" value={batchConfig.dateRangeTo} onChange={e => setBatchConfig(p => ({ ...p, dateRangeTo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Метод дедуплікації гостей</Label>
                <Select value={batchConfig.deduplicationMode} onValueChange={v => setBatchConfig(p => ({ ...p, deduplicationMode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone_email">Телефон + Email</SelectItem>
                    <SelectItem value="phone">Тільки телефон</SelectItem>
                    <SelectItem value="name">Ім'я + прізвище</SelectItem>
                    <SelectItem value="none">Без дедуплікації</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Вирішення конфліктів</Label>
                <Select value={batchConfig.conflictMode} onValueChange={v => setBatchConfig(p => ({ ...p, conflictMode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flag">Позначити для ручного вирішення</SelectItem>
                    <SelectItem value="prefer_external">Перезаписати з Servio</SelectItem>
                    <SelectItem value="prefer_internal">Зберегти внутрішні дані</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Нотатка (опційно)</Label>
              <Input value={batchConfig.notes} onChange={e => setBatchConfig(p => ({ ...p, notes: e.target.value }))} placeholder="Перший повний імпорт, червень 2025" />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Назад</Button>
              <Button onClick={handleStartImport} disabled={startingImport || selectedEntities.length === 0} className="gap-1.5">
                {startingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Розпочати імпорт
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Import progress ──────────────────────────── */}
        {step === 3 && (
          <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Імпорт виконується</h2>
              <p className="text-sm text-gray-500">Дані переносяться з Servio в Maison HD</p>
            </div>

            {currentBatch ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Загальний прогрес</span>
                    <span className="font-semibold">{getProgress(currentBatch)}%</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${currentBatch.status === "completed" ? "bg-green-500" : currentBatch.status === "failed" ? "bg-red-500" : "bg-primary"}`}
                      style={{ width: `${getProgress(currentBatch)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Всього", val: currentBatch.totalItems, color: "text-gray-700", bg: "bg-gray-50" },
                    { label: "Успішно", val: currentBatch.successItems, color: "text-green-700", bg: "bg-green-50" },
                    { label: "Конфліктів", val: currentBatch.conflictItems, color: "text-amber-700", bg: "bg-amber-50" },
                    { label: "Помилок", val: currentBatch.failedItems, color: "text-red-700", bg: "bg-red-50" },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-lg p-3 text-center`}>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {currentBatch.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  {currentBatch.status === "completed" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {currentBatch.status === "failed" && <AlertCircle className="w-4 h-4 text-red-500" />}
                  <span className="text-sm font-medium">
                    {currentBatch.status === "running" ? "Виконується..." : currentBatch.status === "completed" ? "Завершено!" : `Статус: ${currentBatch.status}`}
                  </span>
                </div>

                {currentBatch.status === "completed" && (
                  <Button onClick={() => { setStep(4); fetchConflicts(currentBatch.id); }} className="gap-2">
                    Переглянути конфлікти <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Запуск...</span>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Conflicts ────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Конфлікти</h2>
                  <p className="text-sm text-gray-500">{conflicts.filter(c => !c.resolution).length} потребують вирішення</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleBulkResolve("use_internal")}>Залишити мої</Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkResolve("use_external")}>Взяти з Servio</Button>
                </div>
              </div>

              {loadingConflicts ? (
                <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" /> <span>Завантаження...</span>
                </div>
              ) : conflicts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Конфліктів немає — відмінний результат!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {conflicts.map(c => (
                    <div key={c.id} className={`border rounded-lg p-3 ${c.resolution ? "opacity-60" : ""}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">{c.entityType}</Badge>
                          <span className="text-xs text-gray-500">{c.conflictType}</span>
                          <span className="text-xs text-gray-400">#{c.externalId}</span>
                        </div>
                        {c.resolution ? (
                          <Badge className="bg-green-100 text-green-700 text-xs">Вирішено: {c.resolution}</Badge>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2" disabled={resolvingIds.has(c.id)} onClick={() => handleResolveConflict(c.id, "use_internal")}>
                              Залишити мої
                            </Button>
                            <Button size="sm" className="h-6 text-xs px-2" disabled={resolvingIds.has(c.id)} onClick={() => handleResolveConflict(c.id, "use_external")}>
                              Взяти з Servio
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-blue-50 rounded p-2">
                          <p className="font-medium text-blue-700 mb-1">З Servio</p>
                          <pre className="text-gray-600 whitespace-pre-wrap text-xs overflow-hidden max-h-16">{JSON.stringify({ name: c.externalData?.firstName ? `${c.externalData.lastName} ${c.externalData.firstName}` : c.externalData?.guestName, phone: c.externalData?.phone }, null, 2)}</pre>
                        </div>
                        <div className="bg-gray-50 rounded p-2">
                          <p className="font-medium text-gray-700 mb-1">В Maison HD</p>
                          <pre className="text-gray-600 whitespace-pre-wrap text-xs overflow-hidden max-h-16">{JSON.stringify({ name: c.internalData?.firstName ? `${c.internalData.lastName} ${c.internalData.firstName}` : c.internalData?.id, phone: c.internalData?.phone }, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Назад</Button>
              <Button onClick={() => setStep(5)} className="gap-1.5">Підсумок <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Summary ──────────────────────────────────── */}
        {step === 5 && currentBatch && (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Підсумок імпорту</h2>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {[
                  { label: "Імпортовано", val: currentBatch.successItems, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
                  { label: "Конфліктів", val: currentBatch.conflictItems, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Пропущено", val: currentBatch.skippedItems, icon: Info, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Помилок", val: currentBatch.failedItems, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
                  { label: "Всього оброблено", val: currentBatch.processedItems, icon: Database, color: "text-gray-600", bg: "bg-gray-50" },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
                    <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
                    <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="font-medium text-green-800">Дані успішно перенесено в Maison HD</p>
                </div>
                <p className="text-sm text-green-700">Всі гості та бронювання доступні у відповідних розділах. Ви можете перейти до наступного кроку — активації Maison HD як основної системи.</p>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(4)} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Назад</Button>
              <Button onClick={() => setStep(6)} className="gap-2">Перехід (Cutover) <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {/* ── STEP 6: Cutover ──────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Перехід на Maison HD</h2>
                <p className="text-sm text-gray-500">Завершіть чекліст перед активацією Maison HD як основної системи</p>
              </div>

              <div className="space-y-2">
                {cutoverItems.map(item => (
                  <label key={item.key} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${cutoverChecks[item.key] ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <Checkbox
                      checked={!!cutoverChecks[item.key]}
                      onCheckedChange={v => setCutoverChecks(prev => ({ ...prev, [item.key]: !!v }))}
                    />
                    <span className={`text-sm ${cutoverChecks[item.key] ? "text-green-800 line-through opacity-70" : "text-gray-700"}`}>{item.label}</span>
                    {cutoverChecks[item.key] && <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" />}
                  </label>
                ))}
              </div>

              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${(Object.values(cutoverChecks).filter(Boolean).length / cutoverItems.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 text-center">{Object.values(cutoverChecks).filter(Boolean).length} / {cutoverItems.length} виконано</p>

              {cutoverMode ? (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center gap-3">
                  <ToggleRight className="w-6 h-6 text-purple-600" />
                  <div>
                    <p className="font-semibold text-purple-800">Maison HD — основна система</p>
                    <p className="text-sm text-purple-600">Режим переходу активовано. Servio переведено в режим читання.</p>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={handleEnableCutover}
                  disabled={!allChecked || enablingCutover}
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                  size="lg"
                >
                  {enablingCutover ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleRight className="w-5 h-5" />}
                  Активувати Maison HD як основну систему
                </Button>
              )}

              {!allChecked && (
                <p className="text-xs text-center text-gray-400">Позначте всі пункти чекліста щоб активувати перехід</p>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(5)} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Назад</Button>
              {cutoverMode && (
                <Button onClick={() => { setShowWizard(false); fetchStats(); }} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Завершити
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
