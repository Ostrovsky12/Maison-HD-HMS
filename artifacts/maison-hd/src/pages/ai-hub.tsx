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
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("copilot");

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Hub</h1>
            <p className="text-sm text-gray-500">Штучний інтелект для всього готелю</p>
          </div>
          <Badge className="ml-auto bg-violet-100 text-violet-700 border-violet-200">GPT-5</Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-gray-100 rounded-xl">
            <TabsTrigger value="copilot" className="gap-1.5 text-xs"><Bot className="w-3.5 h-3.5" />Copilot</TabsTrigger>
            <TabsTrigger value="chat-reply" className="gap-1.5 text-xs"><MessageSquare className="w-3.5 h-3.5" />AI Чат</TabsTrigger>
            <TabsTrigger value="sales" className="gap-1.5 text-xs"><TrendingUp className="w-3.5 h-3.5" />Sales AI</TabsTrigger>
            <TabsTrigger value="guest-summary" className="gap-1.5 text-xs"><User className="w-3.5 h-3.5" />Гість AI</TabsTrigger>
            <TabsTrigger value="admin-tips" className="gap-1.5 text-xs"><Lightbulb className="w-3.5 h-3.5" />Поради</TabsTrigger>
            <TabsTrigger value="owner-insights" className="gap-1.5 text-xs"><BarChart3 className="w-3.5 h-3.5" />Insights</TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-1.5 text-xs"><BookOpen className="w-3.5 h-3.5" />База знань</TabsTrigger>
            <TabsTrigger value="routing" className="gap-1.5 text-xs"><GitBranch className="w-3.5 h-3.5" />Routing</TabsTrigger>
          </TabsList>

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
