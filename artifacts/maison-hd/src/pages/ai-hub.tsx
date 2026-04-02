import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useListGuests } from "@workspace/api-client-react";
import {
  Brain, MessageSquare, TrendingUp, User, Lightbulb, BarChart3,
  BookOpen, GitBranch, Bot, Send, RefreshCw, Plus, Trash2,
  Edit2, Search, ChevronRight, Sparkles, AlertCircle, CheckCircle2,
  ArrowUp, ArrowDown, Minus, Loader2, X, Save, Tag,
  Zap, Shield, LayoutGrid, Activity, Star, Target, DollarSign,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/ai";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

const PRIORITY_COLOR: Record<string, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-green-600 bg-green-50 border-green-200",
  urgent: "text-red-700 bg-red-100 border-red-300",
};
const PRIORITY_UK: Record<string, string> = {
  high: "Високий", medium: "Середній", low: "Низький", urgent: "Терміново",
};
const DEPT_UK: Record<string, string> = {
  housekeeping: "Прибирання", reception: "Ресепшн", fb: "F&B",
  spa: "SPA", maintenance: "Технічний", management: "Управління", security: "Охорона",
};
const TREND_ICON: Record<string, any> = {
  up: <ArrowUp className="w-3 h-3 text-green-500" />,
  down: <ArrowDown className="w-3 h-3 text-red-500" />,
  stable: <Minus className="w-3 h-3 text-gray-400" />,
};

const CATEGORIES = ["general", "procedures", "faq", "policies", "services", "emergencies", "local-info"];
const CATEGORY_UK: Record<string, string> = {
  general: "Загальне", procedures: "Процедури", faq: "FAQ",
  policies: "Правила", services: "Послуги", emergencies: "Надзвичайні ситуації", "local-info": "Місцева інформація",
};

