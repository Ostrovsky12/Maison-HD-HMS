import { useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  FileText, Plus, Building2, Users, Settings, BarChart3,
  CheckCircle2, Clock, AlertCircle, XCircle, Download, Upload,
  Send, Pen, CreditCard, Search, RefreshCw, ChevronRight, Loader2,
  FileCheck, FileX, Link2, Unlink, Landmark, Receipt, Scale,
  FileClock, FileWarning,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Helper hooks ─────────────────────────────────────────────────────────────
function useAccounting(path: string) {
  return useQuery({
    queryKey: ["accounting", path],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${API_BASE}/api/accounting/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json();
    },
    staleTime: 30_000,
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd.MM.yyyy", { locale: uk }); } catch { return d; }
};
const fmtNum = (n: number | string | null | undefined) =>
  n ? new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) : "0,00";

const DOC_TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  contract:      { label: "Договір",          icon: FileText,    color: "bg-blue-100 text-blue-800" },
  invoice:       { label: "Рахунок",          icon: Receipt,     color: "bg-emerald-100 text-emerald-800" },
  act:           { label: "Акт",              icon: FileCheck,   color: "bg-violet-100 text-violet-800" },
  tax_invoice:   { label: "Податкова накл.",  icon: Landmark,    color: "bg-orange-100 text-orange-800" },
  credit_note:   { label: "Коригуюча ПН",     icon: FileX,       color: "bg-rose-100 text-rose-800" },
  payment_order: { label: "Платіжне дор.",    icon: CreditCard,  color: "bg-sky-100 text-sky-800" },
  reconciliation:{ label: "Акт звірки",       icon: Scale,       color: "bg-amber-100 text-amber-800" },
  expense:       { label: "Видаткова накл.",   icon: FileClock,   color: "bg-gray-100 text-gray-800" },
  other:         { label: "Інше",             icon: FileText,    color: "bg-gray-100 text-gray-600" },
};

const DOC_STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  draft:     { label: "Чернетка",   color: "bg-gray-100 text-gray-700",    icon: Clock },
  issued:    { label: "Виставлено", color: "bg-blue-100 text-blue-700",    icon: Send },
  sent:      { label: "Надіслано",  color: "bg-sky-100 text-sky-700",      icon: Send },
  signed:    { label: "Підписано",  color: "bg-violet-100 text-violet-700",icon: Pen },
  paid:      { label: "Оплачено",   color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  overdue:   { label: "Прострочено",color: "bg-red-100 text-red-700",      icon: AlertCircle },
  cancelled: { label: "Скасовано",  color: "bg-gray-200 text-gray-600",    icon: XCircle },
};

const INTEGRATION_INFO: Record<string, { label: string; desc: string; color: string; docs: string }> = {
  bas: {
    label: "BAS",
    desc: "Локальна бухгалтерська система. Обмін через XML-файли у папці обміну.",
    color: "blue",
    docs: "https://bas-soft.eu/",
  },
  medoc: {
    label: "M.E.Doc",
    desc: "Система електронної звітності. Відправка ПН, коригувань до ДПС України.",
    color: "green",
    docs: "https://medoc.ua/",
  },
  vchasno: {
    label: "Вчасно",
    desc: "Система електронного документообігу (EDM). REST API, підписання КЕП.",
    color: "orange",
    docs: "https://vchasno.ua/",
  },
  taxcom: {
    label: "Таксер (ПРРО)",
    desc: "Програмний РРО. Фіскалізація розрахунків, Z-звіти.",
    color: "red",
    docs: "https://taxer.ua/",
  },
  checkbox: {
    label: "Checkbox",
    desc: "ПРРО Checkbox. API для фіскалізації оплат готівкою/карткою.",
    color: "violet",
    docs: "https://checkbox.ua/",
  },
};

