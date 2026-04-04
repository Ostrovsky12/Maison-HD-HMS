import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Users, Crown, CheckCircle2, XCircle, Clock, AlertCircle,
  TrendingUp, BarChart3, Shield, Zap, RefreshCw, Loader2,
  Globe, Database, Server, Settings, CreditCard, LifeBuoy, Flag,
  Activity, DollarSign, Package, Star, Eye, Edit3, ToggleLeft, ToggleRight,
  Copy, Check, Search, Plus,
  Cpu, Key, Building,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_BASE = BASE.replace("/maison-hd", "") + "/api";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API_BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const PLAN_META: Record<string, { label: string; color: string; bg: string; border: string; price: number }> = {
  basic:      { label: "Basic",      color: "text-gray-700",   bg: "bg-gray-100",   border: "border-gray-300",   price: 990 },
  pro:        { label: "Pro",        color: "text-violet-700", bg: "bg-violet-100", border: "border-violet-300", price: 2490 },
  enterprise: { label: "Enterprise", color: "text-amber-700",  bg: "bg-amber-100",  border: "border-amber-300",  price: 4990 },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  active:    { label: "Активна",     color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  trial:     { label: "Пробний",     color: "text-amber-700",   bg: "bg-amber-100",   icon: Clock },
  suspended: { label: "Призупинено", color: "text-red-700",     bg: "bg-red-100",     icon: XCircle },
  cancelled: { label: "Скасовано",   color: "text-gray-600",    bg: "bg-gray-100",    icon: XCircle },
};

const MODULE_LIST = [
  { key: "inbox",       label: "Комунікації (Inbox)",   icon: "💬" },
  { key: "ai_hub",      label: "AI Hub (GPT-5)",        icon: "🤖" },
  { key: "hotel_tv",    label: "Hotel TV Kiosk",        icon: "📺" },
  { key: "analytics",   label: "Аналітика та KPI",      icon: "📊" },
  { key: "events",      label: "Заходи та банкети",     icon: "🎭" },
  { key: "spa",         label: "SPA & Wellness",        icon: "🌿" },
  { key: "revenue",     label: "Revenue Management",    icon: "💰" },
  { key: "automation",  label: "Автоматизація",         icon: "⚡" },
  { key: "guest_portal",label: "Гостьовий портал",      icon: "🏨" },
  { key: "hq_dashboard",label: "HQ Multi-property",     icon: "🏢" },
  { key: "fb",          label: "Ресторан & F&B",        icon: "🍽️" },
  { key: "accounting",  label: "Бухгалтерія",           icon: "📋" },
];

const TICKET_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "Відкритий", color: "text-red-700",   bg: "bg-red-100" },
  in_progress: { label: "В роботі",  color: "text-amber-700", bg: "bg-amber-100" },
  resolved:    { label: "Вирішено",  color: "text-green-700", bg: "bg-green-100" },
};