export default function AiHubPage() {
  const [activeTab, setActiveTab] = useState("shell");

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        {/* ── Preium Header ── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 p-6 text-white shadow-xl">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }}
          />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">AI Hub</h1>
                  <Badge className="bg-amber-400/30 text-amber-200 border-amber-400/50 text-xs">GPT-5 LIVE</Badge>
                </div>
                <p className="text-violet-200 text-sm">Повноцінна AI-оболонка для готельного менеджменту</p>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-3">
              {[
                { icon: Bot, label: "Staff Copilot", tab: "copilot" },
                { icon: TrendingUp, label: "Sales AI", tab: "sales" },
                { icon: BarChart3, label: "Owner Analyst", tab: "owner-insights" },
                { icon: BookOpen, label: "Knowledge", tab: "knowledge" },
              ].map(({ icon: Icon, label, tab }) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-medium transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-gray-100 rounded-xl">
            <TabsTrigger value="shell" className="gap-1.5 text-xs"><LayoutGrid className="w-3.5 h-3.5" />AI Shell</TabsTrigger>
            <TabsTrigger value="copilot" className="gap-1.5 text-xs"><Bot className="w-3.5 h-3.5" />Staff Copilot</TabsTrigger>
            <TabsTrigger value="sales" className="gap-1.5 text-xs"><TrendingUp className="w-3.5 h-3.5" />Sales AI</TabsTrigger>
            <TabsTrigger value="owner-insights" className="gap-1.5 text-xs"><BarChart3 className="w-3.5 h-3.5" />Owner Analyst</TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-1.5 text-xs"><BookOpen className="w-3.5 h-3.5" />Knowledge</TabsTrigger>
            <TabsTrigger value="chat-reply" className="gap-1.5 text-xs"><MessageSquare className="w-3.5 h-3.5" />Chat Reply</TabsTrigger>
            <TabsTrigger value="guest-summary" className="gap-1.5 text-xs"><User className="w-3.5 h-3.5" />Guest AI</TabsTrigger>
            <TabsTrigger value="admin-tips" className="gap-1.5 text-xs"><Lightbulb className="w-3.5 h-3.5" />Поради</TabsTrigger>
            <TabsTrigger value="routing" className="gap-1.5 text-xs"><GitBranch className="w-3.5 h-3.5" />Routing</TabsTrigger>
          </TabsList>

          <TabsContent value="shell"><AiShellTab onNavigate={setActiveTab} /></TabsContent>
          <TabsContent value="copilot"><CopilotTab /></TabsContent>
          <TabsContent value="chat-reply"><ChatReplyTab /></TabsContent>
          <TabsContent value="sales"><SalesTab /></TabsContent>
          <TabsContent value="guest-summary"><GuestSummaryTab /></TabsContent>
          <TabsContent value="admin-tips"><AdminTipsTab /></TabsContent>
          <TabsContent value="owner-insights"><OwnerInsightsTab /></TabsContent>
          <TabsContent value="knowledge"><KnowledgeBaseTab /></TabsContent>
          <TabsContent value="routing"><TaskRoutingTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ─── 0. AI Shell Overview ─────────────────────────────────────────────────────
function AiShellTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [tips, setTips] = useState<any[]>([]);
  const [loadingTips, setLoadingTips] = useState(false);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotReply, setCopilotReply] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    apiFetch("/admin-tips")
      .then(r => r.json())
      .then(d => { if (d.tips) { setTips(d.tips.slice(0, 3)); setStats(d.stats); } })
      .catch(() => {});
  }, []);

  const quickAsk = async () => {
    if (!copilotInput.trim() || copilotLoading) return;
    const q = copilotInput.trim();
    setCopilotInput("");
    setCopilotLoading(true);
    setCopilotReply("");
    let msg = "";
    try {
      const res = await fetch(
        `${BASE.replace("/maison-hd", "")}/api/ai/copilot`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: q, history: [] }),
        }
      );
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) { msg += data.content; setCopilotReply(msg); }
            } catch {}
          }
        }
      }
    } catch {
      setCopilotReply("Помилка з'єднання.");
    } finally {
      setCopilotLoading(false);
    }
  };

  const USE_CASES = [
    {
      tab: "copilot",
      icon: Bot,
      gradient: "from-violet-500 to-purple-600",
      bg: "bg-violet-50",
      border: "border-violet-200",
      badge: "bg-violet-100 text-violet-700",
      title: "AI Staff Copilot",
      subtitle: "Асистент для персоналу",
      desc: "Скрипти для гостей, процедури, відповіді на ситуації — все в одному чаті з AI.",
      features: ["Скрипти для будь-якої ситуації", "Процедури та SOP", "Streaming відповіді (GPT-5)"],
      cta: "Відкрити Copilot",
    },
    {
      tab: "sales",
      icon: TrendingUp,
      gradient: "from-emerald-500 to-teal-600",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      badge: "bg-emerald-100 text-emerald-700",
      title: "AI Sales Assistant",
      subtitle: "Продажі та апсейли",
      desc: "AI аналізує гостей і генерує персоналізовані пропозиції для збільшення виручки.",
      features: ["Персоналізовані пропозиції", "Апсейл та крос-сейл", "Рейтинг пріоритетів"],
      cta: "Генерувати пропозиції",
    },
    {
      tab: "owner-insights",
      icon: BarChart3,
      gradient: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50",
      border: "border-blue-200",
      badge: "bg-blue-100 text-blue-700",
      title: "AI Owner Analyst",
      subtitle: "Аналітика для власника",
      desc: "Стратегічний AI-аналіз: KPI, тренди, можливості, прогнози та рекомендації.",
      features: ["Executive summary", "KPI аналіз та тренди", "Стратегічні рекомендації"],
      cta: "Відкрити аналітику",
    },
    {
      tab: "knowledge",
      icon: BookOpen,
      gradient: "from-amber-500 to-orange-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      badge: "bg-amber-100 text-amber-700",
      title: "AI Knowledge Assistant",
      subtitle: "База знань готелю",
      desc: "Централізована база знань з AI-пошуком: процедури, FAQ, правила, місцеві поради.",
      features: ["AI-пошук по базі", "Категорії та теги", "Редагування та додавання"],
      cta: "Відкрити базу знань",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Live stats strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Заїздів сьогодні", value: stats.todayCheckIns, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Виїздів сьогодні", value: stats.todayCheckOuts, icon: Zap, color: "text-orange-600", bg: "bg-orange-50" },
            { label: "HK завдань", value: stats.pendingHK, icon: Shield, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Відкритих чатів", value: stats.openInbox, icon: MessageSquare, color: "text-violet-600", bg: "bg-violet-50" },
          ].map(s => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${s.bg}`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value ?? "—"}</div>
                    <div className="text-xs text-gray-500">{s.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 4 Core Use Cases */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {USE_CASES.map(uc => (
          <Card key={uc.tab} className={`border ${uc.border} hover:shadow-lg transition-all cursor-pointer group`} onClick={() => onNavigate(uc.tab)}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl bg-gradient-to-br ${uc.gradient} shadow-md group-hover:scale-105 transition-transform`}>
                  <uc.icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-900 text-sm">{uc.title}</h3>
                    <Badge className={`text-xs ${uc.badge}`}>{uc.subtitle}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{uc.desc}</p>
                  <div className="space-y-1 mb-3">
                    {uc.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                  <button
                    className={`text-xs font-semibold flex items-center gap-1 bg-gradient-to-r ${uc.gradient} bg-clip-text text-transparent`}
                  >
                    {uc.cta} <ChevronRight className="w-3.5 h-3.5" style={{ color: "inherit" }} />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick AI Ask */}
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50">
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Швидкий AI-запит
            <span className="text-xs font-normal text-gray-500 ml-1">— задайте будь-яке питання без переходу на Copilot</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={copilotInput}
              onChange={e => setCopilotInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && quickAsk()}
              placeholder="Напр.: Як правильно зустріти VIP гостя?"
              className="flex-1 px-3 py-2 rounded-lg border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <button
              onClick={quickAsk}
              disabled={copilotLoading || !copilotInput.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              {copilotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {copilotLoading ? "..." : "Ask AI"}
            </button>
          </div>
          {copilotReply && (
            <div className="p-4 bg-white rounded-xl border border-violet-100 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              <div className="flex items-center gap-1.5 mb-2">
                <Bot className="w-4 h-4 text-violet-500" />
                <span className="text-xs font-semibold text-violet-600">AI Відповідь</span>
              </div>
              {copilotReply}
            </div>
          )}
          {/* Quick questions */}
          <div className="flex flex-wrap gap-2">
            {[
              "Скрипт для відмови апгрейду",
              "Процедура при скарзі",
              "Як пропонувати SPA?",
              "Правила пізнього виїзду",
            ].map(q => (
              <button
                key={q}
                onClick={() => setCopilotInput(q)}
                className="text-xs px-2.5 py-1 bg-white border border-violet-200 rounded-full text-violet-600 hover:bg-violet-100 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Today's AI Tips */}
      {tips.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              AI-поради на сьогодні
            </p>
            <button onClick={() => onNavigate("admin-tips")} className="text-xs text-violet-600 hover:underline flex items-center gap-1">
              Всі поради <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {tips.map((tip, i) => (
              <div key={i} className={`p-3 rounded-xl border-l-4 bg-white shadow-sm ${tip.priority === "high" || tip.priority === "urgent" ? "border-l-red-400" : tip.priority === "medium" ? "border-l-amber-400" : "border-l-green-400"}`}>
                <Badge className={`text-xs mb-2 ${PRIORITY_COLOR[tip.priority] || "bg-gray-100"}`}>{PRIORITY_UK[tip.priority] || tip.priority}</Badge>
                <p className="text-xs text-gray-700 font-medium">{tip.tip}</p>
                {tip.action && <p className="text-xs text-gray-400 mt-1">{tip.action}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional AI tools */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { tab: "guest-summary", icon: User, title: "AI Guest Profile", desc: "AI-профіль гостя з перевагами та ризиками" },
          { tab: "chat-reply", icon: MessageSquare, title: "Chat Reply AI", desc: "Автоматичні відповіді на повідомлення гостей" },
          { tab: "routing", icon: GitBranch, title: "Task Routing", desc: "AI маршрутизація задач по відділах" },
        ].map(t => (
          <button
            key={t.tab}
            onClick={() => onNavigate(t.tab)}
            className="p-4 bg-white border border-gray-200 rounded-xl hover:border-violet-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 bg-gray-100 group-hover:bg-violet-100 rounded-lg transition-colors">
                <t.icon className="w-3.5 h-3.5 text-gray-500 group-hover:text-violet-600 transition-colors" />
              </div>
              <span className="text-sm font-semibold text-gray-800">{t.title}</span>
            </div>
            <p className="text-xs text-gray-500">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 1. Staff Copilot ────────────────────────────────────────────────────────
function CopilotTab() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "Вітаю! Я ваш AI-copilot. Допоможу з будь-яким питанням по роботі готелю. Запитайте про процедури, скрипти для гостей, вирішення ситуацій або будь-що інше!" },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setHistory(h => [...h, { role: "user", content: userMsg }]);
    setLoading(true);

    const historyToSend = [...history, { role: "user", content: userMsg }];
    let assistantMsg = "";
    setHistory(h => [...h, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(
        `${BASE.replace("/maison-hd", "")}/api/ai/copilot`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMsg, history: historyToSend.slice(-10) }),
        }
      );

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantMsg += data.content;
                setHistory(h => {
                  const newH = [...h];
                  newH[newH.length - 1] = { role: "assistant", content: assistantMsg };
                  return newH;
                });
              }
              if (data.done) break;
            } catch {}
          }
        }
      }
    } catch (err) {
      setHistory(h => {
        const newH = [...h];
        newH[newH.length - 1] = { role: "assistant", content: "Помилка з'єднання. Спробуйте ще раз." };
        return newH;
      });
    } finally {
      setLoading(false);
    }
  };

  const QUICK = [
    "Як правильно зустріти VIP гостя?",
    "Скрипт відповіді на скаргу щодо шуму",
    "Процедура при пожежній тривозі",
    "Як запропонувати upgrade номера?",
    "Що робити якщо гість загубив ключ?",
    "Правила раннього заїзду/пізнього виїзду",
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-3">
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-500" />
              AI Copilot для персоналу
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-violet-600 text-white rounded-tr-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm"
                }`}>
                  {msg.content || (loading && i === history.length - 1 ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> думаю...
                    </span>
                  ) : "")}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </CardContent>
          <div className="p-3 border-t flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Запитайте про будь-яку ситуацію в готелі..."
              className="flex-1"
            />
            <Button onClick={send} disabled={loading || !input.trim()} className="bg-violet-600 hover:bg-violet-700">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Швидкі питання</p>
        {QUICK.map((q, i) => (
          <button
            key={i}
            onClick={() => { setInput(q); }}
            className="w-full text-left text-xs p-2.5 bg-white border border-gray-200 rounded-lg hover:border-violet-300 hover:bg-violet-50 transition-colors"
          >
            <ChevronRight className="w-3 h-3 inline text-violet-400 mr-1" />
            {q}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-gray-400 mt-2"
          onClick={() => setHistory([{ role: "assistant", content: "Вітаю! Я ваш AI-copilot. Чим можу допомогти?" }])}
        >
          <RefreshCw className="w-3 h-3 mr-1" /> Очистити чат
        </Button>
      </div>
    </div>
  );
}

// ─── 2. AI відповіді в чатах ─────────────────────────────────────────────────
function ChatReplyTab() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string>("");

  useEffect(() => {
    const convBase = BASE.replace("/maison-hd", "") + "/api/inbox/conversations";
    fetch(convBase, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setConversations(d.conversations || d || []))
      .catch(() => {});
  }, []);
  const [context, setContext] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    if (!selectedConvId) return;
    setLoading(true);
    setReply("");
    try {
      const res = await apiFetch("/chat-reply", {
        method: "POST",
        body: JSON.stringify({ conversationId: parseInt(selectedConvId), context }),
      });
      const data = await res.json();
      if (data.reply) setReply(data.reply);
      else toast({ title: "Помилка", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Помилка", description: "Не вдалося згенерувати відповідь", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(reply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Налаштування</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Розмова</Label>
            <Select value={selectedConvId} onValueChange={setSelectedConvId}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть розмову..." />
              </SelectTrigger>
              <SelectContent>
                {conversations.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.guestName || "Гість"} — {c.channel} {c.subject ? `(${c.subject})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Додатковий контекст (опційно)</Label>
            <Textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Наприклад: гість запитує про ранній заїзд, номер буде готовий о 13:00..."
              rows={4}
            />
          </div>
          <Button onClick={generate} disabled={!selectedConvId || loading} className="w-full bg-violet-600 hover:bg-violet-700">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Генерую...</> : <><Sparkles className="w-4 h-4 mr-2" />Згенерувати відповідь</>}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="py-3 flex-row items-center justify-between">
          <CardTitle className="text-base">AI Відповідь</CardTitle>
          {reply && (
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <><CheckCircle2 className="w-3 h-3 mr-1" />Скопійовано!</> : "Копіювати"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {reply ? (
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-lg text-sm text-gray-800 whitespace-pre-wrap min-h-[120px]">
              {reply}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Оберіть розмову та натисніть "Згенерувати"</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 3. AI Sales Assistant ────────────────────────────────────────────────────
function SalesTab() {
  const { data: guestsData } = useListGuests() as any;
  const guests = (guestsData as any)?.guests || guestsData || [];
  const [guestId, setGuestId] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const res = await apiFetch("/sales-suggest", {
        method: "POST",
        body: JSON.stringify({ guestId: guestId ? parseInt(guestId) : undefined }),
      });
      const data = await res.json();
      if (data.suggestions) setSuggestions(data.suggestions);
      else toast({ title: "Помилка", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Помилка", description: "Помилка генерації", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Гість (опційно)</Label>
              <Select value={guestId} onValueChange={setGuestId}>
                <SelectTrigger>
                  <SelectValue placeholder="Усі гості / без конкретного" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Загальні рекомендації</SelectItem>
                  {guests.map((g: any) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.firstName} {g.lastName} {g.vipStatus ? "⭐ VIP" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={loading} className="bg-violet-600 hover:bg-violet-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><TrendingUp className="w-4 h-4 mr-2" />Аналіз</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {suggestions.map((s, i) => (
            <Card key={i} className={`border-l-4 ${s.priority === "high" ? "border-l-red-400" : s.priority === "medium" ? "border-l-amber-400" : "border-l-green-400"}`}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{s.title}</div>
                  <Badge className={`text-xs shrink-0 ${PRIORITY_COLOR[s.priority] || "bg-gray-100"}`}>
                    {PRIORITY_UK[s.priority] || s.priority}
                  </Badge>
                </div>
                <p className="text-xs text-gray-600">{s.description}</p>
                {s.estimatedRevenue && (
                  <div className="text-xs font-medium text-green-600 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> {s.estimatedRevenue}
                  </div>
                )}
                <Badge variant="outline" className="text-xs">{s.type}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && suggestions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
          <TrendingUp className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">Натисніть "Аналіз" для генерації sales-рекомендацій</p>
        </div>
      )}
    </div>
  );
}

// ─── 4. AI guest summary ─────────────────────────────────────────────────────
function GuestSummaryTab() {
  const { data: guestsData } = useListGuests() as any;
  const guests = (guestsData as any)?.guests || guestsData || [];
  const [guestId, setGuestId] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [guestInfo, setGuestInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    if (!guestId) return;
    setLoading(true);
    setProfile(null);
    try {
      const res = await apiFetch(`/guest-summary/${guestId}`, { method: "POST", body: "{}" });
      const data = await res.json();
      if (data.profile) { setProfile(data.profile); setGuestInfo(data.guest); }
      else toast({ title: "Помилка", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Помилка", description: "Не вдалося згенерувати профіль", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Оберіть гостя</Label>
            <Select value={guestId} onValueChange={setGuestId}>
              <SelectTrigger><SelectValue placeholder="Гість..." /></SelectTrigger>
              <SelectContent>
                {guests.map((g: any) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.firstName} {g.lastName} {g.vipStatus ? "⭐" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={!guestId || loading} className="bg-violet-600 hover:bg-violet-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><User className="w-4 h-4 mr-2" />Аналіз</>}
          </Button>
        </CardContent>
      </Card>

      {profile && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-3 border-violet-200 bg-violet-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-violet-200 rounded-full flex items-center justify-center font-bold text-violet-700">
                  {guestInfo?.firstName?.[0]}{guestInfo?.lastName?.[0]}
                </div>
                <div>
                  <div className="font-semibold">{guestInfo?.firstName} {guestInfo?.lastName}</div>
                  {guestInfo?.vipStatus && <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">⭐ VIP</Badge>}
                </div>
              </div>
              <p className="text-sm text-gray-700">{profile.summary}</p>
            </CardContent>
          </Card>

          {profile.preferences?.length > 0 && (
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Переваги</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {profile.preferences.map((p: string, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />{p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {profile.risks?.length > 0 && (
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Ризики / Застороги</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {profile.risks.map((r: string, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-1.5"><AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />{r}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {profile.recommendations?.length > 0 && (
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Рекомендації персоналу</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {profile.recommendations.map((r: string, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-1.5"><Sparkles className="w-3 h-3 text-violet-500 mt-0.5 shrink-0" />{r}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {profile.vipNotes && (
            <Card className="lg:col-span-3 border-amber-200 bg-amber-50">
              <CardContent className="pt-3">
                <p className="text-xs font-medium text-amber-700 mb-1">⭐ VIP нотатки</p>
                <p className="text-sm text-amber-800">{profile.vipNotes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 5. AI admin tips ─────────────────────────────────────────────────────────
function AdminTipsTab() {
  const [tips, setTips] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/admin-tips");
      const data = await res.json();
      if (data.tips) { setTips(data.tips); setStats(data.stats); }
      else toast({ title: "Помилка", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Помилка", description: "Не вдалося завантажити", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">AI-аналіз поточної ситуації в готелі та рекомендації на сьогодні</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Оновити
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Заїздів сьогодні", value: stats.todayCheckIns, color: "text-blue-600" },
            { label: "Виїздів сьогодні", value: stats.todayCheckOuts, color: "text-orange-600" },
            { label: "HK завдань", value: stats.pendingHK, color: "text-amber-600" },
            { label: "Відкритих чатів", value: stats.openInbox, color: "text-violet-600" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-3 pb-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value ?? "—"}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {loading ? (
          [...Array(4)].map((_, i) => <Card key={i} className="animate-pulse h-28" />)
        ) : tips.map((tip, i) => (
          <Card key={i} className={`border-l-4 ${tip.priority === "high" || tip.priority === "urgent" ? "border-l-red-400" : tip.priority === "medium" ? "border-l-amber-400" : "border-l-green-400"}`}>
            <CardContent className="pt-3 pb-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${PRIORITY_COLOR[tip.priority] || "bg-gray-100"}`}>{PRIORITY_UK[tip.priority] || tip.priority}</Badge>
                <span className="text-xs text-gray-500">{tip.category}</span>
              </div>
              <p className="text-sm font-medium text-gray-800">{tip.tip}</p>
              {tip.action && <p className="text-xs text-gray-500 flex items-center gap-1"><ChevronRight className="w-3 h-3 text-violet-400" />{tip.action}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── 6. AI owner insights ─────────────────────────────────────────────────────
function OwnerInsightsTab() {
  const [insights, setInsights] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/owner-insights");
      const data = await res.json();
      if (data.insights) { setInsights(data.insights); setMetrics(data.metrics); }
      else toast({ title: "Помилка", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Помилка", description: "Помилка завантаження", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Стратегічний AI-аналіз для власника готелю</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Оновити
        </Button>
      </div>

      {metrics && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{Math.round(metrics.totalRevenue || 0).toLocaleString()} ₴</div>
              <div className="text-xs opacity-80">Виручка за місяць</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-blue-600">{metrics.totalBookings || 0}</div>
              <div className="text-xs text-gray-500">Бронювань за місяць</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{Math.round(metrics.avgBooking || 0).toLocaleString()} ₴</div>
              <div className="text-xs text-gray-500">Середній чек</div>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
      ) : insights && (
        <div className="space-y-4">
          {insights.executiveSummary && (
            <Card className="border-violet-200 bg-violet-50">
              <CardHeader className="py-3"><CardTitle className="text-sm">Executive Summary</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">{insights.executiveSummary}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {insights.kpiAnalysis?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">KPI Аналіз</p>
                {insights.kpiAnalysis.map((k: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        {TREND_ICON[k.trend]}
                        <span className="text-xs font-medium">{k.metric}</span>
                        <span className="ml-auto text-xs text-gray-600">{k.value}</span>
                      </div>
                      <p className="text-xs text-gray-500">{k.insight}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {insights.opportunities?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-green-600 uppercase">Можливості</p>
                {insights.opportunities.map((o: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs p-2.5 bg-green-50 rounded-lg border border-green-100">
                    <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                    {o}
                  </div>
                ))}
              </div>
            )}

            {insights.strategicRecommendations?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-violet-600 uppercase">Стратегічні рекомендації</p>
                {insights.strategicRecommendations.map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs p-2.5 bg-violet-50 rounded-lg border border-violet-100">
                    <Sparkles className="w-3 h-3 text-violet-500 mt-0.5 shrink-0" />
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 7. AI Knowledge Base ─────────────────────────────────────────────────────
function KnowledgeBaseTab() {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searching, setSearching] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editArticle, setEditArticle] = useState<any>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general", tags: "" });
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/knowledge");
      const data = await res.json();
      setArticles(data.articles || []);
    } catch {
      toast({ title: "Помилка", description: "Не вдалося завантажити", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const method = editArticle ? "PUT" : "POST";
      const path = editArticle ? `/knowledge/${editArticle.id}` : "/knowledge";
      await apiFetch(path, { method, body: JSON.stringify(form) });
      toast({ title: "Збережено!" });
      setShowForm(false); setEditArticle(null); setForm({ title: "", content: "", category: "general", tags: "" });
      load();
    } catch {
      toast({ title: "Помилка", variant: "destructive" });
    }
  };

  const del = async (id: number) => {
    if (!confirm("Видалити статтю?")) return;
    await apiFetch(`/knowledge/${id}`, { method: "DELETE" });
    load();
  };

  const search = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchAnswer("");
    try {
      const res = await apiFetch("/knowledge/search", { method: "POST", body: JSON.stringify({ query: searchQuery }) });
      const data = await res.json();
      setSearchAnswer(data.answer || "Відповідь не знайдена");
    } catch {
      setSearchAnswer("Помилка пошуку");
    } finally {
      setSearching(false);
    }
  };

  const startEdit = (a: any) => {
    setEditArticle(a); setForm({ title: a.title, content: a.content, category: a.category, tags: a.tags || "" });
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-2">
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Запитайте AI по базі знань..." />
          <Button onClick={search} disabled={searching} className="bg-violet-600 hover:bg-violet-700">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        <Button onClick={() => { setShowForm(true); setEditArticle(null); setForm({ title: "", content: "", category: "general", tags: "" }); }}>
          <Plus className="w-4 h-4 mr-1" /> Стаття
        </Button>
      </div>

      {searchAnswer && (
        <Card className="border-violet-200 bg-violet-50">
          <CardContent className="pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-violet-500" />
              <span className="text-xs font-medium text-violet-700">AI відповідь</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{searchAnswer}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? [...Array(3)].map((_, i) => <Card key={i} className="animate-pulse h-36" />) :
          articles.map(a => (
            <Card key={a.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="text-xs shrink-0">{CATEGORY_UK[a.category] || a.category}</Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(a)}><Edit2 className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => del(a.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
                <p className="font-medium text-sm">{a.title}</p>
                <p className="text-xs text-gray-500 line-clamp-3">{a.content}</p>
                {a.tags && (
                  <div className="flex flex-wrap gap-1">
                    {a.tags.split(",").map((t: string) => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Tag className="w-2.5 h-2.5" />{t.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>

      {!loading && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-gray-400">
          <BookOpen className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">База знань порожня. Додайте першу статтю!</p>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editArticle ? "Редагувати статтю" : "Нова стаття"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Заголовок</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Назва статті" />
              </div>
              <div className="space-y-1.5">
                <Label>Категорія</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_UK[c] || c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Зміст</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Детальний опис, процедура, відповідь на питання..." rows={6} />
            </div>
            <div className="space-y-1.5">
              <Label>Теги (через кому)</Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="check-in, процедура, ключі..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Скасувати</Button>
            <Button onClick={save} disabled={!form.title || !form.content} className="bg-violet-600 hover:bg-violet-700">
              <Save className="w-4 h-4 mr-1" /> Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 8. AI task routing ───────────────────────────────────────────────────────
function TaskRoutingTab() {
  const [taskDesc, setTaskDesc] = useState("");
  const [urgency, setUrgency] = useState("");
  const [routing, setRouting] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const { toast } = useToast();

  const analyze = async () => {
    if (!taskDesc.trim()) return;
    setLoading(true); setRouting(null);
    try {
      const res = await apiFetch("/route-task", { method: "POST", body: JSON.stringify({ taskDescription: taskDesc, urgency }) });
      const data = await res.json();
      if (data.routing) {
        setRouting(data.routing);
        setHistory(h => [{ task: taskDesc, ...data.routing, ts: new Date().toLocaleTimeString("uk") }, ...h.slice(0, 9)]);
      } else toast({ title: "Помилка", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "Помилка", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const DEPT_ICONS: Record<string, string> = {
    housekeeping: "🧹", reception: "🏨", fb: "🍽️", spa: "💆", maintenance: "🔧", management: "👔", security: "🔒",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Опишіть задачу або ситуацію</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              placeholder="Наприклад: У номері 205 не працює кондиціонер, гість скаржиться на спеку..."
              rows={4}
            />
            <div className="flex gap-2">
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Терміновість" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">🔴 Терміново</SelectItem>
                  <SelectItem value="high">🟠 Висока</SelectItem>
                  <SelectItem value="medium">🟡 Середня</SelectItem>
                  <SelectItem value="low">🟢 Низька</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={analyze} disabled={!taskDesc.trim() || loading} className="flex-1 bg-violet-600 hover:bg-violet-700">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><GitBranch className="w-4 h-4 mr-2" />Маршрутизувати</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {routing && (
          <Card className="border-violet-200">
            <CardHeader className="py-3 bg-violet-50 rounded-t-lg">
              <CardTitle className="text-sm text-violet-700">AI Маршрут завдання</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Відділ</p>
                  <p className="font-semibold text-sm">
                    {DEPT_ICONS[routing.department]} {DEPT_UK[routing.department] || routing.department}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Пріоритет</p>
                  <Badge className={`${PRIORITY_COLOR[routing.priority] || "bg-gray-100"}`}>
                    {PRIORITY_UK[routing.priority] || routing.priority}
                  </Badge>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Призначити</p>
                  <p className="text-sm font-medium">{routing.assignTo}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Дедлайн</p>
                  <p className="text-sm font-medium">{routing.suggestedDeadline}</p>
                </div>
              </div>
              {routing.reasoning && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium mb-1">Обґрунтування AI</p>
                  <p className="text-sm text-blue-800">{routing.reasoning}</p>
                </div>
              )}
              {routing.additionalSteps?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Додаткові кроки:</p>
                  <ul className="space-y-1">
                    {routing.additionalSteps.map((s: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <span className="text-violet-500 font-bold">{i + 1}.</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Остання маршрутизація</p>
        {history.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-8">
            <GitBranch className="w-6 h-6 mx-auto mb-2 opacity-40" />
            Історія порожня
          </div>
        ) : history.map((h, i) => (
          <div key={i} className="p-2.5 bg-white border rounded-lg text-xs space-y-1">
            <p className="font-medium text-gray-700 line-clamp-2">{h.task}</p>
            <div className="flex items-center gap-2">
              <span>{DEPT_ICONS[h.department]} {DEPT_UK[h.department] || h.department}</span>
              <Badge className={`text-xs scale-90 ${PRIORITY_COLOR[h.priority]}`}>{PRIORITY_UK[h.priority] || h.priority}</Badge>
              <span className="ml-auto text-gray-400">{h.ts}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