// ─── TABS ─────────────────────────────────────────────────────────────────────
type Tab = "overview" | "documents" | "counterparties" | "entities" | "integrations";

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [docFilter, setDocFilter] = useState({ type: "", status: "", search: "" });

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Бухгалтерія та документи</h1>
            <p className="text-sm text-gray-500 mt-1">
              Договори · Рахунки · Акти · Податкові накладні · BAS · M.E.Doc · Вчасно
            </p>
          </div>
          <div className="flex gap-2">
            <NewDocumentDialog />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {([
            { id: "overview",      label: "Огляд",          icon: BarChart3 },
            { id: "documents",     label: "Документи",      icon: FileText },
            { id: "counterparties",label: "Контрагенти",    icon: Users },
            { id: "entities",      label: "Юридичні особи", icon: Building2 },
            { id: "integrations",  label: "Інтеграції",     icon: Settings },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "overview"       && <OverviewTab />}
        {tab === "documents"      && <DocumentsTab filter={docFilter} setFilter={setDocFilter} />}
        {tab === "counterparties" && <CounterpartiesTab />}
        {tab === "entities"       && <LegalEntitiesTab />}
        {tab === "integrations"   && <IntegrationsTab />}
      </div>
    </AppLayout>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data, isLoading } = useAccounting("summary");

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

  const s = data || {};
  const kpis = [
    { label: "Документів (рік)", value: s.totalDocs || 0, icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Загальна сума", value: `${fmtNum(s.totalAmount)} ₴`, icon: Receipt, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Оплачено", value: `${fmtNum(s.paidAmount)} ₴`, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "Дебіторська заборг.", value: `${fmtNum(s.receivable)} ₴`, icon: FileClock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Прострочено", value: `${fmtNum(s.overdueAmount)} ₴`, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Контрагентів", value: s.counterpartyCount || 0, icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}><Icon className={`h-5 w-5 ${color}`} /></div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* By doc type breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Документи за типами</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(DOC_TYPE_LABELS).map(([type, { label, color }]) => {
                const rows = (s.breakdown || []).filter((r: any) => r.doc_type === type);
                const total = rows.reduce((a: number, r: any) => a + parseFloat(r.amount || 0), 0);
                const cnt = rows.reduce((a: number, r: any) => a + parseInt(r.cnt || 0), 0);
                if (!cnt) return null;
                return (
                  <div key={type} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge className={`${color} text-xs`}>{label}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{fmtNum(total)} ₴</div>
                      <div className="text-xs text-gray-500">{cnt} шт.</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Стан розрахунків</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-green-50">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-sm">Оплачено</span></div>
                <span className="font-bold text-green-700">{fmtNum(s.paidAmount)} ₴</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50">
                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" /><span className="text-sm">Очікує оплати</span></div>
                <span className="font-bold text-blue-700">{fmtNum((s.totalAmount || 0) - (s.paidAmount || 0) - (s.overdueAmount || 0))} ₴</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-red-50">
                <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-600" /><span className="text-sm">Прострочено ({s.overdueDocs || 0} doc.)</span></div>
                <span className="font-bold text-red-700">{fmtNum(s.overdueAmount)} ₴</span>
              </div>
              <div className="mt-2 pt-2 border-t flex justify-between">
                <span className="text-sm text-gray-600 font-medium">Всього обіг (рік):</span>
                <span className="font-bold">{fmtNum(s.totalAmount)} ₴</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Новий договір",     type: "contract",   icon: FileText },
          { label: "Новий рахунок",     type: "invoice",    icon: Receipt },
          { label: "Новий акт",         type: "act",        icon: FileCheck },
          { label: "Податкова накладна",type: "tax_invoice",icon: Landmark },
        ].map(({ label, type, icon: Icon }) => (
          <button key={type}
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
            <Icon className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── DOCUMENTS TAB ────────────────────────────────────────────────────────────
function DocumentsTab({ filter, setFilter }: any) {
  const qc = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const { type, status, search } = filter;
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["accounting", "documents", type, status, search],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${API_BASE}/api/accounting/documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json();
    },
    staleTime: 15_000,
  });

  const docs = data?.documents || [];
  const stats = data?.stats || {};

  const signMut = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("hms_token");
      await fetch(`${API_BASE}/api/accounting/documents/${id}/sign`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); refetch(); },
  });

  const paidMut = useMutation({
    mutationFn: async ({ id, amount }: { id: number; amount: number }) => {
      const token = localStorage.getItem("hms_token");
      await fetch(`${API_BASE}/api/accounting/documents/${id}/mark-paid`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: amount }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); refetch(); },
  });

  const exportDoc = (id: number, format: "bas-xml" | "medoc-xml", docNumber: string) => {
    const token = localStorage.getItem("hms_token");
    const url = `${API_BASE}/api/accounting/documents/${id}/export/${format}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${docNumber.replace(/\//g, "-")}-${format === "bas-xml" ? "BAS" : "MEDOC"}.xml`;
        a.click();
      });
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "Всього документів", v: stats.total || 0,   icon: FileText, color: "text-gray-700" },
          { l: "Загальна сума",     v: `${fmtNum(stats.total_amount)} ₴`, icon: Receipt, color: "text-emerald-700" },
          { l: "Очікує оплати",    v: `${fmtNum(stats.pending)} ₴`, icon: Clock, color: "text-blue-700" },
          { l: "Прострочено",      v: `${fmtNum(stats.overdue)} ₴`, icon: AlertCircle, color: "text-red-700" },
        ].map(({ l, v, icon: Icon, color }) => (
          <div key={l} className="flex items-center gap-3 bg-white border rounded-lg p-3">
            <Icon className={`h-5 w-5 ${color}`} />
            <div><p className="text-xs text-gray-500">{l}</p><p className={`text-sm font-bold ${color}`}>{v}</p></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white border rounded-lg p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Пошук за номером, контрагентом..." className="pl-9 h-9"
            value={search} onChange={e => setFilter((f: any) => ({ ...f, search: e.target.value }))} />
        </div>
        <Select value={type || "all"} onValueChange={v => setFilter((f: any) => ({ ...f, type: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Тип документу" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі типи</SelectItem>
            {Object.entries(DOC_TYPE_LABELS).map(([k, { label }]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={v => setFilter((f: any) => ({ ...f, status: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі статуси</SelectItem>
            {Object.entries(DOC_STATUS_LABELS).map(([k, { label }]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">Документи не знайдено</div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Номер</TableHead>
                <TableHead className="text-xs">Тип</TableHead>
                <TableHead className="text-xs">Контрагент</TableHead>
                <TableHead className="text-xs">Дата</TableHead>
                <TableHead className="text-xs text-right">Сума, ₴</TableHead>
                <TableHead className="text-xs text-right">Оплачено, ₴</TableHead>
                <TableHead className="text-xs">Статус</TableHead>
                <TableHead className="text-xs">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d: any) => {
                const typeInfo = DOC_TYPE_LABELS[d.doc_type] || DOC_TYPE_LABELS.other;
                const statusInfo = DOC_STATUS_LABELS[d.status] || DOC_STATUS_LABELS.draft;
                const StatusIcon = statusInfo.icon;
                return (
                  <TableRow key={d.id} className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedDoc(d)}>
                    <TableCell className="font-mono text-xs font-medium">{d.doc_number}</TableCell>
                    <TableCell>
                      <Badge className={`${typeInfo.color} text-xs`}>{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs">{d.counterparty_name || "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(d.doc_date)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium">{fmtNum(d.total_amount)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-green-700">{fmtNum(d.paid_amount)}</TableCell>
                    <TableCell>
                      <Badge className={`${statusInfo.color} flex items-center gap-1 text-xs w-fit`}>
                        <StatusIcon className="h-3 w-3" />{statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {d.status === "issued" || d.status === "draft" ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Підписати"
                            onClick={() => signMut.mutate(d.id)}>
                            <Pen className="h-3.5 w-3.5 text-violet-600" />
                          </Button>
                        ) : null}
                        {["issued","sent","signed"].includes(d.status) ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Оплачено"
                            onClick={() => paidMut.mutate({ id: d.id, amount: parseFloat(d.total_amount) })}>
                            <CreditCard className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        ) : null}
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Експорт BAS XML"
                          onClick={() => exportDoc(d.id, "bas-xml", d.doc_number)}>
                          <Download className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                        {(d.doc_type === "tax_invoice" || d.doc_type === "credit_note") && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Відправити в M.E.Doc"
                            onClick={() => exportDoc(d.id, "medoc-xml", d.doc_number)}>
                            <Send className="h-3.5 w-3.5 text-orange-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Document detail dialog */}
      {selectedDoc && (
        <DocDetailDialog doc={selectedDoc} onClose={() => setSelectedDoc(null)} onRefresh={refetch} />
      )}
    </div>
  );
}

// ─── DOC DETAIL DIALOG ────────────────────────────────────────────────────────
function DocDetailDialog({ doc, onClose, onRefresh }: any) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "doc-detail", doc.id],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${API_BASE}/api/accounting/documents/${doc.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json();
    },
  });

  const d = data?.document || doc;
  const items = data?.items || [];
  const le = data?.legalEntity;
  const cp = data?.counterparty;
  const typeInfo = DOC_TYPE_LABELS[d.doc_type] || DOC_TYPE_LABELS.other;
  const statusInfo = DOC_STATUS_LABELS[d.status] || DOC_STATUS_LABELS.draft;
  const StatusIcon = statusInfo.icon;

  const exportDoc = (format: "bas-xml" | "medoc-xml") => {
    const token = localStorage.getItem("hms_token");
    const url = `${API_BASE}/api/accounting/documents/${d.id}/export/${format}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${d.doc_number.replace(/\//g, "-")}-${format === "bas-xml" ? "BAS" : "MEDOC"}.xml`;
        a.click();
      });
  };

  const signMut = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("hms_token");
      await fetch(`${API_BASE}/api/accounting/documents/${d.id}/sign`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); onRefresh(); onClose(); },
  });

  const paidMut = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("hms_token");
      await fetch(`${API_BASE}/api/accounting/documents/${d.id}/mark-paid`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: d.total_amount }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); onRefresh(); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-lg">{d.doc_number}</span>
            <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
            <Badge className={statusInfo.color}>
              <StatusIcon className="h-3 w-3 mr-1" />{statusInfo.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-5">
            {/* Dates & amounts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><p className="text-xs text-gray-500">Дата документу</p><p className="text-sm font-medium">{fmtDate(d.doc_date)}</p></div>
              <div><p className="text-xs text-gray-500">Термін оплати</p><p className="text-sm font-medium">{fmtDate(d.due_date)}</p></div>
              <div><p className="text-xs text-gray-500">Підписано</p><p className="text-sm font-medium">{fmtDate(d.signed_at)}</p></div>
              <div><p className="text-xs text-gray-500">Оплачено</p><p className="text-sm font-medium">{fmtDate(d.paid_at)}</p></div>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-600 font-medium mb-1">Від кого (продавець)</p>
                <p className="text-sm font-medium">{le?.short_name || le?.name || "—"}</p>
                <p className="text-xs text-gray-600">ЄДРПОУ: {le?.edrpou || "—"}</p>
                <p className="text-xs text-gray-600">IBAN: {le?.iban || "—"}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600 font-medium mb-1">Кому (покупець)</p>
                <p className="text-sm font-medium">{cp?.name || d.counterparty_name || "—"}</p>
                <p className="text-xs text-gray-600">ЄДРПОУ: {cp?.edrpou || d.counterparty_edrpou || "—"}</p>
                <p className="text-xs text-gray-600">{cp?.phone || "—"} · {cp?.email || "—"}</p>
              </div>
            </div>

            {/* Subject */}
            {d.subject && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Предмет</p>
                <p className="text-sm">{d.subject}</p>
              </div>
            )}

            {/* Items */}
            {items.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Позиції</p>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 text-xs">
                      <TableHead className="text-xs">Опис</TableHead>
                      <TableHead className="text-xs text-center">Кількість</TableHead>
                      <TableHead className="text-xs text-center">Одиниця</TableHead>
                      <TableHead className="text-xs text-right">Ціна</TableHead>
                      <TableHead className="text-xs text-center">ПДВ</TableHead>
                      <TableHead className="text-xs text-right">Сума</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item: any) => (
                      <TableRow key={item.id} className="text-xs">
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center">{item.unit}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(item.unit_price)}</TableCell>
                        <TableCell className="text-center">{item.vat_rate === "exempt" ? "Без ПДВ" : `${item.vat_rate}%`}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{fmtNum(item.total_price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Totals */}
            <div className="border rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Сума без ПДВ:</span><span className="font-mono">{fmtNum(d.subtotal)} ₴</span></div>
              <div className="flex justify-between"><span className="text-gray-600">ПДВ 20%:</span><span className="font-mono">{fmtNum(d.vat_amount)} ₴</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1.5"><span>Разом до сплати:</span><span className="font-mono text-emerald-700">{fmtNum(d.total_amount)} ₴</span></div>
              {parseFloat(d.paid_amount || "0") > 0 && (
                <div className="flex justify-between text-green-600"><span>Оплачено:</span><span className="font-mono">{fmtNum(d.paid_amount)} ₴</span></div>
              )}
              {parseFloat(d.paid_amount || "0") > 0 && parseFloat(d.total_amount) - parseFloat(d.paid_amount) > 0.01 && (
                <div className="flex justify-between text-red-600 font-medium"><span>Залишок:</span><span className="font-mono">{fmtNum(parseFloat(d.total_amount) - parseFloat(d.paid_amount))} ₴</span></div>
              )}
            </div>

            {/* Integration status */}
            <div className="flex flex-wrap gap-2 text-xs">
              {d.bas_exported_at && (
                <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  <CheckCircle2 className="h-3 w-3" /> BAS: {fmtDate(d.bas_exported_at)}
                </span>
              )}
              {d.medoc_sent_at && (
                <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded">
                  <CheckCircle2 className="h-3 w-3" /> M.E.Doc: {fmtDate(d.medoc_sent_at)}
                </span>
              )}
              {d.medoc_reg_number && (
                <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded">
                  Рег. №ДПС: {d.medoc_reg_number}
                </span>
              )}
              {d.vchasno_id && (
                <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  <Link2 className="h-3 w-3" /> Вчасно: {d.vchasno_id}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {["draft","issued"].includes(d.status) && (
                <Button size="sm" onClick={() => signMut.mutate()} disabled={signMut.isPending}
                  className="bg-violet-600 hover:bg-violet-700 text-white">
                  <Pen className="h-4 w-4 mr-1" /> Підписати
                </Button>
              )}
              {["issued","sent","signed"].includes(d.status) && (
                <Button size="sm" onClick={() => paidMut.mutate()} disabled={paidMut.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white">
                  <CreditCard className="h-4 w-4 mr-1" /> Позначити оплаченим
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => exportDoc("bas-xml")}>
                <Download className="h-4 w-4 mr-1" /> Вивантажити в BAS
              </Button>
              {(d.doc_type === "tax_invoice" || d.doc_type === "credit_note") && (
                <Button size="sm" variant="outline" onClick={() => exportDoc("medoc-xml")}
                  className="border-orange-300 text-orange-700 hover:bg-orange-50">
                  <Send className="h-4 w-4 mr-1" /> Відправити в M.E.Doc
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── NEW DOCUMENT DIALOG ──────────────────────────────────────────────────────
function NewDocumentDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    docType: "invoice", docDate: format(new Date(), "yyyy-MM-dd"), dueDate: "",
    counterpartyName: "", counterpartyEdrpou: "", subject: "", paymentTerms: "",
    subtotal: "", vatAmount: "", totalAmount: "",
  });
  const qc = useQueryClient();

  const { data: cpData } = useQuery({
    queryKey: ["accounting", "counterparties"],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/counterparties`, { headers: { Authorization: `Bearer ${token}` } })).json();
    },
  });
  const counterparties = cpData?.counterparties || [];

  const mut = useMutation({
    mutationFn: async (body: any) => {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${API_BASE}/api/accounting/documents`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); setOpen(false); },
  });

  const handleCpSelect = (cp: any) => {
    setForm(f => ({ ...f, counterpartyName: cp.name, counterpartyEdrpou: cp.edrpou || "" }));
  };

  const subtotal = parseFloat(form.subtotal || "0");
  const vat = subtotal * 0.2;
  const total = subtotal + vat;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> Новий документ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Створити документ</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Тип документу</Label>
              <Select value={form.docType} onValueChange={v => setForm(f => ({ ...f, docType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, { label }]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата документу</Label>
              <Input type="date" value={form.docDate}
                onChange={e => setForm(f => ({ ...f, docDate: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Контрагент</Label>
              <Select onValueChange={v => {
                const cp = counterparties.find((c: any) => c.id === parseInt(v));
                if (cp) handleCpSelect(cp);
              }}>
                <SelectTrigger><SelectValue placeholder="Обрати зі списку" /></SelectTrigger>
                <SelectContent>
                  {counterparties.map((cp: any) => (
                    <SelectItem key={cp.id} value={String(cp.id)}>{cp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ЄДРПОУ / ІПН</Label>
              <Input value={form.counterpartyEdrpou}
                onChange={e => setForm(f => ({ ...f, counterpartyEdrpou: e.target.value }))}
                placeholder="12345678" />
            </div>
          </div>

          <div>
            <Label>Назва контрагента (вручну)</Label>
            <Input value={form.counterpartyName}
              onChange={e => setForm(f => ({ ...f, counterpartyName: e.target.value }))}
              placeholder="ТОВ «Назва»" />
          </div>

          <div>
            <Label>Предмет договору / акту</Label>
            <Textarea value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Надання послуг з проживання..." rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Термін оплати</Label>
              <Input type="date" value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <Label>Умови оплати</Label>
              <Input value={form.paymentTerms}
                onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
                placeholder="Передоплата 100% / Постоплата 14 днів" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Сума без ПДВ, ₴</Label>
              <Input type="number" value={form.subtotal}
                onChange={e => setForm(f => ({ ...f, subtotal: e.target.value }))} />
            </div>
            <div>
              <Label>ПДВ 20%, ₴</Label>
              <Input readOnly value={form.subtotal ? vat.toFixed(2) : ""} className="bg-gray-50" />
            </div>
            <div>
              <Label>Всього з ПДВ, ₴</Label>
              <Input readOnly value={form.subtotal ? total.toFixed(2) : ""} className="bg-gray-50 font-medium" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">Скасувати</Button>
            <Button disabled={mut.isPending || !form.docType || !form.docDate}
              onClick={() => mut.mutate({
                docType: form.docType, docDate: form.docDate, dueDate: form.dueDate || undefined,
                counterpartyName: form.counterpartyName, counterpartyEdrpou: form.counterpartyEdrpou,
                subject: form.subject, paymentTerms: form.paymentTerms,
                subtotal: subtotal, vatAmount: vat, totalAmount: total,
                status: "draft",
              })}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Створити"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── COUNTERPARTIES TAB ───────────────────────────────────────────────────────
function CounterpartiesTab() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editCp, setEditCp] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["accounting", "counterparties", search],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${API_BASE}/api/accounting/counterparties${search ? `?search=${search}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json();
    },
  });
  const counterparties = data?.counterparties || [];

  const createMut = useMutation({
    mutationFn: async (body: any) => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/counterparties`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); setAddOpen(false); setForm({}); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/counterparties/${id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); setEditCp(null); },
  });

  const CpForm = ({ onSubmit, isEdit }: any) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Повна назва *</Label>
          <Input value={form.name || ""} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <Label>Коротка назва</Label>
          <Input value={form.shortName || ""} onChange={e => setForm((f: any) => ({ ...f, shortName: e.target.value }))} />
        </div>
        <div>
          <Label>Тип</Label>
          <Select value={form.type || "legal"} onValueChange={v => setForm((f: any) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="legal">Юридична особа</SelectItem>
              <SelectItem value="fop">ФОП</SelectItem>
              <SelectItem value="individual">Фізична особа</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ЄДРПОУ</Label>
          <Input value={form.edrpou || ""} onChange={e => setForm((f: any) => ({ ...f, edrpou: e.target.value }))} placeholder="12345678" />
        </div>
        <div>
          <Label>ІПН</Label>
          <Input value={form.ipn || ""} onChange={e => setForm((f: any) => ({ ...f, ipn: e.target.value }))} placeholder="1234567890" />
        </div>
        <div>
          <Label>Телефон</Label>
          <Input value={form.phone || ""} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} placeholder="+380501234567" />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email || ""} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label>Юридична адреса</Label>
          <Input value={form.legalAddress || ""} onChange={e => setForm((f: any) => ({ ...f, legalAddress: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label>IBAN</Label>
          <Input value={form.iban || ""} onChange={e => setForm((f: any) => ({ ...f, iban: e.target.value }))} placeholder="UA123456789..." />
        </div>
        <div>
          <Label>Банк</Label>
          <Input value={form.bankName || ""} onChange={e => setForm((f: any) => ({ ...f, bankName: e.target.value }))} />
        </div>
        <div>
          <Label>МФО</Label>
          <Input value={form.bankMfo || ""} onChange={e => setForm((f: any) => ({ ...f, bankMfo: e.target.value }))} />
        </div>
        <div>
          <Label>Директор / Підписант</Label>
          <Input value={form.director || ""} onChange={e => setForm((f: any) => ({ ...f, director: e.target.value }))} />
        </div>
        <div>
          <Label>Контактна особа</Label>
          <Input value={form.contactPerson || ""} onChange={e => setForm((f: any) => ({ ...f, contactPerson: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label>Примітки</Label>
          <Textarea value={form.notes || ""} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={() => { setAddOpen(false); setEditCp(null); setForm({}); }} className="flex-1">Скасувати</Button>
        <Button disabled={!form.name || createMut.isPending || updateMut.isPending}
          onClick={() => onSubmit(form)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
          {(createMut.isPending || updateMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? "Зберегти" : "Додати")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Пошук контрагентів..." className="pl-9"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setForm({})}>
              <Plus className="h-4 w-4 mr-1" /> Додати контрагента
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Новий контрагент</DialogTitle></DialogHeader>
            <CpForm onSubmit={(f: any) => createMut.mutate(f)} />
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
                <TableHead className="text-xs">Назва</TableHead>
                <TableHead className="text-xs">Тип</TableHead>
                <TableHead className="text-xs">ЄДРПОУ</TableHead>
                <TableHead className="text-xs">Телефон</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">IBAN</TableHead>
                <TableHead className="text-xs">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {counterparties.map((cp: any) => (
                <TableRow key={cp.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="font-medium text-sm">{cp.name}</div>
                    {cp.director && <div className="text-xs text-gray-500">{cp.director}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {cp.type === "legal" ? "Юр. особа" : cp.type === "fop" ? "ФОП" : "Фіз. особа"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{cp.edrpou || "—"}</TableCell>
                  <TableCell className="text-xs">{cp.phone || "—"}</TableCell>
                  <TableCell className="text-xs">{cp.email || "—"}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[160px] truncate">{cp.iban || "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => { setEditCp(cp); setForm(cp); }}>
                      Редагувати
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editCp && (
        <Dialog open onOpenChange={() => { setEditCp(null); setForm({}); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Редагувати контрагента</DialogTitle></DialogHeader>
            <CpForm isEdit onSubmit={(f: any) => updateMut.mutate({ id: editCp.id, body: f })} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── LEGAL ENTITIES TAB ───────────────────────────────────────────────────────
function LegalEntitiesTab() {
  const [addOpen, setAddOpen] = useState(false);
  const [editEntity, setEditEntity] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "legal-entities"],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/legal-entities`, { headers: { Authorization: `Bearer ${token}` } })).json();
    },
  });
  const entities = data?.entities || [];

  const createMut = useMutation({
    mutationFn: async (body: any) => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/legal-entities`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); setAddOpen(false); setForm({}); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/legal-entities/${id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); setEditEntity(null); setForm({}); },
  });

  const EntityForm = ({ onSubmit, isEdit }: any) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Повна назва *</Label>
          <Input value={form.fullName || form.name || ""} onChange={e => setForm((f: any) => ({ ...f, fullName: e.target.value, name: e.target.value }))} placeholder="Товариство з обмеженою відповідальністю «...»" />
        </div>
        <div>
          <Label>Коротка назва</Label>
          <Input value={form.shortName || ""} onChange={e => setForm((f: any) => ({ ...f, shortName: e.target.value }))} placeholder="ТОВ «...»" />
        </div>
        <div>
          <Label>Організаційна форма</Label>
          <Select value={form.type || "tov"} onValueChange={v => setForm((f: any) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tov">ТОВ</SelectItem>
              <SelectItem value="fop">ФОП</SelectItem>
              <SelectItem value="pp">ПП</SelectItem>
              <SelectItem value="other">Інше</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ЄДРПОУ</Label>
          <Input value={form.edrpou || ""} onChange={e => setForm((f: any) => ({ ...f, edrpou: e.target.value }))} placeholder="12345678" />
        </div>
        <div>
          <Label>ІПН</Label>
          <Input value={form.ipn || ""} onChange={e => setForm((f: any) => ({ ...f, ipn: e.target.value }))} placeholder="1234567890" />
        </div>
        <div>
          <Label>Свідоцтво ПДВ</Label>
          <Input value={form.vatNumber || form.vat_number || ""} onChange={e => setForm((f: any) => ({ ...f, vatNumber: e.target.value }))} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input type="checkbox" id="isVatPayer" checked={form.isVatPayer || false}
            onChange={e => setForm((f: any) => ({ ...f, isVatPayer: e.target.checked }))} className="h-4 w-4" />
          <Label htmlFor="isVatPayer">Платник ПДВ</Label>
        </div>
        <div>
          <Label>Телефон</Label>
          <Input value={form.phone || ""} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} placeholder="+38044..." />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email || ""} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label>Юридична адреса</Label>
          <Input value={form.legalAddress || form.legal_address || ""} onChange={e => setForm((f: any) => ({ ...f, legalAddress: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label>Фактична адреса</Label>
          <Input value={form.actualAddress || form.actual_address || ""} onChange={e => setForm((f: any) => ({ ...f, actualAddress: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label>IBAN</Label>
          <Input value={form.iban || ""} onChange={e => setForm((f: any) => ({ ...f, iban: e.target.value }))} placeholder="UA..." />
        </div>
        <div>
          <Label>Банк</Label>
          <Input value={form.bank || ""} onChange={e => setForm((f: any) => ({ ...f, bank: e.target.value }))} />
        </div>
        <div>
          <Label>МФО</Label>
          <Input value={form.mfo || ""} onChange={e => setForm((f: any) => ({ ...f, mfo: e.target.value }))} />
        </div>
        <div>
          <Label>Директор / Підписант</Label>
          <Input value={form.director || ""} onChange={e => setForm((f: any) => ({ ...f, director: e.target.value }))} />
        </div>
        <div>
          <Label>Головний бухгалтер</Label>
          <Input value={form.accountant || ""} onChange={e => setForm((f: any) => ({ ...f, accountant: e.target.value }))} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input type="checkbox" id="isDefault" checked={form.isDefault || false}
            onChange={e => setForm((f: any) => ({ ...f, isDefault: e.target.checked }))} className="h-4 w-4" />
          <Label htmlFor="isDefault">Основна юридична особа</Label>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={() => { setAddOpen(false); setEditEntity(null); setForm({}); }} className="flex-1">Скасувати</Button>
        <Button disabled={!form.name && !form.fullName}
          onClick={() => onSubmit({ ...form, name: form.fullName || form.name })}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
          {(createMut.isPending || updateMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? "Зберегти" : "Додати")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-900">Юридичні особи</h3>
          <p className="text-sm text-gray-500">Суб'єкти господарювання в межах однієї компанії</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setForm({})}>
              <Plus className="h-4 w-4 mr-1" /> Додати юридичну особу
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Нова юридична особа</DialogTitle></DialogHeader>
            <EntityForm onSubmit={(f: any) => createMut.mutate(f)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {entities.map((le: any) => (
            <Card key={le.id} className={`relative ${le.is_default ? "border-blue-400 ring-1 ring-blue-400" : ""}`}>
              {le.is_default && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-blue-100 text-blue-700 text-xs">Основна</Badge>
                </div>
              )}
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {le.short_name || le.name}
                  <p className="text-xs font-normal text-gray-500 mt-0.5">{le.full_name || le.name}</p>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div><span className="text-gray-500 text-xs">ЄДРПОУ:</span> <span className="font-mono">{le.edrpou || "—"}</span></div>
                  <div><span className="text-gray-500 text-xs">ІПН:</span> <span className="font-mono">{le.ipn || "—"}</span></div>
                  <div><span className="text-gray-500 text-xs">Платник ПДВ:</span> <span>{le.is_vat_payer ? "✅ Так" : "Ні"}</span></div>
                  <div><span className="text-gray-500 text-xs">МФО:</span> <span className="font-mono">{le.mfo || "—"}</span></div>
                  <div className="col-span-2"><span className="text-gray-500 text-xs">IBAN:</span> <span className="font-mono text-xs">{le.iban || "—"}</span></div>
                  <div className="col-span-2"><span className="text-gray-500 text-xs">Банк:</span> {le.bank || "—"}</div>
                  <div><span className="text-gray-500 text-xs">Директор:</span> {le.director || "—"}</div>
                  <div><span className="text-gray-500 text-xs">Бухгалтер:</span> {le.accountant || "—"}</div>
                  <div className="col-span-2"><span className="text-gray-500 text-xs">Адреса:</span> <span className="text-xs">{le.legal_address || le.address || "—"}</span></div>
                  <div><span className="text-gray-500 text-xs">Тел.:</span> {le.phone || "—"}</div>
                  <div><span className="text-gray-500 text-xs">Email:</span> {le.email || "—"}</div>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button size="sm" variant="outline"
                    onClick={() => { setEditEntity(le); setForm({ ...le, legalAddress: le.legal_address, actualAddress: le.actual_address, vatNumber: le.vat_number, isVatPayer: le.is_vat_payer, shortName: le.short_name, fullName: le.full_name, isDefault: le.is_default }); }}>
                    Редагувати
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editEntity && (
        <Dialog open onOpenChange={() => { setEditEntity(null); setForm({}); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Редагувати юридичну особу</DialogTitle></DialogHeader>
            <EntityForm isEdit onSubmit={(f: any) => updateMut.mutate({ id: editEntity.id, body: f })} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── INTEGRATIONS TAB ─────────────────────────────────────────────────────────
function IntegrationsTab() {
  const [editProvider, setEditProvider] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [testResult, setTestResult] = useState<Record<string, any>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "integrations"],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/integrations`, { headers: { Authorization: `Bearer ${token}` } })).json();
    },
  });
  const integrations: any[] = data?.integrations || [];

  const getIntegration = (provider: string) => integrations.find((i: any) => i.provider === provider);

  const updateMut = useMutation({
    mutationFn: async ({ provider, body }: { provider: string; body: any }) => {
      const token = localStorage.getItem("hms_token");
      return (await fetch(`${API_BASE}/api/accounting/integrations/${provider}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounting"] }); setEditProvider(null); },
  });

  const testConnection = async (provider: string) => {
    setTesting(provider);
    try {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${API_BASE}/api/accounting/integrations/${provider}/test`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const result = await r.json();
      setTestResult(prev => ({ ...prev, [provider]: result }));
    } finally {
      setTesting(null);
    }
  };

  const providers = ["bas", "medoc", "vchasno", "taxcom", "checkbox"];

  const CONFIG_FIELDS: Record<string, { key: string; label: string; placeholder: string; type?: string }[]> = {
    bas: [
      { key: "folderPath", label: "Шлях до папки обміну", placeholder: "C:\\BAS\\Exchange\\" },
      { key: "exportFormat", label: "Формат XML", placeholder: "1C8" },
    ],
    medoc: [
      { key: "login", label: "Логін M.E.Doc", placeholder: "user@company.ua" },
      { key: "password", label: "Пароль", placeholder: "••••••••", type: "password" },
      { key: "edrpou", label: "ЄДРПОУ", placeholder: "12345678" },
      { key: "certificatePath", label: "Шлях до КЕП сертифікату", placeholder: "C:\\Keys\\cert.pfx" },
    ],
    vchasno: [
      { key: "apiKey", label: "API-ключ Вчасно", placeholder: "vchasno_api_..." },
      { key: "companyId", label: "ID компанії", placeholder: "company_uuid" },
      { key: "webhookUrl", label: "Webhook URL для статусів", placeholder: "https://..." },
    ],
    taxcom: [
      { key: "prroId", label: "Ідентифікатор ПРРО", placeholder: "4000054321" },
      { key: "apiKey", label: "API-ключ Таксер", placeholder: "taxer_..." },
      { key: "licenseKey", label: "Ліцензійний ключ", placeholder: "XXXX-XXXX-XXXX" },
    ],
    checkbox: [
      { key: "apiKey", label: "API-ключ Checkbox", placeholder: "cb_live_..." },
      { key: "cashierId", label: "ID касира", placeholder: "cashier_uuid" },
    ],
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">Інтеграції з бухгалтерськими системами</h3>
        <p className="text-sm text-gray-500 mt-1">
          Підключення до BAS, M.E.Doc, Вчасно та ПРРО для автоматичного обміну документами
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {providers.map(provider => {
            const info = INTEGRATION_INFO[provider];
            const integration = getIntegration(provider);
            const isEnabled = integration?.is_enabled || false;
            const status = integration?.status || "inactive";
            const lastSync = integration?.last_sync_at;
            const tr = testResult[provider];
            const colorMap: Record<string, string> = {
              blue: "border-blue-200 bg-blue-50", green: "border-green-200 bg-green-50",
              orange: "border-orange-200 bg-orange-50", red: "border-red-200 bg-red-50",
              violet: "border-violet-200 bg-violet-50",
            };
            const headerColors: Record<string, string> = {
              blue: "bg-blue-600", green: "bg-green-600", orange: "bg-orange-600",
              red: "bg-red-600", violet: "bg-violet-600",
            };

            return (
              <Card key={provider} className={`overflow-hidden ${isEnabled ? "ring-2 ring-green-300" : ""}`}>
                <div className={`${headerColors[info.color]} text-white px-4 py-3 flex items-center justify-between`}>
                  <div>
                    <h4 className="font-bold text-base">{info.label}</h4>
                    <p className="text-xs opacity-80">
                      {status === "active" ? "🟢 Активна" : status === "error" ? "🔴 Помилка" : "⚪ Неактивна"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEnabled ? (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-green-300 animate-pulse" />
                    ) : (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-gray-300" />
                    )}
                  </div>
                </div>
                <CardContent className="pt-4 space-y-3">
                  <p className="text-xs text-gray-600">{info.desc}</p>

                  {lastSync && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Синхронізовано: {fmtDate(lastSync)}
                    </p>
                  )}

                  {tr && (
                    <div className={`text-xs p-2 rounded ${tr.success ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                      {tr.success ? "✅ " : "ℹ️ "}{tr.message}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs"
                      onClick={() => {
                        const cfg = integration?.config ? (typeof integration.config === "string" ? JSON.parse(integration.config) : integration.config) : {};
                        setConfigs(prev => ({ ...prev, [provider]: cfg }));
                        setEditProvider(provider);
                      }}>
                      <Settings className="h-3.5 w-3.5 mr-1" /> Налаштувати
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs"
                      disabled={testing === provider}
                      onClick={() => testConnection(provider)}>
                      {testing === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
                      Перевірити
                    </Button>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Статус:</span>
                    <button onClick={() => updateMut.mutate({ provider, body: { isEnabled: !isEnabled } })}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${isEnabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {isEnabled ? "✅ Увімкнено" : "Вимкнено"}
                    </button>
                  </div>

                  <a href={info.docs} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" /> Офіційна документація
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Integration Config Dialog */}
      {editProvider && (
        <Dialog open onOpenChange={() => setEditProvider(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Налаштування {INTEGRATION_INFO[editProvider]?.label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {(CONFIG_FIELDS[editProvider] || []).map(field => (
                <div key={field.key}>
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type || "text"}
                    value={configs[editProvider]?.[field.key] || ""}
                    onChange={e => setConfigs(prev => ({
                      ...prev, [editProvider]: { ...prev[editProvider], [field.key]: e.target.value }
                    }))}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}

              {/* Auto-export */}
              <div>
                <Label className="mb-2 block">Авто-експорт типів документів</Label>
                <div className="flex flex-wrap gap-2">
                  {["invoice","act","tax_invoice","credit_note","contract"].map(type => {
                    const integration = getIntegration(editProvider);
                    const autoTypes: string[] = typeof integration?.auto_export_doc_types === "string"
                      ? JSON.parse(integration.auto_export_doc_types || "[]") : [];
                    const isChecked = autoTypes.includes(type);
                    return (
                      <label key={type} className="flex items-center gap-1.5 text-xs bg-gray-50 border rounded px-2 py-1 cursor-pointer hover:bg-gray-100">
                        <input type="checkbox" defaultChecked={isChecked} className="h-3 w-3" />
                        {DOC_TYPE_LABELS[type]?.label || type}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditProvider(null)} className="flex-1">Скасувати</Button>
                <Button disabled={updateMut.isPending}
                  onClick={() => updateMut.mutate({ provider: editProvider, body: { config: configs[editProvider] || {} } })}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Зберегти"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
