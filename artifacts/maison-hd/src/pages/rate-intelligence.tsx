import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, Minus, Building2, Plus, RefreshCw,
  Edit3, Trash2, ExternalLink, Star, AlertTriangle, Sparkles,
  Bot, Download, CheckCircle2, XCircle, Loader2, Zap, Globe,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/rate-intel";
const tok = () => localStorage.getItem("hms_token") || "";
const hdrs = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

// ── Small UI helpers ─────────────────────────────────────────────────────────
function PositionBadge({ position }: { position: string }) {
  if (position === "above") return (
    <Badge className="bg-red-100 text-red-700 gap-1"><TrendingUp size={11} /> Вище ринку</Badge>
  );
  if (position === "parity") return (
    <Badge className="bg-blue-100 text-blue-700 gap-1"><Minus size={11} /> Паритет</Badge>
  );
  if (position === "below") return (
    <Badge className="bg-green-100 text-green-700 gap-1"><TrendingDown size={11} /> Нижче ринку</Badge>
  );
  return <Badge variant="outline">Немає даних</Badge>;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={10} className={i < stars ? "fill-yellow-400 text-yellow-400" : "text-gray-200"} />
      ))}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "ai") return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
      <Bot size={9} /> AI
    </span>
  );
  if (source === "tariff") return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
      <Zap size={9} /> Тариф
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
      Вручну
    </span>
  );
}

// ── Markdown-like renderer for AI analysis output ────────────────────────────
function AnalysisText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return (
          <h2 key={i} className="text-base font-bold mt-4 mb-1 text-gray-900">{line.slice(3)}</h2>
        );
        if (line.startsWith("### ")) return (
          <h3 key={i} className="text-sm font-semibold mt-3 mb-0.5 text-gray-800">{line.slice(4)}</h3>
        );
        if (line.startsWith("**") && line.endsWith("**")) return (
          <p key={i} className="font-semibold text-gray-800">{line.slice(2, -2)}</p>
        );
        if (line.startsWith("- ") || line.startsWith("* ")) return (
          <div key={i} className="flex gap-2">
            <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
            <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
          </div>
        );
        if (line.startsWith("1. ") || /^\d+\. /.test(line)) return (
          <div key={i} className="flex gap-2">
            <span className="text-indigo-500 font-mono text-xs mt-0.5 shrink-0">{line.match(/^\d+/)?.[0]}.</span>
            <span dangerouslySetInnerHTML={{ __html: line.replace(/^\d+\. /, "").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
          </div>
        );
        if (!line.trim()) return <div key={i} className="h-1" />;
        return (
          <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
        );
      })}
    </div>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────
const EMPTY_COMP = { name: "", websiteUrl: "", otaLink: "", starRating: 3, roomType: "Стандарт", notes: "" };
const EMPTY_RATE = { competitorId: "", checkDate: format(new Date(), "yyyy-MM-dd"), price: "", notes: "" };