const TICKET_PRIORITY_META: Record<string, { label: string; color: string }> = {
  high:   { label: "Високий",  color: "text-red-600" },
  medium: { label: "Середній", color: "text-amber-600" },
  low:    { label: "Низький",  color: "text-gray-500" },
};

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number) {
  return Math.round(n).toLocaleString("uk-UA") + " ₴";
}
function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("overview");
  const [platform, setPlatform] = useState<any>(null);
  const [loadingPlatform, setLoadingPlatform] = useState(false);

  const loadPlatform = useCallback(async () => {
    setLoadingPlatform(true);
    try {
      const r = await apiFetch("/super-admin/platform");
      if (r.ok) setPlatform(await r.json());
    } finally { setLoadingPlatform(false); }
  }, []);

  useEffect(() => { loadPlatform(); }, [loadPlatform]);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* ── Premium Header ── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 30% 50%, #818cf8 0%, transparent 50%), radial-gradient(circle at 80% 20%, #a78bfa 0%, transparent 40%)" }}
          />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/15 rounded-2xl backdrop-blur-sm">
                <Crown className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">Super Admin Panel</h1>
                  <Badge className="bg-amber-400/25 text-amber-300 border-amber-400/40 text-xs">PLATFORM OWNER</Badge>
                </div>
                <p className="text-slate-300 text-sm">Maison HD SaaS — повне управління платформою</p>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {platform && (
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-amber-300">{fmtMoney(platform.mrr || 0)}</div>
                    <div className="text-xs text-slate-400">MRR</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-emerald-300">{platform.orgs?.total || 0}</div>
                    <div className="text-xs text-slate-400">Тенантів</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-300">{platform.users?.total_users || 0}</div>
                    <div className="text-xs text-slate-400">Юзерів</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={loadPlatform} disabled={loadingPlatform} className="text-white/70 hover:text-white">
                    <RefreshCw className={`w-4 h-4 ${loadingPlatform ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              )}
              <Button size="sm" onClick={() => navigate("/pitch")}
                className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 hover:text-white gap-1.5 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5" /> 🎯 Презентація для клієнтів
              </Button>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs value={tab} onValueChange={setTab} className="space-y-5">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-gray-100 rounded-xl">
            <TabsTrigger value="overview" className="gap-1.5 text-xs"><BarChart3 className="w-3.5 h-3.5" />Огляд</TabsTrigger>
            <TabsTrigger value="tenants"  className="gap-1.5 text-xs"><Building2 className="w-3.5 h-3.5" />Тенанти</TabsTrigger>
            <TabsTrigger value="health"   className="gap-1.5 text-xs"><Activity className="w-3.5 h-3.5" />System Health</TabsTrigger>
            <TabsTrigger value="billing"  className="gap-1.5 text-xs"><CreditCard className="w-3.5 h-3.5" />Billing</TabsTrigger>
            <TabsTrigger value="flags"    className="gap-1.5 text-xs"><Flag className="w-3.5 h-3.5" />Feature Flags</TabsTrigger>
            <TabsTrigger value="support"  className="gap-1.5 text-xs"><LifeBuoy className="w-3.5 h-3.5" />Support</TabsTrigger>
            <TabsTrigger value="config"   className="gap-1.5 text-xs"><Settings className="w-3.5 h-3.5" />SaaS Config</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab platform={platform} loading={loadingPlatform} /></TabsContent>
          <TabsContent value="tenants"><TenantsTab /></TabsContent>
          <TabsContent value="health"><HealthTab /></TabsContent>
          <TabsContent value="billing"><BillingTab /></TabsContent>
          <TabsContent value="flags"><FeatureFlagsTab /></TabsContent>
          <TabsContent value="support"><SupportTab /></TabsContent>
          <TabsContent value="config"><SaasConfigTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ─── TAB: Overview ────────────────────────────────────────────────────────────
function OverviewTab({ platform, loading }: { platform: any; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  );
  if (!platform) return <div className="text-gray-400 text-center py-10">Немає даних платформи</div>;

  const { orgs, users, properties, bookings, mrr, arr, growth } = platform;

  const KPI = [
    { label: "Всього тенантів",  value: orgs?.total ?? 0,          sub: `+${orgs?.new_last_30d ?? 0} за 30 днів`,            icon: Building2,    color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Активних",         value: orgs?.active ?? 0,         sub: `${orgs?.trial ?? 0} тріал · ${orgs?.suspended ?? 0} призупинено`, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Активних юзерів",  value: users?.total_users ?? 0,   sub: `Across ${orgs?.total ?? 0} tenants`,                 icon: Users,        color: "text-blue-600",   bg: "bg-blue-50" },
    { label: "Нерухомостей",     value: properties?.total_properties ?? 0, sub: "Активних об'єктів",                         icon: Building,     color: "text-violet-600", bg: "bg-violet-50" },
    { label: "MRR",              value: fmtMoney(mrr || 0),        sub: `ARR: ${fmtMoney(arr || 0)}`,                         icon: DollarSign,   color: "text-amber-600",  bg: "bg-amber-50" },
    { label: "Бронювань (30д)",  value: bookings?.last_30d ?? 0,   sub: `Виручка: ${fmtMoney(bookings?.revenue_30d || 0)}`,   icon: TrendingUp,   color: "text-rose-600",   bg: "bg-rose-50" },
  ];

  const planDist = [
    { label: "Basic",      count: orgs?.plan_basic ?? 0,      price: 990,  color: "bg-gray-400"    },
    { label: "Pro",        count: orgs?.plan_pro ?? 0,        price: 2490, color: "bg-violet-500"  },
    { label: "Enterprise", count: orgs?.plan_enterprise ?? 0, price: 4990, color: "bg-amber-500"   },
  ];
  const totalOrgs = orgs?.total || 1;

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KPI.map(k => (
          <Card key={k.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
              </div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Plan distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4 text-violet-500" />Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {planDist.map(p => (
              <div key={p.label}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${p.color}`} />
                    <span className="text-sm font-medium">{p.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{p.count} tenant{p.count !== 1 ? "s" : ""}</span>
                    <span className="text-xs font-semibold text-gray-700">{fmtMoney(p.count * p.price)}/міс</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${p.color}`} style={{ width: `${totalOrgs ? (p.count / totalOrgs * 100) : 0}%` }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total MRR</span>
                <span className="font-bold text-amber-600">{fmtMoney(mrr || 0)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500">ARR Projection</span>
                <span className="font-bold text-amber-600">{fmtMoney(arr || 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500" />Subscription Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(STATUS_META).map(([key, meta]) => {
              const count = orgs?.[key] ?? 0;
              const pct = totalOrgs ? Math.round(count / totalOrgs * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <meta.icon className={`w-4 h-4 ${meta.color}`} />
                  <div className="flex-1">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-sm">{meta.label}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${meta.bg}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Tenant Growth */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" />Зростання тенантів</CardTitle>
          </CardHeader>
          <CardContent>
            {growth && growth.length > 0 ? (
              <div className="space-y-2">
                {growth.map((g: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16">{g.month}</span>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(g.new_tenants * 20, 100)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-4 text-right">{g.new_tenants}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">Немає даних за останні 6 місяців</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: "🏨", label: "Всього об'єктів",   value: properties?.total_properties ?? 0 },
          { icon: "📅", label: "Бронювань (всього)", value: bookings?.total_bookings ?? 0 },
          { icon: "💳", label: "Виручка (30д)",      value: fmtMoney(bookings?.revenue_30d || 0) },
          { icon: "👥", label: "Орг з юзерами",      value: users?.orgs_with_users ?? 0 },
        ].map(s => (
          <div key={s.label} className="bg-gradient-to-br from-gray-50 to-white border rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className="text-xl font-bold text-gray-800">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TAB: Tenants ─────────────────────────────────────────────────────────────
function TenantsTab() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/super-admin/tenants");
      if (r.ok) { const d = await r.json(); setTenants(d.tenants || []); }
    } finally { setLoading(false); }
  }, []);

  const provisionDogoda = async () => {
    setProvisioning(true);
    try {
      const r = await apiFetch("/super-admin/provision-dogoda", { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        toast({
          title: "✅ ДОГОДА налаштовано",
          description: `Логін: admin@dogoda.com.ua / Dogoda2026!`,
        });
        load();
      } else {
        toast({ title: "Помилка", description: data.error || "Невідома помилка", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setProvisioning(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  const filtered = tenants.filter(t => {
    const s = search.toLowerCase();
    const matchSearch = !s || t.name?.toLowerCase().includes(s) || t.slug?.toLowerCase().includes(s) || t.owner_email?.toLowerCase().includes(s);
    const matchPlan = filterPlan === "all" || t.plan === filterPlan;
    const matchStatus = filterStatus === "all" || t.subscription_status === filterStatus;
    return matchSearch && matchPlan && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Search & filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук за назвою, slug, email..." className="pl-9" />
        </div>
        <Select value={filterPlan} onValueChange={setFilterPlan}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Всі плани" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі плани</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Всі статуси" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі статуси</SelectItem>
            <SelectItem value="active">Активні</SelectItem>
            <SelectItem value="trial">Тріал</SelectItem>
            <SelectItem value="suspended">Призупинені</SelectItem>
            <SelectItem value="cancelled">Скасовані</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
          <Plus className="w-4 h-4" /> Новий тенант
        </Button>
        <Button onClick={provisionDogoda} disabled={provisioning} variant="outline" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
          {provisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Налаштувати ДОГОДА
        </Button>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="text-xs text-gray-400">{filtered.length} із {tenants.length} тенантів</div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                {["Організація", "План", "Статус", "Юзери", "Об'єкти", "Бронювань 30д", "Виручка 30д", "Зареєстровано", ""].map(h => (
                  <th key={h} className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Нічого не знайдено</td></tr>
              ) : filtered.map(t => {
                const plan = PLAN_META[t.plan] || PLAN_META.basic;
                const status = STATUS_META[t.subscription_status] || STATUS_META.active;
                const StatusIcon = status.icon;
                const isExpiringSoon = t.subscription_status === "trial" && t.trial_ends_at &&
                  new Date(t.trial_ends_at).getTime() - Date.now() < 7 * 86400000;
                return (
                  <tr key={t.id} className="border-b hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                          {t.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 whitespace-nowrap">{t.name}</div>
                          <div className="text-xs text-gray-400">{t.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${plan.bg} ${plan.color} border ${plan.border}`}>{plan.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={`w-3.5 h-3.5 ${status.color}`} />
                        <span className={`text-xs font-medium ${status.color} whitespace-nowrap`}>{status.label}</span>
                        {isExpiringSoon && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                      {t.trial_ends_at && t.subscription_status === "trial" && (
                        <div className="text-xs text-gray-400 mt-0.5">до {fmtDate(t.trial_ends_at)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.user_count}</div>
                      <div className="text-xs text-gray-400">/ {t.max_users} max</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{t.property_count}</td>
                    <td className="px-4 py-3 font-medium">{t.bookings_30d ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-emerald-700 whitespace-nowrap">{fmtMoney(t.revenue_30d || 0)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-600 whitespace-nowrap">{fmtDate(t.created_at)}</div>
                      <div className="text-xs text-gray-400">{daysSince(t.created_at)}д тому</div>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setSelected(t); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <TenantDetailModal tenant={selected} onClose={() => setSelected(null)} onSaved={() => { load(); setSelected(null); }} />}
      {showCreate && <CreateTenantModal onClose={() => setShowCreate(false)} onSaved={() => { load(); setShowCreate(false); }} />}
    </div>
  );
}

// ── Tenant Detail Modal ───────────────────────────────────────────────────────
function TenantDetailModal({ tenant, onClose, onSaved }: { tenant: any; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ plan: tenant.plan, subscriptionStatus: tenant.subscription_status, isActive: tenant.is_active });
  const [note, setNote] = useState("");
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    apiFetch(`/super-admin/tenants/${tenant.id}`)
      .then(r => r.json())
      .then(d => {
        setDetail(d);
        const defaults = MODULE_LIST.reduce((acc, m) => ({ ...acc, [m.key]: true }), {} as Record<string, boolean>);
        setModules(defaults);
      })
      .finally(() => setLoading(false));
  }, [tenant.id]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiFetch(`/super-admin/tenants/${tenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, enabledModules: modules, note }),
      });
      if (r.ok) { toast({ title: "✅ Збережено!" }); onSaved(); }
      else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-700">
              {tenant.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div>{tenant.name}</div>
              <div className="text-sm font-normal text-gray-500">{tenant.slug} · #{tenant.id}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : (
          <div className="space-y-5">
            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Юзерів",   value: detail?.members?.length ?? 0 },
                { label: "Об'єктів", value: detail?.properties?.length ?? 0 },
                { label: "Юнітів",   value: detail?.usage?.unit_count ?? 0 },
                { label: "Гостей",   value: detail?.usage?.total_guests ?? 0 },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-800">{s.value}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Plan & Status */}
              <div className="space-y-3 p-4 border rounded-xl">
                <p className="font-semibold text-sm text-gray-700">Підписка</p>
                <div className="space-y-2">
                  <Label className="text-xs">Тарифний план</Label>
                  <Select value={form.plan} onValueChange={v => setForm(f => ({ ...f, plan: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLAN_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          <span className={v.color}>{v.label}</span>
                          <span className="text-gray-400 ml-2 text-xs">{fmtMoney(v.price)}/міс</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Статус підписки</Label>
                  <Select value={form.subscriptionStatus} onValueChange={v => setForm(f => ({ ...f, subscriptionStatus: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}><span className={v.color}>{v.label}</span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs">Аккаунт активний</Label>
                  <button
                    onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                    className={`flex items-center gap-2 text-sm font-medium ${form.isActive ? "text-emerald-600" : "text-gray-400"}`}
                  >
                    {form.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    {form.isActive ? "Активний" : "Неактивний"}
                  </button>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-1.5 p-4 border rounded-xl">
                <p className="font-semibold text-sm text-gray-700 mb-2">Контакти</p>
                {[
                  { label: "Email",       val: detail?.org?.email || tenant.email },
                  { label: "Phone",       val: detail?.org?.phone || tenant.phone },
                  { label: "Власник",     val: `${tenant.owner_name || "—"} (${tenant.owner_email || "—"})` },
                  { label: "Реєстрація", val: fmtDate(tenant.created_at) },
                  { label: "Тріал до",   val: tenant.trial_ends_at ? fmtDate(tenant.trial_ends_at) : "—" },
                  { label: "Бронювань",  val: `${detail?.usage?.total_bookings ?? 0} (30д: ${detail?.usage?.bookings_30d ?? 0})` },
                ].map(r => (
                  <div key={r.label} className="flex items-start gap-2 text-xs py-0.5">
                    <span className="text-gray-400 w-24 shrink-0">{r.label}:</span>
                    <span className="text-gray-700 font-medium">{r.val || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Members */}
            {detail?.members?.length > 0 && (
              <div className="p-4 border rounded-xl space-y-2">
                <p className="font-semibold text-sm text-gray-700">Члени організації ({detail.members.length})</p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {detail.members.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                          {m.name?.[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{m.name}</div>
                          <div className="text-xs text-gray-400">{m.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{m.role}</Badge>
                        {m.is_active ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Enabled Modules */}
            <div className="p-4 border rounded-xl space-y-3">
              <p className="font-semibold text-sm text-gray-700">Включені модулі</p>
              <div className="grid grid-cols-2 gap-2">
                {MODULE_LIST.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setModules(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${modules[m.key] ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}
                  >
                    <span>{m.icon}</span>
                    <span className="text-xs flex-1">{m.label}</span>
                    {modules[m.key]
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    }
                  </button>
                ))}
              </div>
            </div>

            {/* Admin Note */}
            <div className="p-4 border rounded-xl space-y-2">
              <Label className="text-sm font-semibold">Внутрішня нотатка</Label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Нотатка для внутрішнього використання (видна тільки Super Admin)..."
                className="w-full text-sm p-2 border border-gray-200 rounded-lg resize-none min-h-16 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          <Button onClick={save} disabled={saving || loading} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Зберігаю...</> : "Зберегти зміни"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Tenant Modal ───────────────────────────────────────────────────────
function CreateTenantModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", email: "", ownerName: "", ownerEmail: "", ownerPassword: "", plan: "pro", trialDays: 30 });
  const { toast } = useToast();

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const create = async () => {
    setSaving(true);
    try {
      const r = await apiFetch("/organizations", { method: "POST", body: JSON.stringify(form) });
      const d = await r.json();
      if (r.ok) { setResult(d); setStep(2); }
      else toast({ title: "Помилка", description: d.message || d.error, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const valid = form.name && form.slug && form.ownerEmail && form.ownerName && form.ownerPassword.length >= 8;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Новий тенант" : "✅ Тенант створено!"}</DialogTitle>
        </DialogHeader>
        {step === 1 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Назва організації *</Label>
                <Input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) })); }} placeholder="Dogoda Resort" />
              </div>
              <div className="space-y-1.5">
                <Label>Slug (URL) *</Label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="dogoda-resort" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email організації</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@hotel.com" type="email" />
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Власник організації</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ім'я *</Label>
                  <Input value={form.ownerName} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} placeholder="Дмитро Іваненко" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input value={form.ownerEmail} onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))} placeholder="owner@hotel.com" type="email" />
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                <Label>Пароль * (мін 8 символів)</Label>
                <Input value={form.ownerPassword} onChange={e => setForm(f => ({ ...f, ownerPassword: e.target.value }))} placeholder="Мін 8 символів" type="password" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Тарифний план</Label>
                <Select value={form.plan} onValueChange={v => setForm(f => ({ ...f, plan: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic — ₴990/міс</SelectItem>
                    <SelectItem value="pro">Pro — ₴2490/міс</SelectItem>
                    <SelectItem value="enterprise">Enterprise — ₴4990/міс</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Тріал (днів)</Label>
                <Input type="number" value={form.trialDays} onChange={e => setForm(f => ({ ...f, trialDays: parseInt(e.target.value) || 30 }))} min={0} max={90} />
              </div>
            </div>
          </div>
        ) : result && (
          <div className="space-y-3">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="font-semibold text-emerald-800 mb-2">🎉 {result.organization?.name} — готово!</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Email:</span><span className="font-mono">{result.owner?.email}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Org ID:</span>
                  <button onClick={() => copy(String(result.organization?.id))} className="flex items-center gap-1 font-mono text-indigo-600 hover:underline">
                    #{result.organization?.id} {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">План:</span><span className="font-semibold">{result.organization?.plan}</span></div>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">Тенант активований. Власник може увійти з вказаними credentials.</p>
          </div>
        )}
        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={onClose}>Скасувати</Button>
              <Button onClick={create} disabled={saving || !valid} className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Створюю...</> : "Створити тенанта"}
              </Button>
            </>
          ) : (
            <Button onClick={onSaved} className="w-full bg-indigo-600 hover:bg-indigo-700">Готово</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── TAB: System Health ───────────────────────────────────────────────────────
function HealthTab() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/super-admin/health");
      if (r.ok) setHealth(await r.json());
      else toast({ title: "Health check failed", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const fmtUptime = (s: number) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return `${d}д ${h}г ${m}хв`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          System health · Оновлено: {health ? new Date(health.checkedAt).toLocaleTimeString("uk-UA") : "—"}
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Оновити
        </Button>
      </div>

      {loading && !health ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : health && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "API Server", value: "Online",                        sub: `Uptime: ${fmtUptime(health.uptime)}`,        icon: Server,   color: "text-emerald-600", bg: "bg-emerald-50", ok: true },
              { label: "Database",  value: `${health.dbLatencyMs}ms`,        sub: health.dbStatus,                              icon: Database, color: health.dbLatencyMs < 100 ? "text-emerald-600" : "text-amber-600", bg: "bg-blue-50", ok: health.dbLatencyMs < 200 },
              { label: "RAM",       value: `${health.memoryUsedMB}MB`,       sub: `/ ${health.memoryTotalMB}MB heap`,           icon: Cpu,      color: health.memoryUsedMB < 256 ? "text-emerald-600" : "text-amber-600", bg: "bg-violet-50", ok: health.memoryUsedMB < 256 },
              { label: "Node.js",   value: health.nodeVersion,               sub: "Runtime",                                    icon: Zap,      color: "text-slate-600",   bg: "bg-slate-50",   ok: true },
            ].map(card => (
              <Card key={card.label} className="border-0 shadow-sm">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded-lg ${card.bg}`}><card.icon className={`w-4 h-4 ${card.color}`} /></div>
                    <div className={`w-2 h-2 rounded-full ${card.ok ? "bg-emerald-400" : "bg-amber-400"}`} />
                  </div>
                  <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                  <div className="text-xs text-gray-400">{card.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4 text-blue-500" />Database Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                {Object.entries(health.tableStats || {}).map(([k, v]) => (
                  <div key={k} className="text-center p-3 bg-gray-50 rounded-xl">
                    <div className="text-2xl font-bold text-gray-800">{String(v)}</div>
                    <div className="text-xs text-gray-500 capitalize">{k}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Key className="w-4 h-4 text-amber-500" />Integration Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { key: "openai",   label: "OpenAI (GPT-5)", icon: "🤖" },
                  { key: "liqpay",   label: "LiqPay",         icon: "💳" },
                  { key: "smtp",     label: "SMTP Email",     icon: "📧" },
                  { key: "telegram", label: "Telegram Bot",   icon: "📱" },
                  { key: "stripe",   label: "Stripe",         icon: "💰" },
                ].map(intg => {
                  const enabled = health.integrations?.[intg.key];
                  return (
                    <div key={intg.key} className={`p-3 rounded-xl border text-center ${enabled ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
                      <div className="text-2xl mb-1">{intg.icon}</div>
                      <div className="text-xs font-medium text-gray-700">{intg.label}</div>
                      <div className={`text-xs mt-1 font-semibold ${enabled ? "text-emerald-600" : "text-gray-400"}`}>
                        {enabled ? "✓ Активно" : "✗ Не налаш."}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── TAB: Billing ─────────────────────────────────────────────────────────────
function BillingTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/super-admin/billing").then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  const INV_STATUS: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: "Очікує",    color: "text-amber-700",  bg: "bg-amber-100" },
    paid:    { label: "Оплачено",  color: "text-emerald-700", bg: "bg-emerald-100" },
    overdue: { label: "Прострочено", color: "text-red-700",   bg: "bg-red-100" },
  };

  return (
    <div className="space-y-5">
      {loading ? <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Всього виставлено", value: fmtMoney(data?.summary?.totalInvoiced || 0), icon: "💰", color: "text-indigo-600" },
              { label: "Очікує оплати",     value: data?.summary?.pendingCount ?? 0,            icon: "⏳", color: "text-amber-600" },
              { label: "Оплачено",          value: data?.summary?.paidCount ?? 0,               icon: "✅", color: "text-emerald-600" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  <span className="text-3xl">{s.icon}</span>
                  <div>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-sm text-gray-500">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Останні інвойси</CardTitle>
              <CardDescription className="text-xs">Subscription invoices для всіх тенантів</CardDescription>
            </CardHeader>
            <CardContent>
              {(!data?.invoices || data.invoices.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-24 text-gray-400">
                  <CreditCard className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Поки немає інвойсів</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.invoices.map((inv: any) => {
                    const st = INV_STATUS[inv.status] || INV_STATUS.pending;
                    const plan = PLAN_META[inv.plan] || PLAN_META.basic;
                    return (
                      <div key={inv.id} className="flex items-center gap-4 p-3 border rounded-xl hover:bg-gray-50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-500">{inv.invoice_number}</span>
                            <Badge className={`text-xs ${plan.bg} ${plan.color}`}>{plan.label}</Badge>
                          </div>
                          <div className="text-sm font-medium">{inv.org_name}</div>
                          <div className="text-xs text-gray-400">{fmtDate(inv.created_at)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-800">{fmtMoney(parseFloat(inv.total || 0))}</div>
                          <Badge className={`text-xs ${st.bg} ${st.color}`}>{st.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
            <p className="text-amber-700 font-semibold text-sm">💳 Інтеграція платежів</p>
            <p className="text-amber-600 text-xs mt-1">Налаштуйте LIQPAY_PUBLIC_KEY / STRIPE_SECRET_KEY для активації автоматичного billing</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: Feature Flags ───────────────────────────────────────────────────────
function FeatureFlagsTab() {
  const [flags, setFlags] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/super-admin/feature-flags").then(r => r.json()).then(d => setFlags(d.flags || {})).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Platform Feature Flags</h2>
        <p className="text-xs text-gray-500">Статус включення функцій на рівні платформи та відсоток rollout</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(flags).map(([key, flag]) => (
            <div key={key} className={`p-4 border rounded-xl flex items-start gap-3 ${flag.enabled ? "border-indigo-200 bg-indigo-50/50" : "border-gray-200 bg-gray-50"}`}>
              <div className={`mt-0.5 w-3 h-3 rounded-full shrink-0 ${flag.enabled ? "bg-emerald-400" : "bg-gray-300"}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{key}</span>
                  <Badge className={`text-xs ${flag.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {flag.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{flag.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${flag.rollout === 100 ? "bg-emerald-500" : flag.rollout === 0 ? "bg-gray-300" : "bg-amber-500"}`}
                      style={{ width: `${flag.rollout}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">Rollout: {flag.rollout}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-blue-700 font-semibold text-sm">ℹ️ Feature Flags — Read-only</p>
        <p className="text-blue-600 text-xs mt-1">Наразі feature flags є конфігурацією коду. Редагування через UI — в наступній версії платформи.</p>
      </div>
    </div>
  );
}

// ─── TAB: Support ─────────────────────────────────────────────────────────────
function SupportTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/super-admin/support").then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      {loading ? <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Відкритих",             value: data?.stats?.open ?? 0,              color: "text-red-600" },
              { label: "В роботі",              value: data?.stats?.inProgress ?? 0,        color: "text-amber-600" },
              { label: "Вирішено",              value: data?.stats?.resolved ?? 0,           color: "text-emerald-600" },
              { label: "Середній час відповіді", value: `${data?.stats?.avgResponseHours ?? 0}г`, color: "text-blue-600" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Support Tickets</CardTitle>
              <CardDescription className="text-xs">Запити від тенантів платформи</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.tickets || []).map((t: any) => {
                const st = TICKET_STATUS_META[t.status] || TICKET_STATUS_META.open;
                const pr = TICKET_PRIORITY_META[t.priority] || TICKET_PRIORITY_META.medium;
                return (
                  <div key={t.id} className="flex items-start gap-4 p-3 border rounded-xl hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-400">{t.id}</span>
                        <Badge className={`text-xs ${st.bg} ${st.color}`}>{st.label}</Badge>
                        <span className={`text-xs font-medium ${pr.color}`}>{pr.label}</span>
                      </div>
                      <div className="text-sm font-semibold mt-0.5">{t.subject}</div>
                      <div className="text-xs text-gray-500">{t.orgName} · Призначено: {t.assignedTo}</div>
                    </div>
                    <div className="text-xs text-gray-400 text-right shrink-0">
                      {new Date(t.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
            <p className="text-amber-700 font-semibold text-sm">🎧 Full Support Desk — Coming Soon</p>
            <p className="text-amber-600 text-xs mt-1">Helpdesk з SLA, тікет-системою, інтеграцією Crisp/Intercom в наступному релізі</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: SaaS Config ────────────────────────────────────────────────────────
function SaasConfigTab() {
  const PLANS_CONFIG = [
    { key: "basic",      label: "Basic",      price: 990,  units: 30,   users: 5,    icon: "🔑",
      features: ["До 30 номерів/юнітів", "До 5 співробітників", "Базові модулі", "Email підтримка"] },
    { key: "pro",        label: "Pro",        price: 2490, units: 100,  users: 20,   icon: "⭐",
      features: ["До 100 номерів/юнітів", "До 20 співробітників", "Всі модулі", "AI Hub (GPT-5)", "Пріоритетна підтримка"] },
    { key: "enterprise", label: "Enterprise", price: 4990, units: 9999, users: 9999, icon: "👑",
      features: ["Необмежено номерів", "Необмежено юзерів", "White-label", "API доступ", "Dedicated підтримка"] },
  ];

  const PLATFORM_SETTINGS = [
    { key: "Trial Period",                value: "30 днів" },
    { key: "Max Trial Extensions",        value: "1 раз" },
    { key: "Grace Period (after expire)", value: "7 днів" },
    { key: "Data Retention (cancelled)",  value: "90 днів" },
    { key: "AI Model",                    value: "gpt-4o (latest)" },
    { key: "Payment Providers",           value: "LiqPay + Stripe" },
    { key: "Default Currency",            value: "UAH" },
    { key: "Default Timezone",            value: "Europe/Kiev" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Тарифні плани</h2>
        <p className="text-xs text-gray-500">Конфігурація планів, лімітів та можливостей платформи</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS_CONFIG.map(plan => {
          const meta = PLAN_META[plan.key];
          return (
            <Card key={plan.key} className={`border-2 ${meta.border}`}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{plan.icon}</span>
                  <div>
                    <div className={`font-bold ${meta.color}`}>{plan.label}</div>
                    <div className="text-xs text-gray-400">₴{plan.price.toLocaleString()}/міс</div>
                  </div>
                </div>
                <div className="space-y-0.5 mb-3 border-b pb-3">
                  {[
                    { label: "Юнітів", value: plan.units === 9999 ? "∞" : plan.units },
                    { label: "Юзерів", value: plan.users === 9999 ? "∞" : plan.users },
                    { label: "ARR",    value: fmtMoney(plan.price * 12) },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between text-xs py-1">
                      <span className="text-gray-500">{r.label}:</span>
                      <span className="font-semibold text-gray-700">{r.value}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-gray-500" />Platform Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {PLATFORM_SETTINGS.map(s => (
              <div key={s.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-xs text-gray-500">{s.key}</span>
                <span className="text-xs font-semibold text-gray-800">{s.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
          <p className="text-indigo-700 font-semibold text-sm">🚀 Roadmap</p>
          <ul className="text-indigo-600 text-xs mt-2 space-y-1">
            {[
              "✅ Multi-tenancy з ізоляцією",
              "✅ Subscription billing (LiqPay)",
              "✅ AI Hub (GPT-5)",
              "✅ TV Kiosk Display",
              "🔄 Stripe payment gateway",
              "🔄 White-label для Enterprise",
              "📋 Native mobile app",
              "📋 Channel Manager (Booking.com)",
              "📋 API developer access",
            ].map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-slate-700 font-semibold text-sm">🔒 Security & Compliance</p>
          <ul className="text-slate-600 text-xs mt-2 space-y-1">
            {[
              "✅ JWT Auth з ролями",
              "✅ Organization data isolation",
              "✅ HTTPS / TLS in production",
              "✅ Password hashing (bcrypt)",
              "🔄 2FA / MFA",
              "🔄 Per-org Audit Log",
              "📋 GDPR compliance tools",
              "📋 SOC 2 Type II",
            ].map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
