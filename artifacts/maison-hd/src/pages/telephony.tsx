import { useState, useEffect } from "react";
import { useTelephony } from "@/contexts/telephony-context";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff,
  Voicemail, Mic, MicOff, Volume2, VolumeX, RefreshCw,
  Plus, Edit3, Trash2, Bot, CheckCircle2, Clock, AlertTriangle,
  MessageSquare, Settings, Layers, Radio, Signal, PhoneForwarded,
  User, Users, Zap, TrendingUp, ArrowDownLeft, ArrowUpRight,
  Smile, Meh, Frown, X, ChevronRight, Save, Sparkles, Copy, ExternalLink,
  Link2, Building2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/telephony";
const tok = () => localStorage.getItem("hms_token") || "";
const h = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(sec: number) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "inbound") return <ArrowDownLeft size={14} className="text-blue-500" />;
  return <ArrowUpRight size={14} className="text-green-500" />;
}

function StatusBadge({ status }: { status: string }) {
  const M: Record<string, { label: string; cls: string }> = {
    completed: { label: "Завершено", cls: "bg-green-100 text-green-700" },
    missed:    { label: "Пропущено", cls: "bg-red-100 text-red-700" },
    voicemail: { label: "Голос.пошта", cls: "bg-purple-100 text-purple-700" },
    active:    { label: "Активний", cls: "bg-blue-100 text-blue-700 animate-pulse" },
  };
  const m = M[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <Badge className={`text-xs ${m.cls}`}>{m.label}</Badge>;
}

function SentimentIcon({ sentiment }: { sentiment?: string | null }) {
  if (sentiment === "positive") return <Smile size={14} className="text-green-500" />;
  if (sentiment === "negative") return <Frown size={14} className="text-red-500" />;
  if (sentiment === "neutral") return <Meh size={14} className="text-gray-400" />;
  return null;
}

function LineStatus({ status }: { status: string }) {
  const M: Record<string, string> = { online: "bg-green-500", busy: "bg-yellow-500", offline: "bg-gray-300" };
  return <span className={`w-2 h-2 rounded-full inline-block ${M[status] || "bg-gray-300"}`} />;
}

const SCENARIO_LABELS: Record<string, string> = {
  greeting: "Вітання", booking: "Бронювання", complaint: "Скарга",
  upsell: "Продаж", confirmation: "Підтвердження", general: "Загальне",
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TelephonyPage() {
  const [tab, setTab] = useState("dashboard");
  const [calls, setCalls] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);
  const [voicemails, setVoicemails] = useState<any[]>([]);
  const [ivrNodes, setIvrNodes] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newLine, setNewLine] = useState({ extension: "", label: "", department: "" });
  const [savingLine, setSavingLine] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<number | null>(null);

  // My user id from token (still needed for display in internal tab)
  const myUserId = (() => {
    try {
      const t = tok(); if (!t) return "anon";
      const payload = JSON.parse(atob(t.split(".")[1]));
      return String(payload.sub || payload.userId || payload.id || "anon");
    } catch { return "anon"; }
  })();

  // Binotel incoming call state
  const [binotelCall, setBinotelCall] = useState<any>(null);
  const [webhookUrls, setWebhookUrls] = useState<any>(null);

  // Global WebRTC from context — active on ANY page of the app
  const { online, callState, callPeer, callTimer, callPeerFn, answerCall, hangup, onBinotelEvent } = useTelephony();

  // Subscribe to Binotel events from global context
  useEffect(() => {
    return onBinotelEvent((evt: any) => {
      if (evt.type === "binotel-incoming") {
        setBinotelCall(evt);
        toast({
          title: `📞 Вхідний дзвінок від ${evt.callerName || evt.callerNumber}`,
          description: evt.isGuest ? "Гість є в базі" : "Новий гість",
        });
      } else if (evt.type === "binotel-completed") {
        setBinotelCall(null);
        load();
      }
    });
  }, [onBinotelEvent]);

  // Load webhook URLs for settings
  useEffect(() => {
    fetch(`${API}/binotel/test`, { headers: h() })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setWebhookUrls(d))
      .catch(() => {});
  }, []);

  // Call log detail
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [summarizing, setSummarizing] = useState(false);

  // Script modals
  const [scriptModal, setScriptModal] = useState(false);
  const [editScript, setEditScript] = useState<any>(null);
  const [scriptForm, setScriptForm] = useState({ title: "", scenario: "general", content: "", tags: "" });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiScenario, setAiScenario] = useState("");

  // Log call modal
  const [logModal, setLogModal] = useState(false);
  const [logForm, setLogForm] = useState({ direction: "inbound", callerNumber: "", callerName: "", status: "completed", durationSec: 0, notes: "" });
  const [savingLog, setSavingLog] = useState(false);

  // Settings form
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // IVR modal
  const [ivrModal, setIvrModal] = useState(false);
  const [ivrForm, setIvrForm] = useState({ parentId: 1, keyPress: "", label: "", action: "transfer", target: "" });
  const [savingIvr, setSavingIvr] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cR, lR, sR, vmR, iR, stR, seR] = await Promise.all([
        fetch(`${API}/calls`, { headers: h() }),
        fetch(`${API}/lines`, { headers: h() }),
        fetch(`${API}/scripts`, { headers: h() }),
        fetch(`${API}/voicemails`, { headers: h() }),
        fetch(`${API}/ivr`, { headers: h() }),
        fetch(`${API}/stats`, { headers: h() }),
        fetch(`${API}/settings`, { headers: h() }),
      ]);
      const [c, l, s, vm, ivr, st, se] = await Promise.all([cR.json(), lR.json(), sR.json(), vmR.json(), iR.json(), stR.json(), seR.json()]);
      setCalls(Array.isArray(c) ? c : []);
      setLines(Array.isArray(l) ? l : []);
      setScripts(Array.isArray(s) ? s : []);
      setVoicemails(Array.isArray(vm) ? vm : []);
      setIvrNodes(Array.isArray(ivr) ? ivr : []);
      setStats(st);
      setSettings(se);
      setSettingsForm(se);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function summarizeCall(callId: number) {
    setSummarizing(true);
    try {
      const res = await fetch(`${API}/calls/${callId}/summarize`, { method: "POST", headers: h() });
      const data = await res.json();
      setSelectedCall(data);
      setCalls(prev => prev.map(c => c.id === callId ? { ...c, aiSummary: data.aiSummary, aiSentiment: data.aiSentiment } : c));
      toast({ title: "AI підсумок створено" });
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSummarizing(false);
  }

  async function handleSaveScript() {
    setSavingLog(true);
    const url = editScript ? `${API}/scripts/${editScript.id}` : `${API}/scripts`;
    const method = editScript ? "PATCH" : "POST";
    try {
      const res = await fetch(url, { method, headers: h(), body: JSON.stringify(scriptForm) });
      if (!res.ok) throw new Error();
      toast({ title: "Скрипт збережено" });
      setScriptModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingLog(false);
  }

  async function handleAiScript() {
    if (!aiScenario) return;
    setAiGenerating(true);
    try {
      const res = await fetch(`${API}/ai/suggest-script`, {
        method: "POST", headers: h(),
        body: JSON.stringify({ scenario: aiScenario, context: "Котеджний комплекс ДОГОДА, с. Дзвінкове, Київська обл." }),
      });
      const data = await res.json();
      setScriptForm(f => ({ ...f, content: data.script || "", scenario: "general" }));
      toast({ title: "AI скрипт згенеровано" });
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setAiGenerating(false);
  }

  async function handleLogCall() {
    setSavingLog(true);
    try {
      const res = await fetch(`${API}/calls`, { method: "POST", headers: h(), body: JSON.stringify(logForm) });
      if (!res.ok) throw new Error();
      toast({ title: "Дзвінок зафіксовано" });
      setLogModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingLog(false);
  }

  async function handleSaveSettings() {
    if (!settingsForm) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`${API}/settings`, { method: "PATCH", headers: h(), body: JSON.stringify(settingsForm) });
      if (!res.ok) throw new Error();
      toast({ title: "Налаштування збережено" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingSettings(false);
  }

  async function handleCreateLine() {
    if (!newLine.extension.trim() || !newLine.label.trim()) {
      toast({ title: "Вкажіть номер і назву лінії", variant: "destructive" }); return;
    }
    setSavingLine(true);
    try {
      const res = await fetch(`${API}/lines`, { method: "POST", headers: h(), body: JSON.stringify(newLine) });
      if (!res.ok) throw new Error();
      toast({ title: `Лінію ${newLine.extension} додано` });
      setNewLine({ extension: "", label: "", department: "" });
      load();
    } catch { toast({ title: "Помилка збереження лінії", variant: "destructive" }); }
    setSavingLine(false);
  }

  async function handleDeleteLine(id: number, ext: string) {
    setDeletingLineId(id);
    try {
      const res = await fetch(`${API}/lines/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ isActive: false }) });
      if (!res.ok) throw new Error();
      setLines(prev => prev.filter(l => l.id !== id));
      toast({ title: `Лінію ${ext} видалено` });
    } catch { toast({ title: "Помилка видалення", variant: "destructive" }); }
    setDeletingLineId(null);
  }

  async function markVoicemailRead(id: number) {
    await fetch(`${API}/voicemails/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ isRead: true }) });
    setVoicemails(prev => prev.map(v => v.id === id ? { ...v, isRead: true } : v));
  }

  async function archiveVoicemail(id: number) {
    await fetch(`${API}/voicemails/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ isArchived: true }) });
    setVoicemails(prev => prev.filter(v => v.id !== id));
    toast({ title: "Повідомлення архівовано" });
  }

  async function handleSaveIvr() {
    setSavingIvr(true);
    try {
      const res = await fetch(`${API}/ivr`, { method: "POST", headers: h(), body: JSON.stringify(ivrForm) });
      if (!res.ok) throw new Error();
      toast({ title: "IVR вузол додано" });
      setIvrModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingIvr(false);
  }

  async function deleteIvrNode(id: number) {
    if (!confirm("Видалити цей пункт IVR?")) return;
    await fetch(`${API}/ivr/${id}`, { method: "DELETE", headers: h() });
    load();
  }

  const unreadVMs = voicemails.filter(v => !v.isRead).length;
  const rootIvr = ivrNodes.find(n => !n.parentId);
  const childIvr = ivrNodes.filter(n => n.parentId === rootIvr?.id);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Phone size={22} className="text-blue-600" /> Telephony AI
            </h1>
            <p className="text-muted-foreground text-sm">Call-центр з AI аналізом, IVR та внутрішнім зв'язком WebRTC</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw size={13} className="mr-1" />Оновити</Button>
            <Button variant="outline" size="sm" onClick={() => { setLogModal(true); setLogForm({ direction: "inbound", callerNumber: "", callerName: "", status: "completed", durationSec: 0, notes: "" }); }}>
              <Plus size={13} className="mr-1" />Фіксувати дзвінок
            </Button>
          </div>
        </div>

        {/* KPI row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="border-blue-200">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Сьогодні</p>
                <p className="text-2xl font-bold text-blue-600">{stats.todayCalls}</p>
                <p className="text-xs text-muted-foreground">дзвінків</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Відповідь</p>
                <p className="text-2xl font-bold text-green-600">{stats.answerRate}%</p>
                <p className="text-xs text-muted-foreground">прийнято</p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Пропущено</p>
                <p className="text-2xl font-bold text-red-500">{stats.missed}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Сер. тривалість</p>
                <p className="text-2xl font-bold">{fmtDuration(stats.avgDurationSec)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Лінії онлайн</p>
                <p className="text-2xl font-bold">{stats.linesOnline}<span className="text-muted-foreground text-sm">/{stats.linesTotal}</span></p>
              </CardContent>
            </Card>
            <Card className={unreadVMs > 0 ? "border-purple-300" : ""}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Голос.пошта</p>
                <p className="text-2xl font-bold text-purple-600">{unreadVMs}</p>
                <p className="text-xs text-muted-foreground">непрочитано</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Incoming call banner */}
        {callState === "ringing" && (
          <Card className="border-green-400 bg-green-50 animate-pulse">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center animate-bounce">
                  <PhoneIncoming size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-green-800">Вхідний дзвінок від колеги</p>
                  <p className="text-sm text-green-600">Внутрішній виклик • {callPeer}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="bg-green-600 hover:bg-green-700" onClick={answerCall}>
                  <Phone size={15} className="mr-1" /> Прийняти
                </Button>
                <Button variant="destructive" onClick={hangup}>
                  <PhoneOff size={15} className="mr-1" /> Відхилити
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active call banner */}
        {callState === "active" && (
          <Card className="border-blue-400 bg-blue-50">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                  <PhoneCall size={16} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-blue-800">Активний дзвінок з {callPeer}</p>
                  <p className="text-sm text-blue-600 font-mono">{fmtDuration(callTimer)}</p>
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={hangup}>
                <PhoneOff size={13} className="mr-1" /> Завершити
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Binotel incoming call banner */}
        {binotelCall && (
          <Card className="border-orange-400 bg-orange-50 animate-pulse">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center animate-bounce">
                  <PhoneIncoming size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-orange-800 flex items-center gap-2">
                    <span>Binotel: Вхідний дзвінок</span>
                    {binotelCall.isGuest && <Badge className="bg-green-100 text-green-700 text-xs">Гість в базі</Badge>}
                    {binotelCall.isNewCaller && <Badge className="bg-blue-100 text-blue-700 text-xs">Новий гість</Badge>}
                  </p>
                  <p className="text-sm text-orange-700 font-mono">{binotelCall.callerName || binotelCall.callerNumber}</p>
                  {binotelCall.internalNumber && <p className="text-xs text-orange-600">→ Лінія {binotelCall.internalNumber}</p>}
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-orange-400" onClick={() => setBinotelCall(null)}>
                <X size={13} />
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard"><Layers size={12} className="mr-1" />Дашборд</TabsTrigger>
            <TabsTrigger value="calls"><Phone size={12} className="mr-1" />Журнал дзвінків</TabsTrigger>
            <TabsTrigger value="scripts"><MessageSquare size={12} className="mr-1" />Скрипти</TabsTrigger>
            <TabsTrigger value="voicemail" className="relative">
              <Voicemail size={12} className="mr-1" />Голосова пошта
              {unreadVMs > 0 && <Badge className="ml-1 bg-purple-600 text-white text-xs px-1 py-0">{unreadVMs}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="ivr"><Radio size={12} className="mr-1" />IVR</TabsTrigger>
            <TabsTrigger value="internal"><Users size={12} className="mr-1" />Внутрішній зв'язок</TabsTrigger>
            <TabsTrigger value="settings"><Settings size={12} className="mr-1" />Налаштування</TabsTrigger>
          </TabsList>

          {/* ── Dashboard ── */}
          <TabsContent value="dashboard" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Operator lines */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Signal size={15} /> Лінії операторів
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {lines.map(line => (
                    <div key={line.id} className="flex items-center justify-between py-1 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <LineStatus status={line.status} />
                        <span className="font-mono text-sm bg-gray-100 px-1.5 rounded">{line.extension}</span>
                        <span className="text-sm">{line.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {line.department && <Badge variant="outline" className="text-xs">{line.department}</Badge>}
                        <Badge className={`text-xs ${line.status === "online" ? "bg-green-100 text-green-700" : line.status === "busy" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                          {line.status === "online" ? "Онлайн" : line.status === "busy" ? "Зайнятий" : "Офлайн"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Sentiment breakdown */}
              {stats && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot size={15} className="text-blue-500" /> AI Аналіз настрою
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1"><Smile size={13} className="text-green-500" />Позитивний</span>
                        <span className="font-bold text-green-600">{stats.sentimentBreakdown.positive}</span>
                      </div>
                      <Progress value={stats.totalCalls ? stats.sentimentBreakdown.positive / stats.totalCalls * 100 : 0} className="h-2" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1"><Meh size={13} className="text-gray-400" />Нейтральний</span>
                        <span className="font-bold">{stats.sentimentBreakdown.neutral}</span>
                      </div>
                      <Progress value={stats.totalCalls ? stats.sentimentBreakdown.neutral / stats.totalCalls * 100 : 0} className="h-2" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1"><Frown size={13} className="text-red-500" />Негативний</span>
                        <span className="font-bold text-red-600">{stats.sentimentBreakdown.negative}</span>
                      </div>
                      <Progress value={stats.totalCalls ? stats.sentimentBreakdown.negative / stats.totalCalls * 100 : 0} className="h-2" />
                    </div>
                    <div className="pt-2 border-t grid grid-cols-3 text-center text-xs text-muted-foreground">
                      <div><p className="font-bold text-base">{stats.totalCalls}</p>всього</div>
                      <div><p className="font-bold text-base">{fmtDuration(stats.avgDurationSec)}</p>сер. тривалість</div>
                      <div><p className="font-bold text-base">{stats.avgWaitSec}с</p>сер. очікування</div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Recent calls */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Останні дзвінки</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {calls.slice(0, 5).map(call => (
                      <TableRow key={call.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCall(call)}>
                        <TableCell className="w-6"><DirectionIcon direction={call.direction} /></TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{call.callerName || call.callerNumber || "Невідомий"}</div>
                          <div className="text-xs text-muted-foreground">{call.callerNumber}</div>
                        </TableCell>
                        <TableCell><StatusBadge status={call.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDuration(call.durationSec || 0)}</TableCell>
                        <TableCell><SentimentIcon sentiment={call.aiSentiment} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(call.startedAt), "d MMM HH:mm", { locale: uk })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Call log ── */}
          <TabsContent value="calls" className="mt-4">
            <div className="flex gap-3">
              {/* Call list */}
              <div className="flex-1 min-w-0 rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6"></TableHead>
                      <TableHead>Абонент</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Тривалість</TableHead>
                      <TableHead>Настрій</TableHead>
                      <TableHead>Час</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calls.map(call => (
                      <TableRow key={call.id} className={`cursor-pointer ${selectedCall?.id === call.id ? "bg-blue-50" : "hover:bg-muted/50"}`}
                        onClick={() => setSelectedCall(call)}>
                        <TableCell><DirectionIcon direction={call.direction} /></TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{call.callerName || "Невідомий"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{call.callerNumber}</div>
                        </TableCell>
                        <TableCell><StatusBadge status={call.status} /></TableCell>
                        <TableCell className="font-mono text-sm">{fmtDuration(call.durationSec || 0)}</TableCell>
                        <TableCell><SentimentIcon sentiment={call.aiSentiment} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(call.startedAt), "d MMM HH:mm", { locale: uk })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {calls.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Немає дзвінків</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Call detail panel */}
              {selectedCall && (
                <div className="w-80 shrink-0 border rounded-md p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold">{selectedCall.callerName || "Невідомий"}</p>
                      <p className="text-sm text-muted-foreground font-mono">{selectedCall.callerNumber}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedCall(null)}><X size={14} /></Button>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Напрямок</span><span>{selectedCall.direction === "inbound" ? "Вхідний" : "Вихідний"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Статус</span><StatusBadge status={selectedCall.status} /></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Тривалість</span><span className="font-mono">{fmtDuration(selectedCall.durationSec || 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Час</span><span>{format(new Date(selectedCall.startedAt), "d MMM HH:mm", { locale: uk })}</span></div>
                  </div>

                  {selectedCall.notes && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Нотатки оператора</p>
                      <p className="text-sm bg-muted/50 rounded p-2">{selectedCall.notes}</p>
                    </div>
                  )}

                  {/* AI Summary */}
                  {selectedCall.aiSummary ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Bot size={12} className="text-blue-500" /> AI Підсумок
                      </p>
                      <div className="bg-blue-50 rounded p-2 text-sm">{selectedCall.aiSummary}</div>
                      {selectedCall.aiSentiment && (
                        <div className="flex items-center gap-1 text-xs">
                          <SentimentIcon sentiment={selectedCall.aiSentiment} />
                          <span className="text-muted-foreground">
                            {selectedCall.aiSentiment === "positive" ? "Позитивний настрій" : selectedCall.aiSentiment === "negative" ? "Негативний настрій" : "Нейтральний настрій"}
                          </span>
                        </div>
                      )}
                      {selectedCall.aiActionItemsParsed?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Дії:</p>
                          <ul className="text-xs space-y-1">
                            {selectedCall.aiActionItemsParsed.map((item: string, i: number) => (
                              <li key={i} className="flex items-start gap-1"><ChevronRight size={10} className="mt-0.5 shrink-0 text-blue-500" />{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button size="sm" className="w-full" onClick={() => summarizeCall(selectedCall.id)} disabled={summarizing}>
                      {summarizing ? <><RefreshCw size={13} className="mr-1 animate-spin" />Аналіз...</> : <><Bot size={13} className="mr-1" />AI Аналіз розмови</>}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Scripts ── */}
          <TabsContent value="scripts" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => { setEditScript(null); setScriptForm({ title: "", scenario: "general", content: "", tags: "" }); setScriptModal(true); }}>
                <Plus size={13} className="mr-1" /> Новий скрипт
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scripts.map(s => (
                <Card key={s.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm">{s.title}</CardTitle>
                        <Badge variant="outline" className="text-xs mt-1">{SCENARIO_LABELS[s.scenario] || s.scenario}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditScript(s);
                          setScriptForm({ title: s.title, scenario: s.scenario, content: s.content, tags: s.tags || "" });
                          setScriptModal(true);
                        }}><Edit3 size={12} /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={async () => {
                          await fetch(`${API}/scripts/${s.id}`, { method: "DELETE", headers: h() });
                          load();
                        }}><Trash2 size={12} /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-muted/30 rounded p-2 max-h-32 overflow-y-auto">{s.content}</pre>
                    <p className="text-xs text-muted-foreground mt-2">Використано: {s.usageCount || 0} разів</p>
                  </CardContent>
                </Card>
              ))}
              {scripts.length === 0 && (
                <Card className="col-span-2">
                  <CardContent className="p-10 text-center text-muted-foreground">Немає скриптів</CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Voicemail ── */}
          <TabsContent value="voicemail" className="mt-4">
            <div className="space-y-3">
              {voicemails.map(vm => (
                <Card key={vm.id} className={vm.isRead ? "opacity-75" : "border-purple-200"}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {!vm.isRead && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                          <p className="font-medium text-sm">{vm.callerName || vm.callerNumber || "Невідомий"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{vm.callerNumber}</p>
                          <p className="text-xs text-muted-foreground">{fmtDuration(vm.durationSec || 0)}</p>
                          <p className="text-xs text-muted-foreground ml-auto">
                            {format(new Date(vm.receivedAt), "d MMM HH:mm", { locale: uk })}
                          </p>
                        </div>
                        {vm.transcript && (
                          <p className="text-sm bg-purple-50 rounded p-2 mb-2">"{vm.transcript}"</p>
                        )}
                        {vm.aiSummary && (
                          <div className="flex items-start gap-1 text-xs text-blue-700 bg-blue-50 rounded p-2">
                            <Bot size={11} className="mt-0.5 shrink-0" />
                            <span>{vm.aiSummary}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!vm.isRead && (
                          <Button size="sm" variant="outline" onClick={() => markVoicemailRead(vm.id)}>
                            <CheckCircle2 size={12} className="mr-1" />Прочитано
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => archiveVoicemail(vm.id)}>
                          <Trash2 size={12} className="mr-1" />Архів
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {voicemails.length === 0 && (
                <Card>
                  <CardContent className="p-10 text-center text-muted-foreground">
                    <Voicemail size={32} className="mx-auto mb-2 opacity-30" />
                    Голосова пошта порожня
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── IVR Builder ── */}
          <TabsContent value="ivr" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => { setIvrForm({ parentId: rootIvr?.id || 1, keyPress: "", label: "", action: "transfer", target: "" }); setIvrModal(true); }}>
                <Plus size={13} className="mr-1" /> Додати пункт IVR
              </Button>
            </div>

            {/* IVR visual tree */}
            <div className="space-y-3">
              {rootIvr && (
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Radio size={18} className="text-blue-600" />
                    <div>
                      <p className="font-bold text-blue-800">{rootIvr.label}</p>
                      {settings?.mainNumber && <p className="text-sm text-blue-600">{settings.mainNumber}</p>}
                    </div>
                  </div>

                  {settings?.greetingMessage && (
                    <div className="mb-4 bg-white/70 rounded p-2 text-sm text-blue-700 italic">
                      🔊 "{settings.greetingMessage}"
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {childIvr.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(node => (
                      <div key={node.id} className="bg-white rounded-lg border p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {node.keyPress || "—"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{node.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{node.action === "transfer" ? `→ ${node.target}` : node.action}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="text-red-400 shrink-0" onClick={() => deleteIvrNode(node.id)}>
                          <X size={12} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {childIvr.length === 0 && !rootIvr && (
                <Card>
                  <CardContent className="p-10 text-center text-muted-foreground">
                    <Radio size={32} className="mx-auto mb-2 opacity-30" />
                    IVR ще не налаштовано
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Internal WebRTC calls ── */}
          <TabsContent value="internal" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users size={15} /> Персонал онлайн
                    <Badge className="bg-green-100 text-green-700">{online.length} онлайн</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lines.map(line => {
                    const isOnline = line.status === "online" || online.includes(String(line.assignedUserId || line.id));
                    return (
                      <div key={line.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                          <div>
                            <p className="text-sm font-medium">{line.label}</p>
                            <p className="text-xs text-muted-foreground font-mono">Ext. {line.extension}</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" disabled={!isOnline || callState !== "idle"}
                          onClick={() => callPeerFn(String(line.assignedUserId || line.extension))}>
                          <Phone size={12} className="mr-1" />
                          {callState === "calling" && callPeer === String(line.assignedUserId || line.extension) ? "Дзвінок..." : "Зателефонувати"}
                        </Button>
                      </div>
                    );
                  })}
                  {lines.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Немає активних ліній</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio size={15} /> WebRTC Внутрішній зв'язок
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800 space-y-1">
                    <p className="font-medium flex items-center gap-1"><Zap size={13} />Як це працює:</p>
                    <p>• Прямий P2P аудіо зв'язок між браузерами</p>
                    <p>• WebRTC через STUN сервер Google</p>
                    <p>• Сигналізація через WebSocket сервер</p>
                    <p>• Нема запису — приватно та безпечно</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${callState === "idle" ? "bg-gray-50" : "bg-blue-50 border border-blue-200"}`}>
                    {callState === "idle" && <p className="text-sm text-muted-foreground">Оберіть колегу і натисніть "Зателефонувати"</p>}
                    {callState === "calling" && <div className="space-y-1"><PhoneCall size={24} className="mx-auto text-blue-500 animate-pulse" /><p className="text-sm">Виклик...</p><Button size="sm" variant="destructive" onClick={hangup}>Скасувати</Button></div>}
                    {callState === "active" && <div className="space-y-1"><div className="text-2xl font-mono font-bold text-blue-600">{fmtDuration(callTimer)}</div><p className="text-sm text-blue-700">Розмова з {callPeer}</p><Button size="sm" variant="destructive" onClick={hangup}><PhoneOff size={13} className="mr-1" />Завершити</Button></div>}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
                    <p>Ваш ID: <span className="font-mono">{myUserId}</span></p>
                    <p>Підключено до WS: <span className={callState !== "idle" || online.length >= 0 ? "text-green-600" : "text-red-500"}>так</span></p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Settings ── */}
          <TabsContent value="settings" className="mt-4">
            {settingsForm && (
              <div className="max-w-xl space-y-5">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Загальні налаштування</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Телефонія увімкнена</Label>
                      <Switch checked={settingsForm.isEnabled} onCheckedChange={v => setSettingsForm({ ...settingsForm, isEnabled: v })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Основний номер</Label>
                      <Input value={settingsForm.mainNumber || ""} onChange={e => setSettingsForm({ ...settingsForm, mainNumber: e.target.value })} placeholder="+380501234567" />
                    </div>
                    <div className="space-y-1">
                      <Label>Привітальне повідомлення IVR</Label>
                      <Textarea rows={3} value={settingsForm.greetingMessage || ""} onChange={e => setSettingsForm({ ...settingsForm, greetingMessage: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Початок роботи</Label>
                        <Input type="time" value={settingsForm.businessHoursStart || "08:00"} onChange={e => setSettingsForm({ ...settingsForm, businessHoursStart: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Кінець роботи</Label>
                        <Input type="time" value={settingsForm.businessHoursEnd || "22:00"} onChange={e => setSettingsForm({ ...settingsForm, businessHoursEnd: e.target.value })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm">AI & Запис</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div><Label>AI підсумки розмов</Label><p className="text-xs text-muted-foreground">Автоматичний аналіз нотаток</p></div>
                      <Switch checked={settingsForm.aiSummaryEnabled} onCheckedChange={v => setSettingsForm({ ...settingsForm, aiSummaryEnabled: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div><Label>IVR меню</Label><p className="text-xs text-muted-foreground">Інтерактивне голосове меню</p></div>
                      <Switch checked={settingsForm.ivrEnabled} onCheckedChange={v => setSettingsForm({ ...settingsForm, ivrEnabled: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div><Label>Запис дзвінків</Label><p className="text-xs text-muted-foreground">Зберігати аудіо записи</p></div>
                      <Switch checked={settingsForm.recordingEnabled} onCheckedChange={v => setSettingsForm({ ...settingsForm, recordingEnabled: v })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Після робочих годин</Label>
                      <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                        value={settingsForm.afterHoursAction} onChange={e => setSettingsForm({ ...settingsForm, afterHoursAction: e.target.value })}>
                        <option value="voicemail">Голосова пошта</option>
                        <option value="reject">Відхилити</option>
                        <option value="queue">Черга</option>
                      </select>
                    </div>
                  </CardContent>
                </Card>
                {/* Binotel Integration */}
                <Card className={settingsForm.binotelEnabled ? "border-orange-300" : ""}>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Building2 size={15} className="text-orange-500" /> Binotel інтеграція
                      </span>
                      <Switch checked={!!settingsForm.binotelEnabled} onCheckedChange={v => setSettingsForm({ ...settingsForm, binotelEnabled: v })} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {settingsForm.binotelEnabled ? (
                      <>
                        <div className="bg-orange-50 rounded-lg p-3 text-sm text-orange-800 space-y-1">
                          <p className="font-medium">Як підключити Binotel:</p>
                          <p>1. Зайдіть в Binotel → API та інтеграції</p>
                          <p>2. Знайдіть ваш Company ID і вставте нижче</p>
                          <p>3. Скопіюйте URL вебхуків і вставте в Binotel кабінет</p>
                          <p>4. Збережіть налаштування</p>
                        </div>

                        <div className="space-y-1">
                          <Label>Company ID (з кабінету Binotel)</Label>
                          <Input
                            value={settingsForm.binotelCompanyId || ""}
                            onChange={e => setSettingsForm({ ...settingsForm, binotelCompanyId: e.target.value })}
                            placeholder="12345"
                          />
                        </div>

                        {webhookUrls && (
                          <div className="space-y-2">
                            <Label className="flex items-center gap-1"><Link2 size={12} />URL вебхуків для Binotel</Label>
                            <div className="space-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">API CALL SETTINGS (вхідний дзвінок):</p>
                                <div className="flex gap-1">
                                  <code className="flex-1 text-xs bg-muted p-2 rounded font-mono truncate block">
                                    {webhookUrls.callSettingsUrl}
                                  </code>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    navigator.clipboard.writeText(webhookUrls.callSettingsUrl);
                                    toast({ title: "URL скопійовано" });
                                  }}><Copy size={12} /></Button>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">API CALL COMPLETED (дзвінок завершено):</p>
                                <div className="flex gap-1">
                                  <code className="flex-1 text-xs bg-muted p-2 rounded font-mono truncate block">
                                    {webhookUrls.callCompletedUrl}
                                  </code>
                                  <Button size="sm" variant="outline" onClick={() => {
                                    navigator.clipboard.writeText(webhookUrls.callCompletedUrl);
                                    toast({ title: "URL скопійовано" });
                                  }}><Copy size={12} /></Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="bg-green-50 rounded p-2 text-xs text-green-700 space-y-1">
                          <p className="font-medium">Що отримаєте після підключення:</p>
                          <p>✓ Автоматичний журнал кожного дзвінка</p>
                          <p>✓ Спливаюче сповіщення з ім'ям гостя під час дзвінка</p>
                          <p>✓ AI підсумок після кожної розмови</p>
                          <p>✓ Пошук гостя в базі по номеру телефону</p>
                          <p>✓ Розпізнавання нових vs існуючих клієнтів</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Увімкніть для налаштування інтеграції з вашою АТС Binotel</p>
                    )}
                  </CardContent>
                </Card>

                {/* Lines management */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users size={15} /> Внутрішні лінії (розширення)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Налаштуйте розширення для WebRTC внутрішнього зв'язку між персоналом</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Existing lines */}
                    {lines.length > 0 && (
                      <div className="space-y-1">
                        {lines.map(line => (
                          <div key={line.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">Ext. {line.extension}</span>
                              <span className="text-sm font-medium">{line.label}</span>
                              {line.department && <Badge variant="outline" className="text-xs">{line.department}</Badge>}
                            </div>
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              disabled={deletingLineId === line.id}
                              onClick={() => handleDeleteLine(line.id, line.extension)}
                            >
                              {deletingLineId === line.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Trash2 size={13} />}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {lines.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">Ліній немає. Додайте першу нижче.</p>
                    )}
                    {/* Add new line form */}
                    <div className="border-t pt-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Додати лінію</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Номер (Ext.)</Label>
                          <Input
                            placeholder="101"
                            value={newLine.extension}
                            onChange={e => setNewLine({ ...newLine, extension: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Назва</Label>
                          <Input
                            placeholder="Ресепшн"
                            value={newLine.label}
                            onChange={e => setNewLine({ ...newLine, label: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Відділ</Label>
                          <Input
                            placeholder="Front Office"
                            value={newLine.department}
                            onChange={e => setNewLine({ ...newLine, department: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button size="sm" onClick={handleCreateLine} disabled={savingLine}>
                        {savingLine ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Plus size={13} className="mr-1" />}
                        Додати лінію
                      </Button>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                      <p className="font-medium">Як користуватись:</p>
                      <p>1. Додайте лінію для кожного співробітника (напр. 101 — Ресепшн, 102 — Адміністратор)</p>
                      <p>2. Перейдіть на вкладку "Внутрішній зв'язок" — там побачите онлайн-статус персоналу</p>
                      <p>3. Натисніть "Зателефонувати" — прямий P2P аудіо-дзвінок через браузер, без АТС</p>
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={handleSaveSettings} disabled={savingSettings}>
                  <Save size={14} className="mr-1" /> {savingSettings ? "Збереження..." : "Зберегти налаштування"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Log call modal ── */}
      <Dialog open={logModal} onOpenChange={setLogModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Зафіксувати дзвінок</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Напрямок</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={logForm.direction} onChange={e => setLogForm({ ...logForm, direction: e.target.value })}>
                  <option value="inbound">Вхідний</option>
                  <option value="outbound">Вихідний</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Статус</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={logForm.status} onChange={e => setLogForm({ ...logForm, status: e.target.value })}>
                  <option value="completed">Завершено</option>
                  <option value="missed">Пропущено</option>
                  <option value="voicemail">Голос.пошта</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Номер телефону</Label>
                <Input placeholder="+380..." value={logForm.callerNumber} onChange={e => setLogForm({ ...logForm, callerNumber: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Ім'я абонента</Label>
                <Input placeholder="Іван Петров" value={logForm.callerName} onChange={e => setLogForm({ ...logForm, callerName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Тривалість (сек)</Label>
              <Input type="number" value={logForm.durationSec} onChange={e => setLogForm({ ...logForm, durationSec: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label>Нотатки оператора</Label>
              <Textarea rows={3} placeholder="Про що був дзвінок..." value={logForm.notes} onChange={e => setLogForm({ ...logForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogModal(false)}>Скасувати</Button>
            <Button onClick={handleLogCall} disabled={savingLog}>{savingLog ? "Зберігаємо..." : "Зафіксувати"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Script modal ── */}
      <Dialog open={scriptModal} onOpenChange={setScriptModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editScript ? "Редагувати скрипт" : "Новий скрипт розмови"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Назва *</Label>
                <Input value={scriptForm.title} onChange={e => setScriptForm({ ...scriptForm, title: e.target.value })} placeholder="Назва скрипту" />
              </div>
              <div className="space-y-1">
                <Label>Сценарій</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={scriptForm.scenario} onChange={e => setScriptForm({ ...scriptForm, scenario: e.target.value })}>
                  {Object.entries(SCENARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* AI generation */}
            <div className="border rounded-lg p-3 bg-blue-50 space-y-2">
              <p className="text-xs font-medium text-blue-700 flex items-center gap-1"><Sparkles size={12} />AI генерація скрипту</p>
              <div className="flex gap-2">
                <Input placeholder="Опишіть ситуацію..." value={aiScenario} onChange={e => setAiScenario(e.target.value)} className="text-sm" />
                <Button size="sm" onClick={handleAiScript} disabled={aiGenerating || !aiScenario}>
                  {aiGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Bot size={13} />}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Текст скрипту *</Label>
              <Textarea rows={8} value={scriptForm.content} onChange={e => setScriptForm({ ...scriptForm, content: e.target.value })} placeholder="Крок 1: ...\nКрок 2: ..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScriptModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveScript} disabled={savingLog || !scriptForm.title || !scriptForm.content}>
              {savingLog ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── IVR modal ── */}
      <Dialog open={ivrModal} onOpenChange={setIvrModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Новий пункт IVR</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Кнопка (0-9, *)</Label>
                <Input maxLength={1} value={ivrForm.keyPress} onChange={e => setIvrForm({ ...ivrForm, keyPress: e.target.value })} placeholder="1" />
              </div>
              <div className="space-y-1">
                <Label>Дія</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={ivrForm.action} onChange={e => setIvrForm({ ...ivrForm, action: e.target.value })}>
                  <option value="transfer">Перевод на лінію</option>
                  <option value="submenu">Підменю</option>
                  <option value="voicemail">Голос.пошта</option>
                  <option value="callback">Зворотній дзвінок</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Назва пункту *</Label>
              <Input value={ivrForm.label} onChange={e => setIvrForm({ ...ivrForm, label: e.target.value })} placeholder="Бронювання" />
            </div>
            {ivrForm.action === "transfer" && (
              <div className="space-y-1">
                <Label>Ціль (ext:100)</Label>
                <Input value={ivrForm.target} onChange={e => setIvrForm({ ...ivrForm, target: e.target.value })} placeholder="ext:101" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIvrModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveIvr} disabled={savingIvr || !ivrForm.label}>{savingIvr ? "Зберігаємо..." : "Додати"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
