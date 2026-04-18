import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { uk } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CreditCard, Plus, Loader2, CheckCircle2, Clock, AlertCircle, XCircle,
  ArrowUpRight, ArrowDownLeft, Search, RefreshCw, Banknote, Smartphone,
  Building2, Link2, Wallet, BarChart3, FileText, DollarSign, TrendingUp,
  Send, RotateCcw, Landmark, Shield, Receipt, Filter, Calendar,
  ChevronRight, Copy, ExternalLink, CheckCheck,
  BookOpen, Briefcase, Tag, Download, Settings2, List, Lock, Unlock,
  ChevronsUpDown, MoreHorizontal, GitMerge, UserCheck, Package,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${API_BASE}/api/finance/${path}`, { ...opts, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(opts?.headers || {}) } }).then(r => r.json());

const fmtDate = (d: any) => { try { return format(new Date(d), "dd.MM.yyyy", { locale: uk }); } catch { return "—"; } };
const fmtDateTime = (d: any) => { try { return format(new Date(d), "dd.MM HH:mm", { locale: uk }); } catch { return "—"; } };
const fmtNum = (n: any) => n ? new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2 }).format(Number(n)) : "0,00";
const fmtCur = (n: any) => `${fmtNum(n)} ₴`;

const METHOD_ICONS: Record<string, any> = {
  cash: Banknote, card: CreditCard, liqpay: Smartphone, stripe: CreditCard, bank_transfer: Building2,
};
const METHOD_LABELS: Record<string, string> = {
  cash: "Готівка", card: "Термінал", liqpay: "LiqPay", stripe: "Stripe", bank_transfer: "Банківський переказ",
};
const METHOD_COLORS: Record<string, string> = {
  cash: "bg-green-100 text-green-700", card: "bg-blue-100 text-blue-700",
  liqpay: "bg-orange-100 text-orange-700", stripe: "bg-violet-100 text-violet-700",
  bank_transfer: "bg-sky-100 text-sky-700",
};
const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700", refunded: "bg-gray-100 text-gray-600",
};
const PAY_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  paid:    { label: "Оплачено",   color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  partial: { label: "Часткова",   color: "bg-amber-100 text-amber-700",  icon: Clock },
  unpaid:  { label: "Не оплачено",color: "bg-red-100 text-red-700",      icon: AlertCircle },
};

type Tab = "overview" | "payments" | "links" | "deposits" | "invoices" | "reconciliation"
         | "folio" | "cashbox" | "refunds" | "legal" | "settings";

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Finance Core</h1>
            <p className="text-sm text-gray-500 mt-1">
              Платежі · Рахунки · Фоліо · Депозити · Каса · Повернення · Юр. особи · Звірка
            </p>
          </div>
          <div className="flex gap-2">
            <NewPaymentDialog />
            <GenerateLinkDialog />
          </div>
        </div>

        <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto pb-px">
          {([
            { id: "overview",        label: "Огляд",         icon: BarChart3 },
            { id: "payments",        label: "Платежі",       icon: Receipt },
            { id: "folio",           label: "Фоліо",         icon: BookOpen },
            { id: "invoices",        label: "Рахунки",       icon: FileText },
            { id: "deposits",        label: "Депозити",      icon: Shield },
            { id: "links",           label: "Посилання",     icon: Link2 },
            { id: "cashbox",         label: "Каса",          icon: Wallet },
            { id: "refunds",         label: "Повернення",    icon: RotateCcw },
            { id: "reconciliation",  label: "Звірка",        icon: Landmark },
            { id: "legal",           label: "Юр. особи",     icon: Briefcase },
            { id: "settings",        label: "Налаштування",  icon: Settings2 },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === id
                  ? "border-[--mhd-primary] text-[--mhd-primary]"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        {tab === "overview"       && <OverviewTab />}
        {tab === "payments"       && <PaymentsTab />}
        {tab === "folio"          && <FolioTab />}
        {tab === "invoices"       && <InvoicesTab />}
        {tab === "deposits"       && <DepositsTab />}
        {tab === "links"          && <LinksTab />}
        {tab === "cashbox"        && <CashboxTab />}
        {tab === "refunds"        && <RefundsTab />}
        {tab === "reconciliation" && <ReconciliationTab />}
        {tab === "legal"          && <LegalEntitiesTab />}
        {tab === "settings"       && <SettingsTab />}
      </div>
    </AppLayout>
  );
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data, isLoading } = useQuery({ queryKey: ["finance", "summary"], queryFn: () => apiFetch("summary"), staleTime: 30_000 });
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  const d = data || {};
  const t = d.totals || {};
  const dep = d.deposits || {};
  const ovr = d.overdue || {};

  const kpis = [
    { label: "Зібрано (всього)",    v: fmtCur(t.collected),       icon: TrendingUp,   c: "text-emerald-600 bg-emerald-50" },
    { label: "Очікує оплати",       v: fmtCur(t.pending_amount),  icon: Clock,        c: "text-amber-600 bg-amber-50" },
    { label: "Повернуто",           v: fmtCur(t.refunded_amount), icon: RotateCcw,    c: "text-rose-600 bg-rose-50" },
    { label: "Комісії",             v: fmtCur(t.total_fees),      icon: DollarSign,   c: "text-gray-600 bg-gray-100" },
    { label: "Депозити (held)",     v: fmtCur(dep.amount),        icon: Shield,       c: "text-violet-600 bg-violet-50" },
    { label: "Прострочено",         v: fmtCur(ovr.amount),        icon: AlertCircle,  c: "text-red-600 bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(({ label, v, icon: Icon, c }) => (
          <Card key={label}><CardContent className="pt-4">
            <div className={`inline-flex p-2 rounded-lg mb-2 ${c.split(" ").slice(1).join(" ")}`}><Icon className={`h-4 w-4 ${c.split(" ")[0]}`} /></div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-base font-bold ${c.split(" ")[0]}`}>{v}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Платежі за методами</CardTitle></CardHeader>
          <CardContent>
            {(d.byMethod || []).map((m: any) => {
              const MethodIcon = METHOD_ICONS[m.method] || CreditCard;
              return (
                <div key={m.method} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${METHOD_COLORS[m.method] || "bg-gray-100"}`}><MethodIcon className="h-3.5 w-3.5" /></div>
                    <span className="text-sm">{METHOD_LABELS[m.method] || m.method}</span>
                    <span className="text-xs text-gray-400">({m.cnt})</span>
                  </div>
                  <span className="font-mono text-sm font-medium">{fmtCur(m.amount)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Статуси бронювань</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(d.byStatus || []).map((s: any) => {
              const cfg = PAY_STATUS_CONFIG[s.payment_status] || { label: s.payment_status, color: "bg-gray-100 text-gray-700", icon: Clock };
              const CfgIcon = cfg.icon;
              const pct = s.total > 0 ? Math.round((parseFloat(s.paid) / parseFloat(s.total)) * 100) : 0;
              return (
                <div key={s.payment_status} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`${cfg.color} text-xs`}><CfgIcon className="h-3 w-3 mr-1" />{cfg.label}</Badge>
                      <span className="text-xs text-gray-500">{s.cnt} броню</span>
                    </div>
                    <span className="text-sm font-medium">{fmtCur(s.paid)} / {fmtCur(s.total)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full">
                    <div className="h-1.5 bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent payments */}
      <Card>
        <CardHeader><CardTitle className="text-base">Останні платежі</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(d.recentPayments || []).map((p: any) => {
              const isRefund = p.payment_type === "refund";
              const MethodIcon = METHOD_ICONS[p.method] || CreditCard;
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isRefund ? "bg-red-50" : "bg-green-50"}`}>
                      {isRefund ? <ArrowDownLeft className="h-4 w-4 text-red-500" /> : <ArrowUpRight className="h-4 w-4 text-green-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.booking_guest || p.description || "—"}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <MethodIcon className="h-3 w-3" />
                        {METHOD_LABELS[p.method] || p.method} · {p.booking_ref} · {fmtDateTime(p.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono font-bold ${isRefund ? "text-red-600" : "text-emerald-700"}`}>
                      {isRefund ? "-" : "+"}{fmtCur(p.amount)}
                    </p>
                    <Badge className={`${STATUS_COLORS[p.status] || "bg-gray-100"} text-xs`}>{p.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── PAYMENTS TAB ─────────────────────────────────────────────────────────────
function PaymentsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [type, setType] = useState("");
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance", "payments", search, method, type],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (method) p.set("method", method);
      if (type) p.set("type", type);
      return apiFetch(`payments?${p}`);
    },
    staleTime: 15_000,
  });

  const refundMut = useMutation({
    mutationFn: ({ id, amount, reason }: any) =>
      apiFetch(`payments/${id}/refund`, { method: "POST", body: JSON.stringify({ amount, reason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); setRefundTarget(null); },
  });

  const payments = data?.payments || [];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Зібрано", v: fmtCur(data?.stats?.collected), c: "text-emerald-700" },
          { l: "Повернуто", v: fmtCur(data?.stats?.refunded), c: "text-red-600" },
          { l: "Транзакцій", v: data?.stats?.count || 0, c: "text-blue-700" },
        ].map(({ l, v, c }) => (
          <div key={l} className="bg-white border rounded-lg p-3 flex items-center gap-3">
            <div><p className="text-xs text-gray-500">{l}</p><p className={`font-bold ${c}`}>{v}</p></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white border rounded-lg p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Пошук за бронюванням, гостем, квитанцією..." className="pl-9 h-9"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={method || "all"} onValueChange={v => setMethod(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Метод" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі методи</SelectItem>
            {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type || "all"} onValueChange={v => setType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Тип" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі типи</SelectItem>
            <SelectItem value="payment">Оплата</SelectItem>
            <SelectItem value="deposit">Депозит</SelectItem>
            <SelectItem value="refund">Повернення</SelectItem>
            <SelectItem value="partial">Часткова</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Дата</TableHead>
                <TableHead className="text-xs">Бронювання</TableHead>
                <TableHead className="text-xs">Гість</TableHead>
                <TableHead className="text-xs">Метод</TableHead>
                <TableHead className="text-xs">Тип</TableHead>
                <TableHead className="text-xs text-right">Сума, ₴</TableHead>
                <TableHead className="text-xs">Квитанція</TableHead>
                <TableHead className="text-xs">Статус</TableHead>
                <TableHead className="text-xs">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p: any) => {
                const isRefund = p.payment_type === "refund";
                const MethodIcon = METHOD_ICONS[p.method] || CreditCard;
                return (
                  <TableRow key={p.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs">{fmtDateTime(p.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.booking_ref || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[130px] truncate">{p.booking_guest || "—"}</TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${METHOD_COLORS[p.method] || "bg-gray-100"}`}>
                        <MethodIcon className="h-3 w-3" />{METHOD_LABELS[p.method] || p.method}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500">
                        {p.payment_type === "deposit" ? "🏦 Депозит" :
                         p.payment_type === "refund" ? "↩️ Повернення" :
                         p.payment_type === "partial" ? "🔀 Часткова" : "💰 Оплата"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono font-bold ${isRefund ? "text-red-600" : "text-emerald-700"}`}>
                        {isRefund ? "−" : "+"}{fmtNum(p.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500">{p.receipt_number || "—"}</TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_COLORS[p.status] || "bg-gray-100"} text-xs`}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.status === "completed" && p.payment_type !== "refund" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => { setRefundTarget(p); setRefundAmount(p.amount); }}>
                          <RotateCcw className="h-3 w-3 mr-1" />Повернути
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Refund Dialog */}
      {refundTarget && (
        <Dialog open onOpenChange={() => setRefundTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Повернення платежу</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-800">Повернення по платежу {refundTarget.receipt_number || `#${refundTarget.id}`}</p>
                <p className="text-amber-700 text-xs mt-1">Бронювання: {refundTarget.booking_ref} · Гість: {refundTarget.booking_guest}</p>
                <p className="text-amber-700 text-xs">Оригінальна сума: {fmtCur(refundTarget.amount)} · Метод: {METHOD_LABELS[refundTarget.method]}</p>
              </div>
              <div>
                <Label>Сума повернення, ₴</Label>
                <Input type="number" value={refundAmount} max={refundTarget.amount}
                  onChange={e => setRefundAmount(e.target.value)} />
                <p className="text-xs text-gray-500 mt-1">Максимум: {fmtCur(refundTarget.amount)}</p>
              </div>
              <div>
                <Label>Причина повернення</Label>
                <Textarea id="refundReason" placeholder="Скасування бронювання / Скарга гостя..." rows={2} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setRefundTarget(null)} className="flex-1">Скасувати</Button>
                <Button disabled={refundMut.isPending || !refundAmount}
                  onClick={() => {
                    const reason = (document.getElementById("refundReason") as HTMLTextAreaElement)?.value;
                    refundMut.mutate({ id: refundTarget.id, amount: parseFloat(refundAmount), reason });
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                  {refundMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RotateCcw className="h-4 w-4 mr-1" />Повернути {fmtCur(refundAmount)}</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── LIQPAY LINKS TAB ─────────────────────────────────────────────────────────
function LinksTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance", "links"],
    queryFn: () => apiFetch("liqpay/links"),
    staleTime: 15_000,
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => apiFetch(`liqpay/links/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); refetch(); },
  });

  const [copied, setCopied] = useState<number | null>(null);
  const copyUrl = (id: number, url: string) => {
    navigator.clipboard.writeText(url).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); });
  };

  const links = data?.links || [];

  const LINK_STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700", paid: "bg-green-100 text-green-700",
    expired: "bg-gray-100 text-gray-600", cancelled: "bg-red-100 text-red-700",
  };
  const LINK_STATUS_LABELS: Record<string, string> = {
    pending: "Очікує", paid: "Оплачено", expired: "Прострочено", cancelled: "Скасовано",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{links.length} посилань для оплати LiqPay</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <GenerateLinkDialog />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : links.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Link2 className="h-12 w-12 text-gray-300 mx-auto" />
          <p className="text-gray-500">Немає посилань для оплати</p>
          <GenerateLinkDialog />
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((l: any) => (
            <div key={l.id} className="bg-white border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{l.booking_ref}</span>
                    <Badge className={`${LINK_STATUS_COLORS[l.status] || "bg-gray-100"} text-xs`}>
                      {LINK_STATUS_LABELS[l.status] || l.status}
                    </Badge>
                    <span className="text-sm font-bold text-emerald-700">{fmtCur(l.amount)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{l.guest_name} {l.guest_email ? `· ${l.guest_email}` : ""}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{l.description}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>Створено: {fmtDateTime(l.created_at)}</p>
                  {l.expires_at && <p>Дійсне до: {fmtDate(l.expires_at)}</p>}
                  {l.paid_at && <p className="text-green-600">Оплачено: {fmtDateTime(l.paid_at)}</p>}
                </div>
              </div>

              {l.checkout_url ? (
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <code className="text-xs text-gray-700 flex-1 truncate">{l.checkout_url}</code>
                  <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0"
                    onClick={() => copyUrl(l.id, l.checkout_url)} title="Копіювати">
                    {copied === l.id ? <CheckCheck className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <a href={l.checkout_url} target="_blank" rel="noopener noreferrer">
                    <Button size="icon" variant="ghost" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                  </a>
                </div>
              ) : (
                <div className="bg-amber-50 text-amber-700 text-xs rounded-lg p-2">
                  ⚠️ LiqPay ключі не налаштовано. Додайте public/private ключі у розділі «Юридичні особи».
                </div>
              )}

              <div className="flex gap-2">
                {l.checkout_url && l.status === "pending" && (
                  <Button size="sm" variant="outline" className="text-xs"
                    onClick={() => copyUrl(l.id, l.checkout_url)}>
                    <Copy className="h-3 w-3 mr-1" /> Копіювати для відправки
                  </Button>
                )}
                {l.status === "pending" && (
                  <Button size="sm" variant="outline" className="text-xs text-red-600 hover:bg-red-50"
                    onClick={() => cancelMut.mutate(l.id)} disabled={cancelMut.isPending}>
                    <XCircle className="h-3 w-3 mr-1" /> Скасувати
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DEPOSITS TAB ─────────────────────────────────────────────────────────────
function DepositsTab() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<any>({ bookingId: "", amount: "", method: "cash", description: "" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance", "deposits"],
    queryFn: () => apiFetch("deposits"),
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch("deposits", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); setAddOpen(false); setForm({ bookingId: "", amount: "", method: "cash", description: "" }); },
  });
  const refundMut = useMutation({
    mutationFn: (id: number) => apiFetch(`deposits/${id}/refund`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); refetch(); },
  });
  const applyMut = useMutation({
    mutationFn: (id: number) => apiFetch(`deposits/${id}/apply`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); refetch(); },
  });
  const forfeitMut = useMutation({
    mutationFn: (id: number) => apiFetch(`deposits/${id}/forfeit`, { method: "PATCH", body: JSON.stringify({ reason: "No-show / умови скасування" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); refetch(); },
  });

  const deposits = data?.deposits || [];
  const s = data?.summary || {};

  const DEP_STATUS: Record<string, { label: string; color: string }> = {
    held:      { label: "Утримується",  color: "bg-blue-100 text-blue-700" },
    applied:   { label: "Зараховано",   color: "bg-green-100 text-green-700" },
    refunded:  { label: "Повернуто",    color: "bg-amber-100 text-amber-700" },
    forfeited: { label: "Утримано",     color: "bg-red-100 text-red-700" },
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "Утримується",  v: fmtCur(s.held_amount),      c: "text-blue-700" },
          { l: "Повернуто",    v: fmtCur(s.refunded_amount),  c: "text-amber-700" },
          { l: "Утримано (штраф)", v: fmtCur(s.forfeited_amount), c: "text-red-700" },
          { l: "Всього депозитів", v: s.total_count || 0,     c: "text-gray-700" },
        ].map(({ l, v, c }) => (
          <div key={l} className="bg-white border rounded-lg p-3">
            <p className="text-xs text-gray-500">{l}</p><p className={`font-bold ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <h3 className="font-medium text-gray-700">Список депозитів</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" size="sm" onClick={() => setForm({ bookingId: "", amount: "", method: "cash", description: "" })}>
              <Plus className="h-4 w-4 mr-1" /> Прийняти депозит
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Прийняти депозит</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>ID Бронювання *</Label><Input type="number" value={form.bookingId} onChange={e => setForm((f: any) => ({ ...f, bookingId: e.target.value }))} placeholder="1" /></div>
              <div><Label>Сума депозиту, ₴ *</Label><Input type="number" value={form.amount} onChange={e => setForm((f: any) => ({ ...f, amount: e.target.value }))} placeholder="2000" /></div>
              <div><Label>Метод прийому</Label>
                <Select value={form.method} onValueChange={v => setForm((f: any) => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Опис</Label><Input value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Депозит за ключі/мінібар" /></div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAddOpen(false)} className="flex-1">Скасувати</Button>
                <Button disabled={!form.bookingId || !form.amount || createMut.isPending}
                  onClick={() => createMut.mutate({ bookingId: parseInt(form.bookingId), amount: parseFloat(form.amount), method: form.method, description: form.description })}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Прийняти"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Бронювання</TableHead>
                <TableHead className="text-xs">Гість</TableHead>
                <TableHead className="text-xs">Метод</TableHead>
                <TableHead className="text-xs text-right">Сума, ₴</TableHead>
                <TableHead className="text-xs">Статус</TableHead>
                <TableHead className="text-xs">Прийнято</TableHead>
                <TableHead className="text-xs">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deposits.map((d: any) => {
                const statusInfo = DEP_STATUS[d.status] || { label: d.status, color: "bg-gray-100 text-gray-600" };
                const MethodIcon = METHOD_ICONS[d.method] || CreditCard;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.booking_ref}</TableCell>
                    <TableCell className="text-xs">{d.guest_name}</TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${METHOD_COLORS[d.method] || "bg-gray-100"}`}>
                        <MethodIcon className="h-3 w-3" />{METHOD_LABELS[d.method] || d.method}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-blue-700">{fmtNum(d.amount)}</TableCell>
                    <TableCell><Badge className={`${statusInfo.color} text-xs`}>{statusInfo.label}</Badge></TableCell>
                    <TableCell className="text-xs">{fmtDate(d.held_at)}</TableCell>
                    <TableCell>
                      {d.status === "held" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600 hover:bg-green-50"
                            onClick={() => applyMut.mutate(d.id)} title="Зарахувати в оплату">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />Зарахувати
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600 hover:bg-amber-50"
                            onClick={() => refundMut.mutate(d.id)} title="Повернути гостю">
                            <RotateCcw className="h-3 w-3 mr-0.5" />Повернути
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:bg-red-50"
                            onClick={() => forfeitMut.mutate(d.id)} title="Утримати (no-show/штраф)">
                            <XCircle className="h-3 w-3 mr-0.5" />Утримати
                          </Button>
                        </div>
                      )}
                      {d.status === "refunded" && <span className="text-xs text-amber-600">↩ {fmtDate(d.refunded_at)}</span>}
                      {d.status === "applied" && <span className="text-xs text-green-600">✓ {fmtDate(d.applied_at)}</span>}
                      {d.status === "forfeited" && <span className="text-xs text-red-600">{d.forfeited_reason || "Утримано"}</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── INVOICES TAB ─────────────────────────────────────────────────────────────
function InvoicesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [genBookingId, setGenBookingId] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance", "invoices", search, status],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (status) p.set("status", status);
      return apiFetch(`invoices?${p}`);
    },
    staleTime: 15_000,
  });

  const genMut = useMutation({
    mutationFn: (bookingId: number) =>
      apiFetch("invoices/generate", { method: "POST", body: JSON.stringify({ bookingId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); setGenOpen(false); refetch(); },
  });

  const paidMut = useMutation({
    mutationFn: ({ id, amount }: any) =>
      apiFetch(`invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status: "paid", paidAmount: amount }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); refetch(); },
  });

  const invoices = data?.invoices || [];

  const INV_STATUS: Record<string, { label: string; color: string }> = {
    draft:     { label: "Чернетка",   color: "bg-gray-100 text-gray-600" },
    pending:   { label: "Очікує",     color: "bg-amber-100 text-amber-700" },
    paid:      { label: "Оплачено",   color: "bg-green-100 text-green-700" },
    overdue:   { label: "Прострочено",color: "bg-red-100 text-red-700" },
    cancelled: { label: "Скасовано",  color: "bg-gray-200 text-gray-500" },
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Пошук рахунку..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={status || "all"} onValueChange={v => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі</SelectItem>
            {Object.entries(INV_STATUS).map(([k, { label }]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>

        <Dialog open={genOpen} onOpenChange={setGenOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Авто-рахунок
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Автогенерація рахунку по бронюванню</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>ID Бронювання</Label><Input type="number" value={genBookingId} onChange={e => setGenBookingId(e.target.value)} placeholder="1" /></div>
              <p className="text-xs text-gray-500">Система автоматично заповнить суму, дату, юридичну особу та дані гостя.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setGenOpen(false)} className="flex-1">Скасувати</Button>
                <Button disabled={!genBookingId || genMut.isPending}
                  onClick={() => genMut.mutate(parseInt(genBookingId))}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {genMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Генерувати"}
                </Button>
              </div>
              {(genMut.data as any)?.existed && (
                <p className="text-sm text-amber-600 bg-amber-50 rounded p-2">⚠️ Рахунок вже існує для цього бронювання.</p>
              )}
              {(genMut.data as any)?.invoice && !(genMut.data as any)?.existed && (
                <p className="text-sm text-green-700 bg-green-50 rounded p-2">✅ Рахунок {(genMut.data as any).invoice.invoice_number} створено.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Номер</TableHead>
                <TableHead className="text-xs">Бронювання</TableHead>
                <TableHead className="text-xs">Гість</TableHead>
                <TableHead className="text-xs">Дата</TableHead>
                <TableHead className="text-xs">Оплатити до</TableHead>
                <TableHead className="text-xs text-right">Сума, ₴</TableHead>
                <TableHead className="text-xs text-right">Оплачено, ₴</TableHead>
                <TableHead className="text-xs">Статус</TableHead>
                <TableHead className="text-xs">Юрособа</TableHead>
                <TableHead className="text-xs">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: any) => {
                const si = INV_STATUS[inv.status] || { label: inv.status, color: "bg-gray-100" };
                return (
                  <TableRow key={inv.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.booking_ref || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[130px] truncate">{inv.guest_name || "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(inv.created_at)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(inv.due_date)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-sm">{fmtNum(inv.amount)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-green-700">{fmtNum(inv.paid_amount)}</TableCell>
                    <TableCell><Badge className={`${si.color} text-xs`}>{si.label}</Badge></TableCell>
                    <TableCell className="text-xs text-gray-500">{inv.legal_entity_short || inv.legal_entity_name || "—"}</TableCell>
                    <TableCell>
                      {inv.status === "pending" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600"
                          onClick={() => paidMut.mutate({ id: inv.id, amount: inv.amount })}>
                          <CheckCircle2 className="h-3 w-3 mr-0.5" />Оплачено
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── RECONCILIATION TAB ───────────────────────────────────────────────────────
function ReconciliationTab() {
  const [from, setFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance", "reconciliation", from, to, method],
    queryFn: () => {
      const p = new URLSearchParams({ from, to });
      if (method) p.set("method", method);
      return apiFetch(`reconciliation?${p}`);
    },
    staleTime: 30_000,
  });

  const s = data?.summary || {};
  const byMethod = data?.byMethod || [];
  const byStatus = data?.byBookingStatus || [];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white border rounded-lg p-3 items-end">
        <div><Label className="text-xs">Від</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36" /></div>
        <div><Label className="text-xs">До</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36" /></div>
        <Select value={method || "all"} onValueChange={v => setMethod(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Метод" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі методи</SelectItem>
            {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => refetch()} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
          <RefreshCw className="h-4 w-4 mr-1" />Оновити
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { l: "Надійшло (gross)", v: fmtCur(s.total_collected), c: "text-emerald-700 bg-emerald-50" },
              { l: "Повернуто",        v: fmtCur(s.total_refunded),  c: "text-red-700 bg-red-50" },
              { l: "Комісії LiqPay",   v: fmtCur(s.total_fees),      c: "text-gray-700 bg-gray-50" },
              { l: "Чистий дохід",     v: fmtCur(s.net_revenue),     c: "text-blue-700 bg-blue-50" },
            ].map(({ l, v, c }) => (
              <div key={l} className={`rounded-xl p-4 ${c.split(" ")[1]}`}>
                <p className="text-xs text-gray-500">{l}</p>
                <p className={`text-xl font-bold ${c.split(" ")[0]} mt-1`}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By method */}
            <Card>
              <CardHeader><CardTitle className="text-base">По методах оплати</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow className="text-xs bg-gray-50">
                    <TableHead className="text-xs">Метод</TableHead>
                    <TableHead className="text-xs text-right">Надійшло</TableHead>
                    <TableHead className="text-xs text-right">Повернуто</TableHead>
                    <TableHead className="text-xs text-right">Комісія</TableHead>
                    <TableHead className="text-xs text-right">Чисто</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {byMethod.filter((r: any) => r.payment_type !== "refund").map((r: any) => {
                      const MethodIcon = METHOD_ICONS[r.method] || CreditCard;
                      return (
                        <TableRow key={r.method + r.payment_type}>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <MethodIcon className="h-3.5 w-3.5 text-gray-500" />
                              {METHOD_LABELS[r.method] || r.method}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono text-emerald-700">{fmtNum(r.gross)}</TableCell>
                          <TableCell className="text-right text-xs font-mono text-red-600">{fmtNum(r.refunds)}</TableCell>
                          <TableCell className="text-right text-xs font-mono text-gray-500">{fmtNum(r.fees)}</TableCell>
                          <TableCell className="text-right text-xs font-mono font-bold">{fmtNum(r.net)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* By booking status */}
            <Card>
              <CardHeader><CardTitle className="text-base">Стан бронювань</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {byStatus.map((s: any) => {
                    const cfg = PAY_STATUS_CONFIG[s.payment_status] || { label: s.payment_status, color: "bg-gray-100 text-gray-700", icon: Clock };
                    const CfgIcon = cfg.icon;
                    const pct = parseFloat(s.total) > 0 ? Math.round((parseFloat(s.paid) / parseFloat(s.total)) * 100) : 0;
                    return (
                      <div key={s.payment_status} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Badge className={`${cfg.color} text-xs`}><CfgIcon className="h-3 w-3 mr-1" />{cfg.label} ({s.cnt})</Badge>
                          <span className="text-xs font-medium">{fmtCur(s.paid)} / {fmtCur(s.total)}</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-2 rounded-full ${pct === 100 ? "bg-green-500" : pct > 0 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ─── NEW PAYMENT DIALOG ───────────────────────────────────────────────────────
function NewPaymentDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bookingId: "", amount: "", method: "cash", paymentType: "payment", description: "" });

  const mut = useMutation({
    mutationFn: (body: any) => apiFetch("payments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); setOpen(false); setForm({ bookingId: "", amount: "", method: "cash", paymentType: "payment", description: "" }); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> Прийняти оплату
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Прийняти оплату</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>ID Бронювання *</Label><Input type="number" value={form.bookingId} onChange={e => setForm(f => ({ ...f, bookingId: e.target.value }))} placeholder="1" /></div>
          <div><Label>Сума, ₴ *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="5000" /></div>
          <div><Label>Метод оплати</Label>
            <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(METHOD_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      {k === "cash" && "💵"}
                      {k === "card" && "💳"}
                      {k === "liqpay" && "📱"}
                      {k === "bank_transfer" && "🏦"}
                      {v}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Тип</Label>
            <Select value={form.paymentType} onValueChange={v => setForm(f => ({ ...f, paymentType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payment">💰 Оплата</SelectItem>
                <SelectItem value="deposit">🏦 Депозит</SelectItem>
                <SelectItem value="partial">🔀 Часткова оплата</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Коментар</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Оплата при заїзді..." /></div>

          {mut.data && (mut.data as any).receiptNumber && (
            <div className="bg-green-50 text-green-700 rounded-lg p-3 text-sm">
              ✅ Оплата зафіксована. Квитанція: <strong>{(mut.data as any).receiptNumber}</strong>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">Скасувати</Button>
            <Button disabled={!form.bookingId || !form.amount || mut.isPending}
              onClick={() => mut.mutate({ ...form, bookingId: parseInt(form.bookingId), amount: parseFloat(form.amount) })}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Прийняти ${fmtCur(form.amount)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── GENERATE LIQPAY LINK DIALOG ──────────────────────────────────────────────
function GenerateLinkDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bookingId: "", amount: "", description: "", guestEmail: "", guestPhone: "", guestName: "", expiresInDays: "3" });

  const mut = useMutation({
    mutationFn: (body: any) => apiFetch("liqpay/create-link", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });

  const result = mut.data as any;

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) mut.reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50">
          <Smartphone className="h-4 w-4 mr-1" /> LiqPay посилання
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Сформувати LiqPay посилання для оплати</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!result ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>ID Бронювання *</Label><Input type="number" value={form.bookingId} onChange={e => setForm(f => ({ ...f, bookingId: e.target.value }))} /></div>
                <div><Label>Сума, ₴ *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
              </div>
              <div><Label>Опис (для гостя)</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Оплата бронювання..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email гостя</Label><Input type="email" value={form.guestEmail} onChange={e => setForm(f => ({ ...f, guestEmail: e.target.value }))} /></div>
                <div><Label>Телефон</Label><Input value={form.guestPhone} onChange={e => setForm(f => ({ ...f, guestPhone: e.target.value }))} /></div>
              </div>
              <div><Label>ПІБ гостя</Label><Input value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} /></div>
              <div><Label>Термін дії (днів)</Label>
                <Select value={form.expiresInDays} onValueChange={v => setForm(f => ({ ...f, expiresInDays: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["1","2","3","5","7","14","30"].map(d => <SelectItem key={d} value={d}>{d} {d === "1" ? "день" : ["2","3","4"].includes(d) ? "дні" : "днів"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">Скасувати</Button>
                <Button disabled={!form.bookingId || !form.amount || mut.isPending}
                  onClick={() => mut.mutate({ ...form, bookingId: parseInt(form.bookingId), amount: parseFloat(form.amount), expiresInDays: parseInt(form.expiresInDays) })}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                  {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Smartphone className="h-4 w-4 mr-1" />Сформувати</>}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className={`rounded-lg p-3 text-sm ${result.hasKeys ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                {result.hasKeys ? "✅" : "ℹ️"} {result.message}
              </div>
              {result.checkoutUrl ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Посилання для оплати:</Label>
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                      <code className="text-xs text-gray-700 flex-1 break-all">{result.checkoutUrl}</code>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Текст для відправки гостю:</Label>
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-xs text-gray-700">{result.emailText}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(result.checkoutUrl); }}>
                      <Copy className="h-4 w-4 mr-1" />Скопіювати
                    </Button>
                    <a href={result.checkoutUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white"><ExternalLink className="h-4 w-4 mr-1" />Відкрити</Button>
                    </a>
                  </div>
                </>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  <p className="font-medium mb-1">Як налаштувати LiqPay:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Зареєструйтесь на <a href="https://www.liqpay.ua" target="_blank" className="text-orange-600 underline">liqpay.ua</a></li>
                    <li>Отримайте Public Key та Private Key в кабінеті</li>
                    <li>Перейдіть у «Бухгалтерія → Юридичні особи»</li>
                    <li>Додайте LiqPay ключі до вашої юридичної особи</li>
                  </ol>
                </div>
              )}
              <Button variant="outline" onClick={() => mut.reset()} className="w-full">Створити ще одне</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── FOLIO / GUEST LEDGER ────────────────────────────────────────────────────
function FolioTab() {
  const qc = useQueryClient();
  const [bookingRef, setBookingRef] = useState("");
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ description: "", quantity: "1", unitPrice: "", entryType: "charge", vatRate: "20", notes: "" });

  const searchMut = useMutation({
    mutationFn: () => fetch(`${API_BASE}/api/bookings?search=${encodeURIComponent(bookingRef)}`, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    onSuccess: (data) => {
      const bk = data?.bookings?.[0];
      if (bk) setBookingId(bk.id);
      else alert("Бронювання не знайдено");
    },
  });

  const { data: folio, isLoading } = useQuery({
    queryKey: ["folio", bookingId], enabled: !!bookingId,
    queryFn: () => apiFetch(`folio/${bookingId}`),
  });

  const addMut = useMutation({
    mutationFn: (body: any) => apiFetch("folio", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["folio", bookingId] }); setAddOpen(false); setForm({ description: "", quantity: "1", unitPrice: "", entryType: "charge", vatRate: "20", notes: "" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`folio/entry/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folio", bookingId] }),
  });

  const f = folio || {};
  const bk = f.booking || {};
  const s = f.summary || {};

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs mb-1">Пошук бронювання (ref або гість)</Label>
          <div className="flex gap-2">
            <Input placeholder="HTL-2024-00123 або Іванов" value={bookingRef} onChange={e => setBookingRef(e.target.value)} onKeyDown={e => e.key === "Enter" && searchMut.mutate()} />
            <Button onClick={() => searchMut.mutate()} disabled={!bookingRef}><Search className="h-4 w-4 mr-1" />Знайти</Button>
          </div>
        </div>
        {bookingId && <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Додати запис</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Додати до фоліо</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Тип</Label>
                <Select value={form.entryType} onValueChange={v => setForm(f => ({ ...f, entryType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="charge">Нарахування</SelectItem>
                    <SelectItem value="credit">Кредит</SelectItem>
                    <SelectItem value="adjustment">Коригування</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Опис *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">К-ть</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
                <div><Label className="text-xs">Ціна ₴</Label><Input type="number" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} /></div>
              </div>
              <div>
                <Label className="text-xs">ПДВ</Label>
                <Select value={form.vatRate} onValueChange={v => setForm(f => ({ ...f, vatRate: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="7">7%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Примітки</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm font-semibold">Сума: {fmtCur((parseFloat(form.quantity) || 1) * (parseFloat(form.unitPrice) || 0))}</span>
                <Button onClick={() => addMut.mutate({ ...form, bookingId, quantity: parseFloat(form.quantity), unitPrice: parseFloat(form.unitPrice) })} disabled={!form.description || !form.unitPrice || addMut.isPending}>
                  {addMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Зберегти
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>}
      </div>

      {bookingId && isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>}

      {bk.id && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-indigo-500">Бронювання</p>
              <p className="font-bold font-mono text-indigo-900">{bk.booking_ref}</p>
              <p className="text-sm text-indigo-700">{bk.guest_name}</p>
            </div>
            <div>
              <p className="text-xs text-indigo-500">Номер / Об'єкт</p>
              <p className="text-sm font-semibold">{bk.unit_name}</p>
              <p className="text-xs text-indigo-400">{bk.property_name}</p>
            </div>
            <div>
              <p className="text-xs text-indigo-500">Проживання</p>
              <p className="text-sm">{fmtDate(bk.check_in)} — {fmtDate(bk.check_out)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-indigo-500">До оплати</p>
              <p className={`text-2xl font-bold ${s.balance > 0 ? "text-red-600" : "text-green-600"}`}>{fmtCur(s.balance)}</p>
              <p className="text-xs text-indigo-400">Сплачено: {fmtCur(s.totalPaid)}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Нарахування", value: s.totalCharges, color: "text-red-600" },
              { label: "Кредити", value: s.totalCredits, color: "text-green-600" },
              { label: "Оплачено", value: s.totalPaid, color: "text-blue-600" },
              { label: "Повернено", value: s.totalRefunded, color: "text-gray-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{fmtCur(value)}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-sm">Фоліо гостя</span>
              <span className="text-xs text-gray-400 ml-1">({(f.entries || []).length} записів)</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  <TableHead>Дата</TableHead><TableHead>Тип</TableHead><TableHead>Опис</TableHead>
                  <TableHead className="text-right">К-ть</TableHead><TableHead className="text-right">Ціна</TableHead>
                  <TableHead className="text-right">ПДВ</TableHead><TableHead className="text-right">Сума ₴</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(f.entries || []).map((e: any) => (
                  <TableRow key={e.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs text-gray-500">{fmtDateTime(e.created_at)}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.entry_type === "charge" ? "bg-red-100 text-red-700" : e.entry_type === "credit" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {e.entry_type === "charge" ? "Нарахування" : e.entry_type === "credit" ? "Кредит" : "Коригування"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-right text-xs">{e.quantity}</TableCell>
                    <TableCell className="text-right text-xs">{fmtNum(e.unit_price)}</TableCell>
                    <TableCell className="text-right text-xs text-gray-500">{fmtNum(e.vat_amount)}</TableCell>
                    <TableCell className={`text-right font-semibold ${e.entry_type === "charge" ? "text-red-600" : "text-green-600"}`}>{fmtCur(e.total_amount)}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => deleteMut.mutate(e.id)}>✕</Button></TableCell>
                  </TableRow>
                ))}
                {!(f.entries || []).length && <TableRow><TableCell colSpan={8} className="text-center text-xs text-gray-400 py-6">Немає записів у фоліо</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>

          {(f.payments || []).length > 0 && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-green-600" />Платежі</div>
              <Table>
                <TableHeader><TableRow className="text-xs"><TableHead>Дата</TableHead><TableHead>Метод</TableHead><TableHead>Тип</TableHead><TableHead>Квитанція</TableHead><TableHead className="text-right">Сума ₴</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(f.payments || []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{fmtDateTime(p.created_at)}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${METHOD_COLORS[p.method] || "bg-gray-100 text-gray-600"}`}>{METHOD_LABELS[p.method] || p.method}</span></TableCell>
                      <TableCell className="text-xs capitalize">{p.payment_type}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">{p.receipt_number || "—"}</TableCell>
                      <TableCell className={`text-right font-semibold ${p.payment_type === "refund" ? "text-red-600" : "text-green-600"}`}>{p.payment_type === "refund" ? "-" : "+"}{fmtCur(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {(f.installments || []).length > 0 && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold flex items-center gap-2"><GitMerge className="h-4 w-4 text-purple-600" />Розстрочка ({f.installments.length} платежів)</div>
              <Table>
                <TableHeader><TableRow className="text-xs"><TableHead>#</TableHead><TableHead>Термін</TableHead><TableHead>Опис</TableHead><TableHead>Статус</TableHead><TableHead className="text-right">Сума</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(f.installments || []).map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs font-mono">{i.installment_number}/{i.total_installments}</TableCell>
                      <TableCell className="text-xs">{i.due_date ? fmtDate(i.due_date) : "—"}</TableCell>
                      <TableCell className="text-xs">{i.description}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${i.status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{i.status === "paid" ? "Оплачено" : "Очікує"}</span></TableCell>
                      <TableCell className="text-right font-semibold text-sm">{fmtCur(i.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CASHBOX ─────────────────────────────────────────────────────────────────
function CashboxTab() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState({ balance: "0", name: "Каса №1" });
  const [closeForm, setCloseForm] = useState({ balance: "", notes: "" });
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["cashbox"], queryFn: () => apiFetch("cashbox"), staleTime: 10_000,
  });

  const openMut = useMutation({
    mutationFn: (body: any) => apiFetch("cashbox/open", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cashbox"] }); setOpenDialog(false); },
    onError: (e: any) => alert(e?.message || "Помилка відкриття каси"),
  });

  const closeMut = useMutation({
    mutationFn: ({ id, body }: any) => apiFetch(`cashbox/${id}/close`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cashbox"] }); setCloseDialog(false); },
  });

  const active = data?.activeSession;
  const sessions = data?.sessions || [];
  const STATUS_COLORS_CB: Record<string, string> = { open: "bg-green-100 text-green-700", closed: "bg-gray-100 text-gray-500" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Каса / Термінал</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" />Оновити</Button>
          {!active ? (
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild><Button><Unlock className="h-4 w-4 mr-1" />Відкрити касу</Button></DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Відкрити кассову зміну</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="text-xs">Назва каси</Label><Input value={openForm.name} onChange={e => setOpenForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label className="text-xs">Початковий залишок ₴</Label><Input type="number" value={openForm.balance} onChange={e => setOpenForm(f => ({ ...f, balance: e.target.value }))} /></div>
                  <Button className="w-full" onClick={() => openMut.mutate({ cashboxName: openForm.name, openingBalance: parseFloat(openForm.balance) || 0 })} disabled={openMut.isPending}>
                    {openMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Відкрити зміну
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
              <DialogTrigger asChild><Button variant="destructive"><Lock className="h-4 w-4 mr-1" />Закрити касу</Button></DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Закрити кассову зміну</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Відкрито:</span><span>{fmtDateTime(active.opened_at)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Каса:</span><span>{active.cashbox_name}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Початок:</span><span>{fmtCur(active.opening_balance)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Надходження:</span><span className="text-green-600">+{fmtCur(active.cash_in)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Видатки:</span><span className="text-red-600">-{fmtCur(active.cash_out)}</span></div>
                  </div>
                  <div><Label className="text-xs">Фактичний залишок ₴</Label><Input type="number" value={closeForm.balance} onChange={e => setCloseForm(f => ({ ...f, balance: e.target.value }))} /></div>
                  <div><Label className="text-xs">Примітки</Label><Input value={closeForm.notes} onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))} /></div>
                  <Button variant="destructive" className="w-full" onClick={() => closeMut.mutate({ id: active.id, body: { closingBalance: parseFloat(closeForm.balance) || undefined, notes: closeForm.notes } })} disabled={closeMut.isPending}>
                    {closeMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Закрити зміну
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {active && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" /><span className="font-semibold text-green-800">Каса відкрита</span></div>
          <div><p className="text-xs text-green-600">Каса</p><p className="font-medium">{active.cashbox_name}</p></div>
          <div><p className="text-xs text-green-600">Касир</p><p className="font-medium">{active.cashier_name || "—"}</p></div>
          <div><p className="text-xs text-green-600">Відкрито</p><p className="font-medium">{fmtDateTime(active.opened_at)}</p></div>
          <div><p className="text-xs text-green-600">Надходження</p><p className="font-medium text-green-700">+{fmtCur(active.cash_in)}</p></div>
          <div><p className="text-xs text-green-600">Видатки</p><p className="font-medium text-red-600">-{fmtCur(active.cash_out)}</p></div>
          <div className="ml-auto"><p className="text-xs text-green-600">Залишок (розр.)</p><p className="text-xl font-bold text-green-800">{fmtCur(parseFloat(active.opening_balance||0) + parseFloat(active.cash_in||0) - parseFloat(active.cash_out||0))}</p></div>
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">Зміни</div>
          <Table>
            <TableHeader><TableRow className="text-xs"><TableHead>Дата/Час</TableHead><TableHead>Каса</TableHead><TableHead>Касир</TableHead><TableHead>Статус</TableHead><TableHead className="text-right">Початок</TableHead><TableHead className="text-right">+Надх.</TableHead><TableHead className="text-right">-Видатки</TableHead><TableHead className="text-right">Залишок</TableHead><TableHead className="text-right">Розбіжність</TableHead></TableRow></TableHeader>
            <TableBody>
              {sessions.map((s: any) => (
                <TableRow key={s.id} className="hover:bg-gray-50">
                  <TableCell className="text-xs">{fmtDateTime(s.opened_at)}{s.closed_at ? <><br/><span className="text-gray-400">→ {fmtDateTime(s.closed_at)}</span></> : null}</TableCell>
                  <TableCell className="text-sm font-medium">{s.cashbox_name}</TableCell>
                  <TableCell className="text-xs text-gray-600">{s.cashier_name || "—"}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS_CB[s.status] || "bg-gray-100 text-gray-500"}`}>{s.status === "open" ? "Відкрита" : "Закрита"}</span></TableCell>
                  <TableCell className="text-right text-sm">{fmtCur(s.opening_balance)}</TableCell>
                  <TableCell className="text-right text-sm text-green-600">+{fmtCur(s.cash_in)}</TableCell>
                  <TableCell className="text-right text-sm text-red-600">-{fmtCur(s.cash_out)}</TableCell>
                  <TableCell className="text-right font-semibold">{s.closing_balance != null ? fmtCur(s.closing_balance) : "—"}</TableCell>
                  <TableCell className={`text-right text-sm font-semibold ${parseFloat(s.discrepancy || 0) !== 0 ? "text-red-600" : "text-gray-400"}`}>{s.discrepancy != null ? (parseFloat(s.discrepancy) >= 0 ? "+" : "") + fmtCur(Math.abs(parseFloat(s.discrepancy))) : "—"}</TableCell>
                </TableRow>
              ))}
              {!sessions.length && <TableRow><TableCell colSpan={9} className="text-center text-xs text-gray-400 py-8">Немає кассових змін</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── REFUNDS ─────────────────────────────────────────────────────────────────
function RefundsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ bookingRef: "", paymentId: "", amount: "", reason: "", refundMethod: "cash" });

  const { data, isLoading } = useQuery({
    queryKey: ["refund-requests", filter],
    queryFn: () => apiFetch(`refund-requests${filter ? `?status=${filter}` : ""}`), staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch("refund-requests", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["refund-requests"] }); setNewOpen(false); setForm({ bookingRef: "", paymentId: "", amount: "", reason: "", refundMethod: "cash" }); },
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action, notes }: any) => apiFetch(`refund-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action, notes }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["refund-requests"] }),
  });

  const requests = data?.requests || [];
  const STATUS_CFG: Record<string, { label: string; color: string }> = {
    pending:   { label: "Очікує",    color: "bg-amber-100 text-amber-700" },
    approved:  { label: "Схвалено",  color: "bg-blue-100 text-blue-700" },
    rejected:  { label: "Відхилено", color: "bg-red-100 text-red-700" },
    processed: { label: "Виконано",  color: "bg-green-100 text-green-700" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Запити на повернення</h2>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {["pending","approved","processed","rejected"].map(s => (
              <button key={s} onClick={() => setFilter(s)} className={`text-xs px-3 py-1 rounded-md transition-colors ${filter === s ? "bg-white shadow text-indigo-600 font-medium" : "text-gray-500"}`}>
                {STATUS_CFG[s]?.label}
              </button>
            ))}
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Запит</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Новий запит на повернення</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">ID платежу (опціонально)</Label><Input type="number" value={form.paymentId} onChange={e => setForm(f => ({ ...f, paymentId: e.target.value }))} /></div>
                <div><Label className="text-xs">Сума ₴ *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
                <div>
                  <Label className="text-xs">Метод повернення</Label>
                  <Select value={form.refundMethod} onValueChange={v => setForm(f => ({ ...f, refundMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Готівка</SelectItem>
                      <SelectItem value="card">Картка</SelectItem>
                      <SelectItem value="bank_transfer">Банківський переказ</SelectItem>
                      <SelectItem value="liqpay">LiqPay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Причина *</Label><Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} /></div>
                <Button className="w-full" onClick={() => createMut.mutate({ paymentId: form.paymentId ? parseInt(form.paymentId) : undefined, amount: parseFloat(form.amount), reason: form.reason, refundMethod: form.refundMethod })} disabled={!form.amount || !form.reason || createMut.isPending}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Надіслати запит
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 text-xs">
                <TableHead>Дата</TableHead><TableHead>Бронювання</TableHead><TableHead>Гість</TableHead>
                <TableHead>Причина</TableHead><TableHead>Метод</TableHead><TableHead>Запитав</TableHead>
                <TableHead className="text-right">Сума ₴</TableHead><TableHead>Статус</TableHead><TableHead>Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r: any) => {
                const cfg = STATUS_CFG[r.status] || { label: r.status, color: "bg-gray-100 text-gray-500" };
                return (
                  <TableRow key={r.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs">{fmtDateTime(r.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.booking_ref || "—"}</TableCell>
                    <TableCell className="text-xs">{r.guest_name || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={r.reason}>{r.reason}</TableCell>
                    <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${METHOD_COLORS[r.refund_method] || "bg-gray-100 text-gray-600"}`}>{METHOD_LABELS[r.refund_method] || r.refund_method}</span></TableCell>
                    <TableCell className="text-xs text-gray-500">{r.requested_by_name || "—"}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">{fmtCur(r.amount)}</TableCell>
                    <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.status === "pending" && <>
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => actionMut.mutate({ id: r.id, action: "approve" })}>Схвалити</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => actionMut.mutate({ id: r.id, action: "reject" })}>Відхилити</Button>
                        </>}
                        {r.status === "approved" && r.payment_id &&
                          <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => actionMut.mutate({ id: r.id, action: "process" })}>Виконати</Button>
                        }
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!requests.length && <TableRow><TableCell colSpan={9} className="text-center text-xs text-gray-400 py-8">Немає заявок зі статусом «{STATUS_CFG[filter]?.label}»</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── REVENUE BY ENTITY ───────────────────────────────────────────────────────
function RevenueByEntitySection() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finance", "by-entity", from, to],
    queryFn: () => apiFetch(`by-entity?from=${from}&to=${to}`),
    staleTime: 60_000,
  });

  const byEntity: any[] = data?.byEntity || [];
  const summary: any = data?.summary || {};
  const grandTotal = summary.totalAmount || 0;

  const typeLabel = (type: string) => type === "tov" ? "ТОВ" : type === "fop" ? "ФОП" : type?.toUpperCase() || "";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-600" />
          <h3 className="font-semibold text-gray-900 text-sm">Виручка по юридичних особах</h3>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <span className="text-xs text-gray-400">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <button onClick={() => refetch()} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-500" /></div>
      ) : byEntity.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">Немає даних за обраний період</div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs">
            <div><span className="text-gray-400">Загально: </span><span className="font-bold text-gray-900">{fmtCur(grandTotal)}</span></div>
            <div><span className="text-gray-400">Оплачено: </span><span className="font-bold text-emerald-700">{fmtCur(summary.paidAmount || 0)}</span></div>
            <div><span className="text-gray-400">Залишок: </span><span className="font-bold text-amber-600">{fmtCur(summary.outstandingAmount || 0)}</span></div>
            <div><span className="text-gray-400">Збирання: </span><span className="font-bold text-indigo-600">{summary.collectionRate || 0}%</span></div>
          </div>

          {/* Entity rows */}
          <div className="divide-y divide-gray-100">
            {byEntity.map((e: any) => {
              const share = grandTotal > 0 ? (e.totalAmount / grandTotal) * 100 : 0;
              return (
                <div key={e.entityId} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="font-semibold text-sm text-gray-900 truncate block">{e.entityName}</span>
                        <span className="text-xs text-gray-400">{typeLabel(e.entityType)} · {e.invoiceCount} рахунків</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="font-bold text-gray-900 text-sm">{fmtCur(e.totalAmount)}</div>
                      <div className="text-xs text-gray-400">{share.toFixed(1)}% від загального</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-200 rounded-full relative">
                        <div
                          className="absolute inset-y-0 left-0 bg-indigo-600 rounded-full transition-all"
                          style={{ width: `${e.collectionRate}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs flex-shrink-0">
                      <span className="text-emerald-700 font-medium">{fmtCur(e.paidAmount)} оплачено</span>
                      {e.outstandingAmount > 0 && (
                        <span className="text-amber-600">{fmtCur(e.outstandingAmount)} залишок</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── LEGAL ENTITIES ───────────────────────────────────────────────────────────
function LegalEntitiesTab() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [editEntity, setEditEntity] = useState<any>(null);
  const [form, setForm] = useState({ name: "", type: "fop", edrpou: "", iban: "", bank: "", mfo: "", ipn: "", vatNumber: "", isVatPayer: false, director: "", accountant: "", address: "", liqpayPublicKey: "", liqpayPrivateKey: "" });

  const { data, isLoading } = useQuery({ queryKey: ["legal-entities-fin"], queryFn: () => apiFetch("legal-entities"), staleTime: 30_000 });

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch("legal-entities", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["legal-entities-fin"] }); setNewOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: any) => apiFetch(`legal-entities/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["legal-entities-fin"] }); setEditEntity(null); },
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: number) => apiFetch(`legal-entities/${id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["legal-entities-fin"] }),
  });

  const entities = data?.entities || [];
  const TYPES: Record<string, string> = { tov: "ТОВ", fop: "ФОП", pp: "ПП", other: "Інше" };

  const EntityForm = ({ value, onChange, onSave, loading }: any) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label className="text-xs">Назва *</Label><Input value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} /></div>
        <div>
          <Label className="text-xs">Тип</Label>
          <Select value={value.type} onValueChange={v => onChange({ ...value, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">ЄДРПОУ</Label><Input value={value.edrpou} onChange={e => onChange({ ...value, edrpou: e.target.value })} /></div>
        <div><Label className="text-xs">ІПН (для ФОП)</Label><Input value={value.ipn} onChange={e => onChange({ ...value, ipn: e.target.value })} /></div>
        <div><Label className="text-xs">IBAN</Label><Input value={value.iban} onChange={e => onChange({ ...value, iban: e.target.value })} /></div>
        <div><Label className="text-xs">Банк</Label><Input value={value.bank} onChange={e => onChange({ ...value, bank: e.target.value })} /></div>
        <div><Label className="text-xs">МФО</Label><Input value={value.mfo} onChange={e => onChange({ ...value, mfo: e.target.value })} /></div>
        <div><Label className="text-xs">Директор</Label><Input value={value.director} onChange={e => onChange({ ...value, director: e.target.value })} /></div>
        <div><Label className="text-xs">Бухгалтер</Label><Input value={value.accountant} onChange={e => onChange({ ...value, accountant: e.target.value })} /></div>
        <div className="col-span-2"><Label className="text-xs">Адреса</Label><Input value={value.address} onChange={e => onChange({ ...value, address: e.target.value })} /></div>
        <div className="col-span-2 border-t pt-3"><p className="text-xs font-semibold text-gray-600 mb-2">LiqPay інтеграція</p></div>
        <div className="col-span-2"><Label className="text-xs">Public Key</Label><Input value={value.liqpayPublicKey} onChange={e => onChange({ ...value, liqpayPublicKey: e.target.value })} /></div>
        <div className="col-span-2"><Label className="text-xs">Private Key</Label><Input type="password" value={value.liqpayPrivateKey} onChange={e => onChange({ ...value, liqpayPrivateKey: e.target.value })} /></div>
      </div>
      <Button className="w-full" onClick={onSave} disabled={!value.name || loading}>
        {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Зберегти
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Юридичні особи</h2>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Додати юр. особу</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Нова юридична особа</DialogTitle></DialogHeader>
            <EntityForm value={form} onChange={setForm} loading={createMut.isPending} onSave={() => createMut.mutate(form)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {entities.map((e: any) => (
            <div key={e.id} className={`bg-white border-2 rounded-xl p-5 ${e.is_default ? "border-indigo-400" : "border-gray-200"}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{e.name}</p>
                    {e.is_default && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">За замовчуванням</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{TYPES[e.type] || e.type} · ЄДРПОУ: {e.edrpou || "—"}</p>
                </div>
                <div className="flex gap-1">
                  {!e.is_default && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDefaultMut.mutate(e.id)}>Зробити основним</Button>}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditEntity(e); setForm({ name: e.name, type: e.type, edrpou: e.edrpou || "", iban: e.iban || "", bank: e.bank || "", mfo: e.mfo || "", ipn: e.ipn || "", vatNumber: e.vat_number || "", isVatPayer: e.is_vat_payer, director: e.director || "", accountant: e.accountant || "", address: e.address || "", liqpayPublicKey: e.liqpay_public_key || "", liqpayPrivateKey: "" }); }}>Редагувати</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                {e.iban && <div className="col-span-2"><span className="text-gray-400">IBAN: </span>{e.iban}</div>}
                {e.bank && <div><span className="text-gray-400">Банк: </span>{e.bank}</div>}
                {e.mfo && <div><span className="text-gray-400">МФО: </span>{e.mfo}</div>}
                {e.director && <div><span className="text-gray-400">Директор: </span>{e.director}</div>}
                {e.accountant && <div><span className="text-gray-400">Бухгалтер: </span>{e.accountant}</div>}
              </div>
              <div className="mt-3 pt-3 border-t flex justify-between text-xs text-gray-500">
                <span>Платежів: <b className="text-gray-800">{e.payments_count || 0}</b></span>
                <span>Зібрано: <b className="text-indigo-700">{fmtCur(e.total_collected || 0)}</b></span>
                <span className={`${e.liqpay_public_key ? "text-green-600" : "text-gray-300"}`}>{e.liqpay_public_key ? "✓ LiqPay" : "○ LiqPay"}</span>
              </div>
            </div>
          ))}
          {!entities.length && <div className="col-span-2 text-center py-12 text-gray-400 text-sm">Ще немає юридичних осіб</div>}
        </div>
      )}

      {/* ── Revenue by Legal Entity ─────────────────────────────────────── */}
      <RevenueByEntitySection />

      {editEntity && (
        <Dialog open={!!editEntity} onOpenChange={() => setEditEntity(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Редагувати: {editEntity.name}</DialogTitle></DialogHeader>
            <EntityForm value={form} onChange={setForm} loading={updateMut.isPending} onSave={() => updateMut.mutate({ id: editEntity.id, body: form })} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── SETTINGS (Revenue, Business Units, Tax, Export) ─────────────────────────
function SettingsTab() {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<"revenue" | "units" | "tax" | "export">("revenue");
  const [revForm, setRevForm] = useState({ name: "", code: "", type: "accommodation", vatRate: "20" });
  const [unitForm, setUnitForm] = useState({ name: "", code: "", type: "department" });
  const [taxForm, setTaxForm] = useState({ name: "", code: "", rate: "20", type: "vat", appliesTo: "all" });
  const [exportParams, setExportParams] = useState({ from: "", to: "", type: "payments", format: "json" });

  const { data: revCats } = useQuery({ queryKey: ["revenue-cats"], queryFn: () => apiFetch("revenue-categories"), staleTime: 60_000 });
  const { data: bizUnits } = useQuery({ queryKey: ["biz-units"], queryFn: () => apiFetch("business-units"), staleTime: 60_000 });
  const { data: taxCats } = useQuery({ queryKey: ["tax-cats"], queryFn: () => apiFetch("tax-categories"), staleTime: 60_000 });

  const addRevMut = useMutation({ mutationFn: (b: any) => apiFetch("revenue-categories", { method: "POST", body: JSON.stringify(b) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["revenue-cats"] }); setRevForm({ name: "", code: "", type: "accommodation", vatRate: "20" }); } });
  const addUnitMut = useMutation({ mutationFn: (b: any) => apiFetch("business-units", { method: "POST", body: JSON.stringify(b) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["biz-units"] }); setUnitForm({ name: "", code: "", type: "department" }); } });
  const addTaxMut = useMutation({ mutationFn: (b: any) => apiFetch("tax-categories", { method: "POST", body: JSON.stringify(b) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax-cats"] }); setTaxForm({ name: "", code: "", rate: "20", type: "vat", appliesTo: "all" }); } });

  const handleExport = async () => {
    const url = `${API_BASE}/api/finance/export?from=${exportParams.from}&to=${exportParams.to}&type=${exportParams.type}&format=${exportParams.format}`;
    if (exportParams.format === "csv") {
      const a = document.createElement("a");
      a.href = url + `&token=${token()}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
      const blob = await resp.blob();
      const bUrl = URL.createObjectURL(blob);
      a.href = bUrl; a.download = `finance-${exportParams.type}.csv`; a.click(); URL.revokeObjectURL(bUrl);
    } else {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      alert(`Експортовано ${d.count} записів`);
    }
  };

  const REV_TYPES = { accommodation: "Проживання", restaurant: "Ресторан", spa: "СПА", rental: "Оренда", events: "Події", other: "Інше" };
  const UNIT_TYPES = { department: "Відділ", property: "Об'єкт", outlet: "Торгова точка", costcenter: "Центр витрат" };
  const TAX_TYPES = { vat: "ПДВ", excise: "Акциз", tourism_levy: "Туристичний збір", exempt: "Звільнений" };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(["revenue", "units", "tax", "export"] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} className={`px-4 py-1.5 text-sm rounded-md transition-colors ${subTab === t ? "bg-white shadow font-medium text-indigo-600" : "text-gray-500"}`}>
            {t === "revenue" ? "Категорії доходів" : t === "units" ? "Бізнес-юніти" : t === "tax" ? "Категорії ПДВ" : "Експорт"}
          </button>
        ))}
      </div>

      {subTab === "revenue" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Tag className="h-4 w-4 text-indigo-600" />Додати категорію доходів</h3>
            <div><Label className="text-xs">Назва *</Label><Input value={revForm.name} onChange={e => setRevForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Код</Label><Input value={revForm.code} onChange={e => setRevForm(f => ({ ...f, code: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={revForm.type} onValueChange={v => setRevForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REV_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ставка ПДВ</Label>
              <Select value={revForm.vatRate} onValueChange={v => setRevForm(f => ({ ...f, vatRate: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">0%</SelectItem><SelectItem value="7">7%</SelectItem><SelectItem value="20">20%</SelectItem></SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => addRevMut.mutate(revForm)} disabled={!revForm.name || addRevMut.isPending}>
              {addRevMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Додати
            </Button>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">Категорії ({(revCats?.categories || []).length})</div>
            <div className="divide-y">
              {(revCats?.categories || []).map((c: any) => (
                <div key={c.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-gray-400">{REV_TYPES[c.type as keyof typeof REV_TYPES] || c.type} · ПДВ {c.vat_rate}%{c.code ? ` · ${c.code}` : ""}</p>
                  </div>
                </div>
              ))}
              {!(revCats?.categories || []).length && <p className="text-center text-xs text-gray-400 py-6">Немає категорій</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === "units" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Package className="h-4 w-4 text-indigo-600" />Додати бізнес-юніт</h3>
            <div><Label className="text-xs">Назва *</Label><Input value={unitForm.name} onChange={e => setUnitForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Код</Label><Input value={unitForm.code} onChange={e => setUnitForm(f => ({ ...f, code: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={unitForm.type} onValueChange={v => setUnitForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(UNIT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => addUnitMut.mutate(unitForm)} disabled={!unitForm.name || addUnitMut.isPending}>
              {addUnitMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Додати
            </Button>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">Бізнес-юніти ({(bizUnits?.units || []).length})</div>
            <div className="divide-y">
              {(bizUnits?.units || []).map((u: any) => (
                <div key={u.id} className="px-4 py-2.5 hover:bg-gray-50">
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-gray-400">{UNIT_TYPES[u.type as keyof typeof UNIT_TYPES] || u.type}{u.code ? ` · ${u.code}` : ""}{u.property_name ? ` · ${u.property_name}` : ""}</p>
                </div>
              ))}
              {!(bizUnits?.units || []).length && <p className="text-center text-xs text-gray-400 py-6">Немає бізнес-юнітів</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === "tax" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><List className="h-4 w-4 text-indigo-600" />Додати категорію ПДВ</h3>
            <div><Label className="text-xs">Назва *</Label><Input value={taxForm.name} onChange={e => setTaxForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Код</Label><Input value={taxForm.code} onChange={e => setTaxForm(f => ({ ...f, code: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={taxForm.type} onValueChange={v => setTaxForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TAX_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Ставка %</Label><Input type="number" value={taxForm.rate} onChange={e => setTaxForm(f => ({ ...f, rate: e.target.value }))} /></div>
            <Button className="w-full" onClick={() => addTaxMut.mutate(taxForm)} disabled={!taxForm.name || addTaxMut.isPending}>
              {addTaxMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Додати
            </Button>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">Категорії ПДВ ({(taxCats?.categories || []).length})</div>
            <div className="divide-y">
              {(taxCats?.categories || []).map((c: any) => (
                <div key={c.id} className="px-4 py-2.5 hover:bg-gray-50">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-400">{TAX_TYPES[c.type as keyof typeof TAX_TYPES] || c.type} · {c.rate}%{c.code ? ` · ${c.code}` : ""}</p>
                </div>
              ))}
              {!(taxCats?.categories || []).length && <p className="text-center text-xs text-gray-400 py-6">Немає категорій ПДВ</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === "export" && (
        <div className="max-w-lg bg-white border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Download className="h-4 w-4 text-indigo-600" />Експорт до бухгалтерії</h3>
          <div>
            <Label className="text-xs">Тип даних</Label>
            <Select value={exportParams.type} onValueChange={v => setExportParams(p => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payments">Платежі</SelectItem>
                <SelectItem value="invoices">Рахунки</SelectItem>
                <SelectItem value="folio">Фоліо</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Від</Label><Input type="date" value={exportParams.from} onChange={e => setExportParams(p => ({ ...p, from: e.target.value }))} /></div>
            <div><Label className="text-xs">До</Label><Input type="date" value={exportParams.to} onChange={e => setExportParams(p => ({ ...p, to: e.target.value }))} /></div>
          </div>
          <div>
            <Label className="text-xs">Формат</Label>
            <Select value={exportParams.format} onValueChange={v => setExportParams(p => ({ ...p, format: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="csv">CSV (Excel)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full gradient-primary text-white" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Експортувати
          </Button>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <p className="font-semibold mb-1">Підтримувані системи:</p>
            <div className="grid grid-cols-3 gap-1">
              {["MEDoc", "Вчасно", "BAS/1C", "Клієнт-Банк", "Google Sheets", "Power BI"].map(s => (
                <span key={s} className="bg-blue-100 rounded px-1.5 py-0.5">{s}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
