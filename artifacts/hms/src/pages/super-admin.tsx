import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Building2, Users, Plus, LogIn, MoreHorizontal, CheckCircle2,
  XCircle, Clock, AlertTriangle, Search, RefreshCw, ShieldCheck,
  Cpu, Database, Zap, ChevronRight, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant {
  id: number;
  name: string;
  slug: string;
  plan: string;
  subscription_status: string;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  max_units: number;
  max_users: number;
  created_at: string;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  user_count: number;
  property_count: number;
  bookings_30d: number;
  revenue_30d: number;
  owner_name: string | null;
  owner_email: string | null;
}

interface PlatformStats {
  orgStats: {
    total: number; active: number; trial: number; suspended: number;
    cancelled: number; is_active: number; plan_basic: number; plan_pro: number;
    plan_enterprise: number; new_last_30d: number;
  };
  userStats: { total_users: number; orgs_with_users: number };
  propStats: { total_properties: number };
  monthlyGrowth: { month: string; new_tenants: number }[];
}

interface HealthData {
  status: string; uptime: number; dbLatencyMs: number; dbStatus: string;
  nodeVersion: string; memoryUsedMB: number; memoryTotalMB: number;
  tableStats: { orgs: number; users: number; bookings: number; guests: number; properties: number };
  integrations: Record<string, boolean>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || err.error || r.statusText);
  }
  return r.json();
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);
}

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}г ${m}хв`;
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  basic:      { label: "Basic",      color: "bg-slate-100 text-slate-700" },
  pro:        { label: "Pro",        color: "bg-blue-100 text-blue-700" },
  enterprise: { label: "Enterprise", color: "bg-purple-100 text-purple-700" },
};

const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  active:    { label: "Активний",  icon: <CheckCircle2 className="w-3 h-3" />, color: "bg-green-100 text-green-700" },
  trial:     { label: "Тріал",     icon: <Clock className="w-3 h-3" />,        color: "bg-amber-100 text-amber-700" },
  suspended: { label: "Призупино", icon: <AlertTriangle className="w-3 h-3" />,color: "bg-orange-100 text-orange-700" },
  cancelled: { label: "Скасовано", icon: <XCircle className="w-3 h-3" />,      color: "bg-red-100 text-red-700" },
};

// ─── Create Tenant Dialog ─────────────────────────────────────────────────────

function CreateTenantDialog({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", slug: "", plan: "basic",
    ownerName: "", ownerEmail: "", ownerPassword: "",
    email: "", phone: "", trialDays: "30",
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const mut = useMutation({
    mutationFn: () => apiFetch("/api/organizations", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        trialDays: parseInt(form.trialDays) || 30,
      }),
    }),
    onSuccess: (data) => {
      toast({ title: `Тенант "${data.organization.name}" створено`, description: `Owner: ${data.owner.email}` });
      onSuccess();
      onClose();
      setForm({ name: "", slug: "", plan: "basic", ownerName: "", ownerEmail: "", ownerPassword: "", email: "", phone: "", trialDays: "30" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  function autoSlug(name: string) {
    return name.toLowerCase()
      .replace(/[іїєё]/g, (c) => ({ і: "i", ї: "yi", є: "ye", ё: "yo" }[c] || c))
      .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новий тенант</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Назва організації *</Label>
              <Input
                placeholder="Готель Прем'єр"
                value={form.name}
                onChange={e => { set("name", e.target.value); if (!form.slug) set("slug", autoSlug(e.target.value)); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Slug (URL) *</Label>
              <Input
                placeholder="hotel-premier"
                value={form.slug}
                onChange={e => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Тарифний план</Label>
              <Select value={form.plan} onValueChange={v => set("plan", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic — 30 номерів, 5 users</SelectItem>
                  <SelectItem value="pro">Pro — 100 номерів, 20 users</SelectItem>
                  <SelectItem value="enterprise">Enterprise — без обмежень</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Власник (Owner)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ім'я *</Label>
                <Input placeholder="Іван Петренко" value={form.ownerName} onChange={e => set("ownerName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="owner@hotel.com" value={form.ownerEmail} onChange={e => set("ownerEmail", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Пароль *</Label>
                <Input type="text" placeholder="мінімум 6 символів" value={form.ownerPassword} onChange={e => set("ownerPassword", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Контакти організації (опційно)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email організації</Label>
                <Input type="email" placeholder="info@hotel.com" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Тел. організації</Label>
                <Input placeholder="+380..." value={form.phone} onChange={e => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Тріал (днів)</Label>
                <Input type="number" min={0} max={365} value={form.trialDays} onChange={e => set("trialDays", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.name || !form.slug || !form.ownerEmail || !form.ownerName || !form.ownerPassword}
          >
            {mut.isPending ? "Створення..." : "Створити тенанта"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Detail Panel ──────────────────────────────────────────────────────

function TenantDetail({ tenantId, onBack }: { tenantId: number; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { user, login } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["sa-tenant", tenantId],
    queryFn: () => apiFetch(`/api/super-admin/tenants/${tenantId}`),
  });

  const impersonate = useMutation({
    mutationFn: () => apiFetch(`/api/super-admin/tenants/${tenantId}/impersonate`, { method: "POST" }),
    onSuccess: (data) => {
      localStorage.setItem("hms_token", data.token);
      localStorage.setItem("sa_return_token", localStorage.getItem("hms_token") || "");
      toast({ title: `Входите як ${data.user.name} (${data.user.role})` });
      window.location.href = "/hms/dashboard";
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const patchStatus = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/super-admin/tenants/${tenantId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sa-tenant", tenantId] }); qc.invalidateQueries({ queryKey: ["sa-tenants"] }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Завантаження...</div>;
  if (!data) return null;

  const { org, members, properties, usage } = data;
  const statusInfo = STATUS_LABELS[org.subscription_status] || STATUS_LABELS.trial;
  const planInfo = PLAN_LABELS[org.plan] || PLAN_LABELS.basic;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-base truncate">{org.name}</h1>
          <p className="text-xs text-muted-foreground">{org.slug} · ID {org.id}</p>
        </div>
        <Button size="sm" onClick={() => impersonate.mutate()} disabled={impersonate.isPending}>
          <LogIn className="w-4 h-4 mr-1.5" />
          {impersonate.isPending ? "Вхід..." : "Impersonate"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Status cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Бронювань (30д)", value: usage.bookings_30d ?? 0 },
            { label: "Гостей всього", value: usage.total_guests ?? 0 },
            { label: "Номерів", value: usage.unit_count ?? 0 },
            { label: "Бронювань всього", value: usage.total_bookings ?? 0 },
          ].map(c => (
            <div key={c.label} className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Org info */}
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Організація</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Статус підписки</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.icon}{statusInfo.label}
                </span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Тарифний план</p>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${planInfo.color}`}>{planInfo.label}</span>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Email</p>
              <p className="font-medium">{org.email || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Телефон</p>
              <p className="font-medium">{org.phone || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Тріал до</p>
              <p className="font-medium">{fmtDate(org.trial_ends_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Підписка до</p>
              <p className="font-medium">{fmtDate(org.subscription_ends_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Макс. номерів / users</p>
              <p className="font-medium">{org.max_units} / {org.max_users}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Дата реєстрації</p>
              <p className="font-medium">{fmtDate(org.created_at)}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-1 flex-wrap">
            <Select
              value={org.plan}
              onValueChange={v => patchStatus.mutate({ plan: v })}
            >
              <SelectTrigger className="w-36 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={org.subscription_status}
              onValueChange={v => patchStatus.mutate({ subscriptionStatus: v })}
            >
              <SelectTrigger className="w-36 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Тріал</SelectItem>
                <SelectItem value="active">Активний</SelectItem>
                <SelectItem value="suspended">Призупинено</SelectItem>
                <SelectItem value="cancelled">Скасовано</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={org.is_active ? "outline" : "default"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => patchStatus.mutate({ isActive: !org.is_active })}
            >
              {org.is_active ? "Деактивувати" : "Активувати"}
            </Button>
          </div>
        </div>

        {/* Members */}
        <div className="border rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Користувачі ({members?.length || 0})</p>
          <div className="divide-y">
            {(members || []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{m.role}</Badge>
                  {!m.is_active && <Badge variant="destructive" className="text-xs">Неактивний</Badge>}
                </div>
              </div>
            ))}
            {!members?.length && <p className="text-sm text-muted-foreground py-2">Немає користувачів</p>}
          </div>
        </div>

        {/* Properties */}
        <div className="border rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Об'єкти ({properties?.length || 0})</p>
          <div className="divide-y">
            {(properties || []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.type} · {p.address || "—"}</p>
                </div>
                {!p.is_active && <Badge variant="outline" className="text-xs text-muted-foreground">Неактивний</Badge>}
              </div>
            ))}
            {!properties?.length && <p className="text-sm text-muted-foreground py-2">Немає об'єктів</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Super Admin Page ────────────────────────────────────────────────────

export default function SuperAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"tenants" | "health">("tenants");

  if (user?.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium">Доступ заборонено</p>
          <p className="text-sm">Потрібна роль super_admin</p>
        </div>
      </div>
    );
  }

  const { data: tenants, isLoading: tenantsLoading, refetch } = useQuery<{ tenants: Tenant[] }>({
    queryKey: ["sa-tenants"],
    queryFn: () => apiFetch("/api/super-admin/tenants"),
  });

  const { data: platform } = useQuery<PlatformStats>({
    queryKey: ["sa-platform"],
    queryFn: () => apiFetch("/api/super-admin/platform"),
  });

  const { data: health } = useQuery<HealthData>({
    queryKey: ["sa-health"],
    queryFn: () => apiFetch("/api/super-admin/health"),
    refetchInterval: 30_000,
    enabled: activeTab === "health",
  });

  const impersonate = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/super-admin/tenants/${id}/impersonate`, { method: "POST" }),
    onSuccess: (data) => {
      const saToken = localStorage.getItem("hms_token") || "";
      localStorage.setItem("hms_sa_token", saToken);
      localStorage.setItem("hms_token", data.token);
      toast({ title: `Входите як ${data.user.name}`, description: `Роль: ${data.user.role}` });
      setTimeout(() => { window.location.href = window.location.pathname.replace(/\/super-admin.*/, "/dashboard"); }, 500);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const filtered = (tenants?.tenants || []).filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.includes(search.toLowerCase()) ||
    (t.owner_email || "").toLowerCase().includes(search.toLowerCase())
  );

  if (selectedId !== null) {
    return <TenantDetail tenantId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const stats = platform?.orgStats;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <h1 className="font-semibold text-base">Super Admin</h1>
          <p className="text-xs text-muted-foreground">Maison HD Platform</p>
        </div>
        <div className="flex gap-1 border rounded-lg p-0.5">
          {(["tenants", "health"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {tab === "tenants" ? "Тенанти" : "Система"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "tenants" && (
        <>
          {/* KPI strip */}
          {stats && (
            <div className="flex gap-4 px-5 py-2.5 border-b bg-muted/30 shrink-0 overflow-x-auto">
              {[
                { label: "Всього", value: stats.total, color: "text-foreground" },
                { label: "Активних", value: stats.active, color: "text-green-600" },
                { label: "Тріал", value: stats.trial, color: "text-amber-600" },
                { label: "Призупинено", value: stats.suspended, color: "text-orange-600" },
                { label: "Basic", value: stats.plan_basic },
                { label: "Pro", value: stats.plan_pro, color: "text-blue-600" },
                { label: "Enterprise", value: stats.plan_enterprise, color: "text-purple-600" },
                { label: "Нових (30д)", value: stats.new_last_30d, color: "text-primary" },
              ].map(s => (
                <div key={s.label} className="shrink-0 text-center">
                  <p className={`text-lg font-bold ${s.color || "text-foreground"}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-5 py-2 border-b shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Пошук за назвою, slug, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Новий тенант
            </Button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {tenantsLoading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Завантаження...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Building2 className="w-8 h-8 opacity-30" />
                <p className="text-sm">Тенантів не знайдено</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-5 py-2 font-medium">Організація</th>
                    <th className="text-left px-3 py-2 font-medium">План</th>
                    <th className="text-left px-3 py-2 font-medium">Статус</th>
                    <th className="text-right px-3 py-2 font-medium">Users</th>
                    <th className="text-right px-3 py-2 font-medium">Бронювань (30д)</th>
                    <th className="text-left px-3 py-2 font-medium">Дата реєстрації</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(t => {
                    const statusInfo = STATUS_LABELS[t.subscription_status] || STATUS_LABELS.trial;
                    const planInfo = PLAN_LABELS[t.plan] || PLAN_LABELS.basic;
                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => setSelectedId(t.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${t.is_active ? "bg-green-500" : "bg-red-400"}`} />
                            <div className="min-w-0">
                              <p className="font-medium truncate max-w-[180px]">{t.name}</p>
                              <p className="text-xs text-muted-foreground">{t.slug} · {t.owner_email || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${planInfo.color}`}>
                            {planInfo.label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                            {statusInfo.icon}{statusInfo.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{t.user_count}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{t.bookings_30d}</td>
                        <td className="px-3 py-3 text-muted-foreground">{fmtDate(t.created_at)}</td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="w-7 h-7">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedId(t.id)}>
                                <ChevronRight className="w-4 h-4 mr-2" />Деталі
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => impersonate.mutate(t.id)}>
                                <LogIn className="w-4 h-4 mr-2" />Impersonate
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === "health" && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {health ? (
            <>
              {/* System status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Статус", value: health.status === "healthy" ? "Healthy" : "Degraded",
                    icon: <Zap className="w-4 h-4" />, color: health.status === "healthy" ? "text-green-600" : "text-red-600" },
                  { label: "DB Latency", value: `${health.dbLatencyMs}ms`,
                    icon: <Database className="w-4 h-4" />, color: health.dbLatencyMs < 50 ? "text-green-600" : health.dbLatencyMs < 200 ? "text-amber-600" : "text-red-600" },
                  { label: "Пам'ять", value: `${health.memoryUsedMB}/${health.memoryTotalMB}MB`,
                    icon: <Cpu className="w-4 h-4" />, color: "text-foreground" },
                  { label: "Uptime", value: fmtUptime(health.uptime),
                    icon: <RefreshCw className="w-4 h-4" />, color: "text-foreground" },
                ].map(c => (
                  <div key={c.label} className="border rounded-lg p-3 flex items-center gap-3">
                    <div className={`shrink-0 ${c.color}`}>{c.icon}</div>
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className={`font-semibold ${c.color}`}>{c.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Table stats */}
              <div className="border rounded-lg p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">База даних</p>
                <div className="grid grid-cols-5 gap-3">
                  {Object.entries(health.tableStats || {}).map(([key, val]) => (
                    <div key={key} className="text-center">
                      <p className="text-xl font-bold">{val}</p>
                      <p className="text-xs text-muted-foreground capitalize">{key}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Integrations */}
              <div className="border rounded-lg p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Інтеграції</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(health.integrations || {}).map(([key, ok]) => (
                    <span key={key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600"}`}>
                      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {key}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">Node {health.nodeVersion} · Оновлюється кожні 30с</p>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Завантаження...</div>
          )}
        </div>
      )}

      <CreateTenantDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["sa-tenants"] })}
      />
    </div>
  );
}