// ── Main page ────────────────────────────────────────────────────────────────
export default function RateIntelligencePage() {
  const [tab, setTab] = useState("dashboard");
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [compRates, setCompRates] = useState<any[]>([]);
  const [ourRates, setOurRates] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Date range: today + 13 days
  const from = format(new Date(), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 13), "yyyy-MM-dd");

  // Competitor modal
  const [compModal, setCompModal] = useState(false);
  const [editComp, setEditComp] = useState<any>(null);
  const [compForm, setCompForm] = useState<any>(EMPTY_COMP);
  const [savingComp, setSavingComp] = useState(false);

  // Rate entry modal
  const [rateModal, setRateModal] = useState(false);
  const [rateForm, setRateForm] = useState<any>(EMPTY_RATE);
  const [savingRate, setSavingRate] = useState(false);

  // AI: fetching prices per competitor
  const [fetchingPrices, setFetchingPrices] = useState<Record<number, boolean>>({});

  // AI: suggest competitors
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestModal, setSuggestModal] = useState(false);
  const [savingSuggestion, setSavingSuggestion] = useState<Record<number, boolean>>({});

  // AI: analysis
  const [analysisText, setAnalysisText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const analysisRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [cRes, crRes, orRes, dRes] = await Promise.all([
        fetch(`${API}/competitors`, { headers: hdrs() }),
        fetch(`${API}/competitor-rates?from=${from}&to=${to}`, { headers: hdrs() }),
        fetch(`${API}/our-rates-auto?from=${from}&to=${to}`, { headers: hdrs() }),
        fetch(`${API}/dashboard?from=${from}&to=${to}`, { headers: hdrs() }),
      ]);
      const [c, cr, or_, d] = await Promise.all([cRes.json(), crRes.json(), orRes.json(), dRes.json()]);
      setCompetitors(Array.isArray(c) ? c : []);
      setCompRates(Array.isArray(cr) ? cr : []);
      setOurRates(Array.isArray(or_) ? or_ : []);
      setDashboard(d);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Save competitor ────────────────────────────────────────────────────────
  async function handleSaveComp() {
    if (!compForm.name) return;
    setSavingComp(true);
    try {
      const url = editComp ? `${API}/competitors/${editComp.id}` : `${API}/competitors`;
      const method = editComp ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: hdrs(), body: JSON.stringify(compForm) });
      if (!res.ok) throw new Error();
      toast({ title: editComp ? "Конкурента оновлено" : "Конкурента додано" });
      setCompModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingComp(false);
  }

  async function handleDeleteComp(id: number) {
    if (!confirm("Видалити конкурента?")) return;
    try {
      await fetch(`${API}/competitors/${id}`, { method: "DELETE", headers: hdrs() });
      toast({ title: "Конкурента видалено" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  // ── Save manual rate ───────────────────────────────────────────────────────
  async function handleSaveRate() {
    if (!rateForm.competitorId || !rateForm.price) return;
    setSavingRate(true);
    try {
      const res = await fetch(`${API}/competitor-rates`, {
        method: "POST", headers: hdrs(), body: JSON.stringify(rateForm),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Тариф збережено" });
      setRateModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingRate(false);
  }

  // ── AI: Fetch prices for one competitor ───────────────────────────────────
  async function handleAiFetchPrices(comp: any) {
    setFetchingPrices(p => ({ ...p, [comp.id]: true }));
    toast({ title: `🤖 AI завантажує ціни для "${comp.name}"...`, description: "Це може зайняти 15-30 секунд" });
    try {
      const res = await fetch(`${API}/competitors/${comp.id}/fetch-prices`, {
        method: "POST", headers: hdrs(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      toast({
        title: `✅ Ціни завантажено для "${comp.name}"`,
        description: `${data.saved} дат • ${data.websiteFetched ? "Зі сайту" : "AI-оцінка"}`,
      });
      load();
    } catch (e: any) {
      toast({ title: `Помилка для "${comp.name}"`, description: e.message, variant: "destructive" });
    }
    setFetchingPrices(p => ({ ...p, [comp.id]: false }));
  }

  // ── AI: Fetch prices for ALL competitors ──────────────────────────────────
  async function handleAiFetchAll() {
    if (!competitors.length) return;
    toast({ title: "🤖 AI завантажує ціни для всіх конкурентів...", description: `${competitors.length} об'єктів` });
    for (const comp of competitors) {
      await handleAiFetchPrices(comp);
    }
    toast({ title: "✅ Готово! Ціни всіх конкурентів оновлено" });
  }

  // ── AI: Suggest competitors ────────────────────────────────────────────────
  async function handleSuggestCompetitors() {
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const res = await fetch(`${API}/suggest-competitors`, {
        method: "POST", headers: hdrs(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка");
      setSuggestions(Array.isArray(data) ? data : []);
      setSuggestModal(true);
    } catch (e: any) {
      toast({ title: "Помилка AI", description: e.message, variant: "destructive" });
    }
    setSuggestLoading(false);
  }

  // ── Add suggested competitor ───────────────────────────────────────────────
  async function handleAddSuggestion(s: any, idx: number) {
    setSavingSuggestion(p => ({ ...p, [idx]: true }));
    try {
      const res = await fetch(`${API}/competitors`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({
          name: s.name,
          websiteUrl: s.websiteUrl,
          starRating: s.starRating || 3,
          roomType: s.roomType || "Стандарт",
          notes: s.notes || "",
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `"${s.name}" додано!` });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingSuggestion(p => ({ ...p, [idx]: false }));
  }

  // ── AI: Analysis with SSE streaming ───────────────────────────────────────
  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisText("");
    setTab("analysis");

    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST", headers: { Authorization: `Bearer ${tok()}` },
      });

      if (!res.ok || !res.body) {
        const err = await res.text();
        setAnalysisText(`Помилка: ${err}`);
        setAnalyzing(false);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "token") {
              setAnalysisText(t => t + evt.content);
              setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
            }
            if (evt.type === "error") {
              setAnalysisText(t => t + "\n\n⚠️ " + evt.message);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      setAnalysisText(prev => prev + `\n\nПомилка підключення: ${e.message}`);
    }

    setAnalyzing(false);
  }

  // ── Rate comparison grid ───────────────────────────────────────────────────
  const dates = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(), i), "yyyy-MM-dd"));
  const ourRateByDate = Object.fromEntries(ourRates.map(r => [r.snapDate, r]));
  const compRateByCompDate: Record<string, Record<string, number>> = {};
  compRates.forEach(cr => {
    const cid = String(cr.competitorId);
    if (!compRateByCompDate[cid]) compRateByCompDate[cid] = {};
    compRateByCompDate[cid][cr.checkDate] = parseFloat(cr.price);
  });

  // Check if any competitor is still fetching
  const anyFetching = Object.values(fetchingPrices).some(Boolean);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="text-indigo-500" size={22} />
              Rate Intelligence
            </h1>
            <p className="text-muted-foreground text-sm">AI-моніторинг ринку, автоматичний аналіз і рекомендації</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} /> Оновити
            </Button>
            <Button variant="outline" size="sm" disabled={suggestLoading} onClick={handleSuggestCompetitors}>
              {suggestLoading
                ? <Loader2 size={14} className="mr-1 animate-spin" />
                : <Bot size={14} className="mr-1" />}
              AI підказати конкурентів
            </Button>
            <Button variant="outline" size="sm" disabled={anyFetching || !competitors.length} onClick={handleAiFetchAll}>
              {anyFetching
                ? <Loader2 size={14} className="mr-1 animate-spin" />
                : <Download size={14} className="mr-1" />}
              Оновити всі ціни AI
            </Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={analyzing} onClick={handleAnalyze}>
              {analyzing
                ? <Loader2 size={14} className="mr-1 animate-spin" />
                : <Sparkles size={14} className="mr-1" />}
              AI Аналіз
            </Button>
            <Button size="sm" onClick={() => { setEditComp(null); setCompForm(EMPTY_COMP); setCompModal(true); }}>
              <Building2 size={14} className="mr-1" /> Додати конкурента
            </Button>
          </div>
        </div>

        {/* ── KPI cards ──────────────────────────────────────────────────── */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-2 border-blue-100 bg-blue-50/30">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Наш середній тариф</p>
                <p className="text-2xl font-bold text-blue-700">
                  {dashboard.avgOurPrice ? dashboard.avgOurPrice.toLocaleString("uk-UA") + " ₴" : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">з тарифної сітки</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Середній по ринку</p>
                <p className="text-2xl font-bold">
                  {dashboard.avgCompPrice ? dashboard.avgCompPrice.toLocaleString("uk-UA") + " ₴" : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {dashboard.minCompPrice && dashboard.maxCompPrice
                    ? `${dashboard.minCompPrice.toLocaleString("uk-UA")} – ${dashboard.maxCompPrice.toLocaleString("uk-UA")} ₴`
                    : "Немає даних"}
                </p>
              </CardContent>
            </Card>
            <Card className={dashboard.priceGap > 0 ? "border-red-200 bg-red-50/30" : dashboard.priceGap < 0 ? "border-green-200 bg-green-50/30" : ""}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Різниця з ринком</p>
                <p className={`text-2xl font-bold ${dashboard.priceGap > 0 ? "text-red-500" : dashboard.priceGap < 0 ? "text-green-600" : "text-gray-500"}`}>
                  {dashboard.priceGap !== undefined
                    ? `${dashboard.priceGap > 0 ? "+" : ""}${dashboard.priceGap.toLocaleString("uk-UA")} ₴`
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {dashboard.priceGap > 0 ? "Ви вищі за ринок" : dashboard.priceGap < 0 ? "Є потенціал підвищення" : "Паритет"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Позиція</p>
                <PositionBadge position={dashboard.position} />
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboard.competitorCount} конкур. · {dashboard.totalDataPoints} точок даних
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Порівняння тарифів</TabsTrigger>
            <TabsTrigger value="competitors">Конкуренти ({competitors.length})</TabsTrigger>
            <TabsTrigger value="history">Журнал</TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-1">
              <Sparkles size={12} /> AI Аналіз
            </TabsTrigger>
          </TabsList>

          {/* ── Rate comparison grid ─────────────────────────────────────── */}
          <TabsContent value="dashboard" className="mt-4">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">
                <Loader2 className="animate-spin mr-2" size={18} /> Завантаження...
              </div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Готель</TableHead>
                      {dates.map(d => (
                        <TableHead key={d} className="text-center min-w-[100px]">
                          <div className="text-[11px] text-muted-foreground">
                            {format(new Date(d + "T00:00:00"), "EEE", { locale: uk })}
                          </div>
                          <div className="font-bold">
                            {format(new Date(d + "T00:00:00"), "d MMM", { locale: uk })}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Our rates row */}
                    <TableRow className="bg-blue-50/50">
                      <TableCell>
                        <div className="font-bold text-blue-700">🏨 Наш готель</div>
                        <div className="text-xs text-muted-foreground">Базова ставка · авто</div>
                      </TableCell>
                      {dates.map(d => {
                        const r = ourRateByDate[d];
                        return (
                          <TableCell key={d} className="text-center">
                            {r ? (
                              <div>
                                <div className="font-bold text-blue-700">
                                  {r.ourPrice.toLocaleString("uk-UA")}
                                </div>
                                <SourceBadge source={r.source || "tariff"} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {/* Competitor rows */}
                    {competitors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={dates.length + 1} className="text-center py-10 text-muted-foreground">
                          <Bot size={32} className="mx-auto mb-2 opacity-30" />
                          <p>Додайте конкурентів і натисніть «Оновити всі ціни AI»</p>
                        </TableCell>
                      </TableRow>
                    )}
                    {competitors.map(comp => {
                      const compData = compRateByCompDate[String(comp.id)] || {};
                      const hasAnyData = Object.keys(compData).length > 0;
                      return (
                        <TableRow key={comp.id} className={fetchingPrices[comp.id] ? "opacity-60 animate-pulse" : ""}>
                          <TableCell>
                            <div className="font-medium text-sm">{comp.name}</div>
                            <StarRating stars={comp.starRating || 3} />
                            {comp.websiteUrl && (
                              <a href={comp.websiteUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                                <Globe size={9} /> Сайт
                              </a>
                            )}
                            {!hasAnyData && (
                              <button
                                className="mt-1 text-[10px] text-purple-600 hover:underline flex items-center gap-0.5"
                                onClick={() => handleAiFetchPrices(comp)}
                                disabled={fetchingPrices[comp.id]}
                              >
                                {fetchingPrices[comp.id]
                                  ? <Loader2 size={9} className="animate-spin" />
                                  : <Bot size={9} />
                                }
                                {fetchingPrices[comp.id] ? "Завантаження..." : "Завантажити ціни AI"}
                              </button>
                            )}
                          </TableCell>
                          {dates.map(d => {
                            const price = compData[d];
                            const ourPrice = ourRateByDate[d] ? parseFloat(ourRateByDate[d].ourPrice) : null;
                            const diff = ourPrice && price ? ourPrice - price : null;
                            return (
                              <TableCell key={d} className="text-center">
                                {price ? (
                                  <div>
                                    <div className="font-medium">{price.toLocaleString("uk-UA")}</div>
                                    {diff !== null && (
                                      <div className={`text-xs ${diff > 50 ? "text-red-500" : diff < -50 ? "text-green-600" : "text-muted-foreground"}`}>
                                        {diff > 0 ? "+" : ""}{Math.round(diff).toLocaleString("uk-UA")}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Market position alerts */}
            {dashboard && dashboard.position === "above" && dashboard.avgCompPrice > 0 && (
              <Card className="mt-3 border-orange-200 bg-orange-50">
                <CardContent className="p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-orange-700">
                    Ваш тариф <strong>вищий за ринок</strong> на {Math.abs(dashboard.priceGap).toLocaleString("uk-UA")} ₴.
                    Розгляньте коригування або запустіть <strong>AI Аналіз</strong> для детальних рекомендацій.
                  </p>
                </CardContent>
              </Card>
            )}
            {dashboard && dashboard.position === "below" && dashboard.avgCompPrice > 0 && (
              <Card className="mt-3 border-green-200 bg-green-50">
                <CardContent className="p-3 flex items-start gap-2">
                  <TrendingUp size={16} className="text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-green-700">
                    Ваш тариф <strong>нижчий за ринок</strong> на {Math.abs(dashboard.priceGap).toLocaleString("uk-UA")} ₴.
                    Є можливість підвищити ціну без ризику втрати клієнтів.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Competitors management ──────────────────────────────────── */}
          <TabsContent value="competitors" className="mt-4">
            {competitors.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-base font-medium mb-1">Конкурентів поки немає</p>
                <p className="text-sm mb-4">Додайте вручну або скористайтесь AI-підказкою</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={handleSuggestCompetitors} disabled={suggestLoading}>
                    {suggestLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Bot size={14} className="mr-1" />}
                    AI підказати конкурентів
                  </Button>
                  <Button onClick={() => { setEditComp(null); setCompForm(EMPTY_COMP); setCompModal(true); }}>
                    <Plus size={14} className="mr-1" /> Додати вручну
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {competitors.map(comp => {
                  const ratesCount = compRates.filter(r => r.competitorId === comp.id).length;
                  const aiRatesCount = compRates.filter(r => r.competitorId === comp.id && r.source === "ai").length;
                  return (
                    <Card key={comp.id} className="relative overflow-hidden">
                      {fetchingPrices[comp.id] && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="animate-spin text-purple-600" size={24} />
                            <p className="text-xs text-purple-700 font-medium">AI завантажує ціни...</p>
                          </div>
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm leading-tight">{comp.name}</CardTitle>
                            <StarRating stars={comp.starRating || 3} />
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => handleAiFetchPrices(comp)}
                              title="Завантажити ціни через AI"
                              disabled={fetchingPrices[comp.id]}
                            >
                              <Bot size={13} className="text-purple-600" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                              setEditComp(comp);
                              setCompForm({ name: comp.name, websiteUrl: comp.websiteUrl || "", otaLink: comp.otaLink || "", starRating: comp.starRating || 3, roomType: comp.roomType || "", notes: comp.notes || "" });
                              setCompModal(true);
                            }}>
                              <Edit3 size={13} />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                              onClick={() => handleDeleteComp(comp.id)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 text-sm space-y-1.5">
                        {comp.roomType && <p className="text-muted-foreground text-xs">Тип: {comp.roomType}</p>}
                        {comp.websiteUrl && (
                          <a href={comp.websiteUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-500 hover:underline text-xs">
                            <ExternalLink size={11} /> {comp.websiteUrl.replace(/^https?:\/\//, "").slice(0, 40)}
                          </a>
                        )}
                        {comp.otaLink && (
                          <a href={comp.otaLink} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-indigo-500 hover:underline text-xs">
                            <ExternalLink size={11} /> OTA посилання
                          </a>
                        )}
                        {comp.notes && <p className="text-muted-foreground text-xs">{comp.notes}</p>}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          {ratesCount > 0 ? (
                            <>
                              <span className="text-xs text-muted-foreground">{ratesCount} тарифів</span>
                              {aiRatesCount > 0 && <SourceBadge source="ai" />}
                            </>
                          ) : (
                            <button
                              className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                              onClick={() => handleAiFetchPrices(comp)}
                            >
                              <Bot size={11} /> Завантажити ціни AI
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {/* Add competitor card */}
                <Card className="border-dashed cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => { setEditComp(null); setCompForm(EMPTY_COMP); setCompModal(true); }}>
                  <CardContent className="flex flex-col items-center justify-center h-full min-h-[140px] text-muted-foreground gap-2">
                    <Plus size={24} className="opacity-40" />
                    <p className="text-sm">Додати конкурента</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ── Rate history ─────────────────────────────────────────────── */}
          <TabsContent value="history" className="mt-4">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Конкурент</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead className="text-right">Тариф</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Джерело</TableHead>
                    <TableHead>Нотатки</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compRates.slice(0, 100).map(rate => (
                    <TableRow key={rate.id}>
                      <TableCell className="font-medium">{rate.competitorName}</TableCell>
                      <TableCell>{format(new Date(rate.checkDate + "T00:00:00"), "d MMM yyyy", { locale: uk })}</TableCell>
                      <TableCell className="text-right font-mono">
                        {parseFloat(rate.price).toLocaleString("uk-UA")} ₴
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{rate.roomType || "—"}</TableCell>
                      <TableCell><SourceBadge source={rate.source || "manual"} /></TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">
                        {rate.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {compRates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                        <Bot size={28} className="mx-auto mb-2 opacity-30" />
                        Немає даних. Завантажте ціни через AI.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── AI Analysis tab ────────────────────────────────────────────── */}
          <TabsContent value="analysis" className="mt-4">
            <div className="space-y-4">
              {/* Action bar */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500" /> AI Revenue Analysis
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Аналіз позиціонування та стратегічні рекомендації від AI
                  </p>
                </div>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleAnalyze} disabled={analyzing}>
                  {analyzing
                    ? <><Loader2 size={14} className="mr-1 animate-spin" /> Аналізую...</>
                    : <><Sparkles size={14} className="mr-1" /> Запустити аналіз</>
                  }
                </Button>
              </div>

              {/* Analysis output */}
              {!analysisText && !analyzing && (
                <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-12 text-center">
                  <Bot size={40} className="mx-auto mb-3 text-indigo-300" />
                  <p className="text-indigo-700 font-medium mb-1">Готовий до аналізу</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    AI проаналізує тарифи конкурентів, ваші тарифи та запропонує конкретні дії
                  </p>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleAnalyze}>
                    <Sparkles size={14} className="mr-1" /> Запустити AI Аналіз
                  </Button>
                </div>
              )}

              {(analysisText || analyzing) && (
                <Card className="border-indigo-200">
                  <CardContent className="p-5">
                    {analyzing && !analysisText && (
                      <div className="flex items-center gap-2 text-indigo-600 mb-3">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm">AI аналізує дані...</span>
                      </div>
                    )}
                    <AnalysisText text={analysisText} />
                    {analyzing && (
                      <span className="inline-block w-2 h-4 bg-indigo-500 ml-0.5 animate-pulse" />
                    )}
                    <div ref={analysisRef} />
                  </CardContent>
                </Card>
              )}

              {/* Data summary */}
              {!loading && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-indigo-600">{competitors.length}</p>
                    <p className="text-xs text-muted-foreground">Конкурентів</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-purple-600">{compRates.length}</p>
                    <p className="text-xs text-muted-foreground">Точок даних</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-green-600">
                      {compRates.filter(r => r.source === "ai").length}
                    </p>
                    <p className="text-xs text-muted-foreground">AI-зібраних цін</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Add/Edit competitor modal ─────────────────────────────────────── */}
      <Dialog open={compModal} onOpenChange={setCompModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editComp ? "Редагувати конкурента" : "Додати конкурента"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Назва *</Label>
              <Input placeholder="Назва готелю" value={compForm.name}
                onChange={e => setCompForm({ ...compForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Зірковість</Label>
                <Input type="number" min="1" max="5" value={compForm.starRating}
                  onChange={e => setCompForm({ ...compForm, starRating: parseInt(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Тип номера</Label>
                <Input placeholder="Стандарт" value={compForm.roomType}
                  onChange={e => setCompForm({ ...compForm, roomType: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Вебсайт</Label>
              <Input placeholder="https://..." value={compForm.websiteUrl}
                onChange={e => setCompForm({ ...compForm, websiteUrl: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>OTA посилання (Booking.com, Airbnb, тощо)</Label>
              <Input placeholder="https://www.booking.com/hotel/..." value={compForm.otaLink}
                onChange={e => setCompForm({ ...compForm, otaLink: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Нотатки</Label>
              <Input placeholder="Додаткова інформація..." value={compForm.notes}
                onChange={e => setCompForm({ ...compForm, notes: e.target.value })} />
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-700 flex items-start gap-2">
              <Bot size={14} className="shrink-0 mt-0.5" />
              <span>
                Після додавання AI автоматично завантажить ціни з сайту або зробить ринкову оцінку.
                Чим точніший сайт конкурента — тим кращий результат.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveComp} disabled={savingComp || !compForm.name}>
              {savingComp ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI Suggest Competitors modal ──────────────────────────────────── */}
      <Dialog open={suggestModal} onOpenChange={setSuggestModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot size={18} className="text-purple-600" />
              AI підібрав конкурентів
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            На основі даних вашого об'єкту AI знайшов схожих конкурентів. Оберіть, кого додати:
          </p>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {suggestions.map((s, idx) => {
              const alreadyAdded = competitors.some(c =>
                c.name.toLowerCase() === s.name.toLowerCase()
              );
              return (
                <div key={idx} className="border rounded-lg p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{s.name}</p>
                      <StarRating stars={s.starRating || 3} />
                      {s.confidence === "high" && (
                        <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">Висока впевненість</Badge>
                      )}
                    </div>
                    {s.websiteUrl && (
                      <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5">
                        <ExternalLink size={10} /> {s.websiteUrl.replace(/^https?:\/\//, "").slice(0, 50)}
                      </a>
                    )}
                    {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                  </div>
                  <div className="shrink-0">
                    {alreadyAdded ? (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 size={14} /> Додано
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        disabled={savingSuggestion[idx]}
                        onClick={() => handleAddSuggestion(s, idx)}>
                        {savingSuggestion[idx] ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} className="mr-1" />}
                        Додати
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setSuggestModal(false)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual rate entry modal ───────────────────────────────────────── */}
      <Dialog open={rateModal} onOpenChange={setRateModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Внести тариф конкурента вручну</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Конкурент *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={rateForm.competitorId}
                onChange={e => setRateForm({ ...rateForm, competitorId: e.target.value })}
              >
                <option value="">Оберіть конкурента</option>
                {competitors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Дата</Label>
                <Input type="date" value={rateForm.checkDate}
                  onChange={e => setRateForm({ ...rateForm, checkDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Тариф (₴) *</Label>
                <Input type="number" placeholder="1500" value={rateForm.price}
                  onChange={e => setRateForm({ ...rateForm, price: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Нотатки</Label>
              <Input placeholder="Джерело, канал..." value={rateForm.notes}
                onChange={e => setRateForm({ ...rateForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveRate} disabled={savingRate || !rateForm.competitorId || !rateForm.price}>
              {savingRate ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
