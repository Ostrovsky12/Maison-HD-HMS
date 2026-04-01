import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Home, FileText, CreditCard, Wrench, Plus, CheckCircle2, AlertCircle,
  Clock, XCircle, ChevronRight, Phone, Mail, Calendar, TrendingUp,
  Building2, User, AlertTriangle, MoreHorizontal,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/maison-hd";
const API = BASE.replace("/maison-hd", "") + "/api/rentals";
const token = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(API + path, { ...opts, headers: { "Authorization": `Bearer ${token()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const MONTHS_UA = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];

const CONTRACT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "Активний", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  upcoming: { label: "Майбутній", color: "bg-blue-100 text-blue-700", icon: Clock },
  ended: { label: "Завершений", color: "bg-gray-100 text-gray-500", icon: XCircle },
  terminated: { label: "Розірваний", color: "bg-red-100 text-red-600", icon: XCircle },
};
const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Очікує", color: "bg-yellow-100 text-yellow-700" },
  paid: { label: "Оплачено", color: "bg-green-100 text-green-700" },
  overdue: { label: "Прострочено", color: "bg-red-100 text-red-600" },
  cancelled: { label: "Скасовано", color: "bg-gray-100 text-gray-500" },
};
const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: "Терміново", color: "bg-red-100 text-red-600" },
  medium: { label: "Середній", color: "bg-yellow-100 text-yellow-700" },
  low: { label: "Низький", color: "bg-gray-100 text-gray-500" },
};
const REQUEST_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Відкрито", color: "bg-orange-100 text-orange-700" },
  in_progress: { label: "В роботі", color: "bg-blue-100 text-blue-700" },
  resolved: { label: "Вирішено", color: "bg-green-100 text-green-700" },
};

const TABS = [
  { id: "contracts", label: "Договори", icon: FileText },
  { id: "payments", label: "Платежі", icon: CreditCard },
  { id: "requests", label: "Заявки", icon: Wrench },
];

export default function RentalsPage() {
  const [tab, setTab] = useState("contracts");
  const [stats, setStats] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const { toast } = useToast();

  const loadStats = async () => { const r = await apiFetch("/stats"); if (r.ok) setStats(await r.json()); };
  const loadContracts = async () => { const r = await apiFetch("/contracts"); if (r.ok) { const d = await r.json(); setContracts(d.contracts || []); } };
  const loadPayments = async (filter?: string) => {
    const f = filter || paymentFilter;
    const r = await apiFetch("/payments");
    if (r.ok) {
      const d = await r.json();
      const all = d.payments || [];
      setPayments(f === "all" ? all : all.filter((p: any) => p.status === f));
    }
  };
  const loadRequests = async () => { const r = await apiFetch("/requests"); if (r.ok) { const d = await r.json(); setRequests(d.requests || []); } };

  useEffect(() => { loadStats(); loadContracts(); loadPayments(); loadRequests(); }, []);

  const markPaymentPaid = async (id: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await apiFetch(`/payments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "paid", paidDate: today, paymentMethod: "bank_transfer" }) });
    if (r.ok) { toast({ title: "✅ Оплату зафіксовано" }); loadPayments(); loadStats(); }
  };

  const resolveRequest = async (id: number) => {
    const r = await apiFetch(`/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
    if (r.ok) { toast({ title: "✅ Заявку вирішено" }); loadRequests(); loadStats(); }
  };

  const startRequest = async (id: number) => {
    const r = await apiFetch(`/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) });
    if (r.ok) { toast({ title: "🔧 Взято в роботу" }); loadRequests(); }
  };

  const terminateContract = async (id: number) => {
    if (!confirm("Розірвати договір?")) return;
    const r = await apiFetch(`/contracts/${id}`, { method: "PATCH", body: JSON.stringify({ status: "terminated" }) });
    if (r.ok) { toast({ title: "Договір розірвано" }); loadContracts(); loadStats(); }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Home className="h-7 w-7 text-emerald-600" />Оренда</h1>
            <p className="text-gray-500 text-sm">Довгострокові договори оренди, платежі та заявки мешканців</p>
          </div>
          {tab === "contracts" && (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-2" />Новий договір
            </Button>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Активних договорів</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.activeContracts}</p>
              <p className="text-xs text-gray-400">з {stats.totalContracts} загалом</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Щомісячна виручка</p>
              <p className="text-2xl font-bold text-blue-600">{stats.monthlyRevenue?.toLocaleString()} ₴</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Прострочених платежів</p>
              <p className="text-2xl font-bold text-red-600">{stats.overduePayments}</p>
              <p className="text-xs text-gray-400">Очікує: {stats.pendingPayments}</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <p className="text-xs text-gray-500">Відкритих заявок</p>
              <p className="text-2xl font-bold text-orange-600">{stats.openRequests}</p>
              {stats.urgentRequests > 0 && <p className="text-xs text-red-500">⚠ Термінових: {stats.urgentRequests}</p>}
            </CardContent></Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ── CONTRACTS TAB ── */}
        {tab === "contracts" && (
          <div className="space-y-3">
            {contracts.map(c => {
              const cfg = CONTRACT_STATUS_CONFIG[c.status] || CONTRACT_STATUS_CONFIG.ended;
              const Icon = cfg.icon;
              return (
                <Card key={c.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.status === "active" ? "bg-emerald-100" : "bg-gray-100"}`}>
                        <Icon className={`h-5 w-5 ${c.status === "active" ? "text-emerald-600" : "text-gray-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{c.tenantName}</span>
                          <Badge className={cfg.color}>{cfg.label}</Badge>
                          {c.contractNumber && <span className="text-xs text-gray-400">{c.contractNumber}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{c.unitName} · {c.unitCategory}</span>
                          {c.tenantPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.tenantPhone}</span>}
                          {c.tenantEmail && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.tenantEmail}</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                          <span className="flex items-center gap-1 text-gray-500"><Calendar className="h-3 w-3" />{c.startDate} → {c.endDate || "безстроково"}</span>
                          <span className="font-bold text-emerald-600">{parseFloat(c.monthlyRate).toLocaleString()} ₴/міс</span>
                          <span className={`${c.depositPaid ? "text-green-600" : "text-orange-500"}`}>
                            Депозит: {parseFloat(c.depositAmount || 0).toLocaleString()} ₴ {c.depositPaid ? "✓" : "не сплачено"}
                          </span>
                        </div>
                        {c.notes && <p className="text-xs text-gray-400 mt-1 italic">{c.notes}</p>}
                      </div>
                      {c.status === "active" && (
                        <Button variant="ghost" size="sm" className="h-8 text-red-400 hover:bg-red-50 text-xs flex-shrink-0"
                          onClick={() => terminateContract(c.id)}>Розірвати</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {contracts.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Home className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Договорів оренди немає</p>
                <Button className="mt-3" variant="outline" onClick={() => setShowNew(true)}>Додати перший договір</Button>
              </div>
            )}
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {tab === "payments" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); loadPayments(v); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі</SelectItem>
                  <SelectItem value="overdue">⚠ Прострочені</SelectItem>
                  <SelectItem value="pending">🕐 Очікують</SelectItem>
                  <SelectItem value="paid">✅ Сплачені</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payments.length === 0 ? (
              <div className="text-center py-10 text-gray-400">Платежів не знайдено</div>
            ) : (
              <div className="space-y-2">
                {payments.map(p => {
                  const pcfg = PAYMENT_STATUS_CONFIG[p.status] || PAYMENT_STATUS_CONFIG.pending;
                  return (
                    <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${p.status === "overdue" ? "border-red-200 bg-red-50" : p.status === "paid" ? "border-green-100 bg-green-50" : "border-gray-200 bg-white"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{p.tenantName}</span>
                          <Badge className={pcfg.color + " text-xs"}>{pcfg.label}</Badge>
                          <span className="text-xs text-gray-500">{MONTHS_UA[(p.periodMonth || 1) - 1]} {p.periodYear}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          <span>{p.unitName}</span>
                          <span>До {p.dueDate}</span>
                          {p.paidDate && <span className="text-green-600">Сплачено {p.paidDate}</span>}
                        </div>
                      </div>
                      <span className={`font-bold text-sm ${p.status === "overdue" ? "text-red-600" : p.status === "paid" ? "text-green-600" : "text-gray-800"}`}>
                        {parseFloat(p.amount).toLocaleString()} ₴
                      </span>
                      {(p.status === "pending" || p.status === "overdue") && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs" onClick={() => markPaymentPaid(p.id)}>
                          Позначити сплаченим
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── REQUESTS TAB ── */}
        {tab === "requests" && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="text-center py-10 text-gray-400">Заявок немає</div>
            ) : (
              requests.map(r => {
                const pcfg = PRIORITY_CONFIG[r.priority || "medium"];
                const scfg = REQUEST_STATUS_CONFIG[r.status || "open"];
                return (
                  <Card key={r.id} className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${r.priority === "high" ? "bg-red-100" : r.priority === "medium" ? "bg-yellow-100" : "bg-gray-100"}`}>
                          <Wrench className={`h-4 w-4 ${r.priority === "high" ? "text-red-500" : r.priority === "medium" ? "text-yellow-600" : "text-gray-400"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{r.title}</span>
                            <Badge className={pcfg.color + " text-xs"}>{pcfg.label}</Badge>
                            <Badge className={scfg.color + " text-xs"}>{scfg.label}</Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{r.tenantName} · {r.unitName}</div>
                          {r.description && <p className="text-xs text-gray-600 mt-1">{r.description}</p>}
                          <p className="text-xs text-gray-400 mt-1">{new Date(r.createdAt).toLocaleDateString("uk")}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {r.status === "open" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startRequest(r.id)}>🔧 В роботу</Button>
                          )}
                          {r.status !== "resolved" && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => resolveRequest(r.id)}>✓ Вирішено</Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* New Contract Dialog */}
      <NewContractDialog open={showNew} onClose={() => setShowNew(false)}
        onSave={async (data: any) => {
          const r = await apiFetch("/contracts", { method: "POST", body: JSON.stringify(data) });
          if (r.ok) { toast({ title: "Договір створено" }); setShowNew(false); loadContracts(); loadStats(); }
          else { const e = await r.json(); toast({ title: "Помилка", description: e.error, variant: "destructive" }); }
        }} />
    </AppLayout>
  );
}

// ── New Contract Dialog ──────────────────────────────────────────────────────
function NewContractDialog({ open, onClose, onSave }: any) {
  const [form, setForm] = useState({ unitId: "", tenantName: "", tenantEmail: "", tenantPhone: "", tenantPassport: "", startDate: "", endDate: "", monthlyRate: "", depositAmount: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const f = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const handleSubmit = async () => {
    if (!form.unitId || !form.tenantName || !form.startDate || !form.monthlyRate) return;
    setLoading(true); await onSave(form); setLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-600" />Новий договір оренди</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>ID номера / об'єкта *</Label><Input placeholder="ID юніту" value={form.unitId} onChange={e => f("unitId")(e.target.value)} /></div>
          <div><Label>ПІБ орендаря *</Label><Input placeholder="Петренко Михайло Вікторович" value={form.tenantName} onChange={e => f("tenantName")(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.tenantEmail} onChange={e => f("tenantEmail")(e.target.value)} /></div>
            <div><Label>Телефон</Label><Input value={form.tenantPhone} onChange={e => f("tenantPhone")(e.target.value)} /></div>
          </div>
          <div><Label>Паспорт</Label><Input placeholder="АА123456" value={form.tenantPassport} onChange={e => f("tenantPassport")(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Дата початку *</Label><Input type="date" value={form.startDate} onChange={e => f("startDate")(e.target.value)} /></div>
            <div><Label>Дата закінчення</Label><Input type="date" value={form.endDate} onChange={e => f("endDate")(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Щомісячна оплата ₴ *</Label><Input type="number" placeholder="8500" value={form.monthlyRate} onChange={e => f("monthlyRate")(e.target.value)} /></div>
            <div><Label>Депозит ₴</Label><Input type="number" placeholder="17000" value={form.depositAmount} onChange={e => f("depositAmount")(e.target.value)} /></div>
          </div>
          <div><Label>Примітки</Label><Textarea rows={2} value={form.notes} onChange={e => f("notes")(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={loading || !form.tenantName || !form.startDate}>
            {loading ? "…" : "Створити договір"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
