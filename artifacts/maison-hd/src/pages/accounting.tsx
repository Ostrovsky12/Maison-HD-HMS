import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
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
  Archive, Cpu, PenSquare, FolderOpen, Code2, ExternalLink,
  ShieldCheck, Shuffle, UserPlus, BookOpen, BadgeCheck, Server,
  TrendingUp, TrendingDown, Wallet, PieChart, MapPin,
  UserCheck, Briefcase, HardDrive, Calculator, AlertTriangle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

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

function useAccLedger(path: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["acc-ledger", path],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${API_BASE}/api/acc/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json();
    },
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

// → Новий бухгалтерський леджер (/api/acc/*)
const accFetch = async (path: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API_BASE}/api/acc/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "API Error");
  return r.json();
};

// → Старий модуль обліку документів (/api/accounting/*)
const acctFetch = (path: string, opts?: RequestInit) => {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API_BASE}/api/accounting/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  }).then(r => r.json());
};

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
type Tab = "overview" | "documents" | "counterparties" | "entities" | "integrations"
         | "tax-invoices" | "bas" | "signing" | "archive" | "invoices"
         | "acc-accounts" | "acc-journal" | "acc-documents" | "acc-contractors"
         | "acc-vat" | "acc-reports" | "acc-bank" | "acc-sync"
         | "acc-monthclose" | "acc-card" | "acc-cash"
         | "acc-tourist" | "acc-payroll" | "acc-assets";

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [docFilter, setDocFilter] = useState({ type: "", status: "", search: "" });

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Бухгалтерія та документообіг</h1>
            <p className="text-sm text-gray-500 mt-1">
              Договори · Рахунки · Акти · ПН · BAS · M.E.Doc · Вчасно · КЕП · Архів
            </p>
          </div>
          <div className="flex gap-2">
            <NewDocumentDialog />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto pb-px">
          {([
            { id: "overview",      label: "Огляд",               icon: BarChart3 },
            { id: "invoices",      label: "Сформовані рахунки",  icon: Receipt },
            { id: "documents",     label: "Документи",           icon: FileText },
            { id: "tax-invoices",  label: "Подат. накладні",     icon: Landmark },
            { id: "bas",           label: "BAS / 1C",            icon: Cpu },
            { id: "signing",       label: "Підписання",          icon: PenSquare },
            { id: "archive",       label: "Архів",               icon: Archive },
            { id: "counterparties",label: "Контрагенти",         icon: Users },
            { id: "entities",      label: "Юр. особи",           icon: Building2 },
            { id: "integrations",  label: "Інтеграції",          icon: Settings },
            { id: "acc-accounts",  label: "План рахунків",       icon: BookOpen },
            { id: "acc-journal",   label: "Журнал проводок",     icon: FileText },
            { id: "acc-documents", label: "ЛК Документи",        icon: FileText },
            { id: "acc-contractors",label: "ЛК Контрагенти",     icon: Users },
            { id: "acc-vat",        label: "ПДВ",                icon: Landmark },
            { id: "acc-reports",    label: "Звіти",              icon: BarChart3 },
            { id: "acc-bank",       label: "Банк",               icon: CreditCard },
            { id: "acc-sync",       label: "Синхронізація",      icon: RefreshCw },
            { id: "acc-monthclose", label: "Закриття місяця",    icon: CheckCircle2 },
            { id: "acc-card",       label: "Картка рахунку",     icon: BookOpen },
            { id: "acc-cash",       label: "Каса ПКО/ВКО",      icon: Wallet },
            { id: "acc-tourist",    label: "Тур. збір",          icon: MapPin },
            { id: "acc-payroll",    label: "Зарплата",           icon: Users },
            { id: "acc-assets",     label: "Основні засоби",     icon: Building2 },
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

        {/* Tab content */}
        {tab === "overview"       && <OverviewTab />}
        {tab === "invoices"       && <BookingInvoicesTab />}
        {tab === "documents"      && <DocumentsTab filter={docFilter} setFilter={setDocFilter} />}
        {tab === "tax-invoices"   && <TaxInvoicesTab />}
        {tab === "bas"            && <BasExportTab />}
        {tab === "signing"        && <SigningTab />}
        {tab === "archive"        && <ArchiveTab />}
        {tab === "counterparties" && <CounterpartiesTab />}
        {tab === "entities"       && <LegalEntitiesTab />}
        {tab === "integrations"   && <IntegrationsTab />}
        {tab === "acc-accounts"   && <AccChartOfAccountsTab />}
        {tab === "acc-journal"    && <AccJournalTab />}
        {tab === "acc-documents"  && <AccDocumentsTab />}
        {tab === "acc-contractors"&& <AccContractorsTab />}
        {tab === "acc-vat"        && <AccVatTab />}
        {tab === "acc-reports"    && <AccReportsTab />}
        {tab === "acc-bank"       && <AccBankTab />}
        {tab === "acc-sync"       && <AccSyncTab />}
        {tab === "acc-monthclose" && <AccMonthCloseTab />}
        {tab === "acc-card"       && <AccAccountCardTab />}
        {tab === "acc-cash"       && <AccCashTab />}
        {tab === "acc-tourist"    && <AccTouristTaxTab />}
        {tab === "acc-payroll"    && <AccPayrollTab />}
        {tab === "acc-assets"     && <AccFixedAssetsTab />}
      </div>
    </AppLayout>
  );
}

// ─── BOOKING INVOICES TAB ─────────────────────────────────────────────────────
function BookingInvoicesTab() {
  const tok = () => localStorage.getItem("hms_token") || "";
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [legalEntityId, setLegalEntityId] = useState("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entities } = useQuery({
    queryKey: ["legal-entities"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/organizations/me`, { headers: { Authorization: `Bearer ${tok()}` } });
      const org = await r.json();
      return (org.legalEntities || []) as { id: number; name: string }[];
    },
    staleTime: 60_000,
  });

  const { data: invoices, isLoading, refetch } = useQuery({
    queryKey: ["booking-invoices", dateFrom, dateTo, legalEntityId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (legalEntityId !== "all") params.set("legalEntityId", legalEntityId);
      const r = await fetch(`${API_BASE}/api/invoices?${params}`, { headers: { Authorization: `Bearer ${tok()}` } });
      return r.json() as Promise<any[]>;
    },
    staleTime: 30_000,
  });

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/api/invoices/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      toast({ title: "Рахунок видалено" });
      setDeleteId(null);
      refetch();
    } catch {
      toast({ title: "Помилка видалення", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = (inv: any) => {
    if (!inv.invoiceItems || !inv.sellerSnapshot) {
      toast({ title: "Немає даних для друку", description: "Рахунок не містить позицій або реквізитів", variant: "destructive" });
      return;
    }
    import("@/components/booking/invoice-modal").then(({ buildPrintHtml }) => {
      const data = {
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt,
        dueDate: inv.dueDate,
        seller: inv.sellerSnapshot,
        buyer: { name: inv.counterpartyName || "", taxCode: inv.counterpartyEdrpou || "", vatNumber: inv.buyerVatNumber || "", address: inv.buyerAddress || "" },
        items: inv.invoiceItems || [],
        booking: { guestName: inv.counterpartyName || "", checkIn: "", checkOut: "", paidAmount: 0 },
        legalEntities: [],
        legalEntityId: inv.legalEntityId,
      };
      const buyer = data.buyer;
      const html = buildPrintHtml(data as any, buyer, data.items);
      const w = window.open("", "_blank", "width=900,height=700");
      if (!w) { toast({ title: "Дозвольте спливаючі вікна для друку", variant: "destructive" }); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending: { label: "Очікує", cls: "bg-amber-100 text-amber-800" },
      paid:    { label: "Оплачено", cls: "bg-emerald-100 text-emerald-800" },
      draft:   { label: "Чернетка", cls: "bg-gray-100 text-gray-600" },
      cancelled: { label: "Скасовано", cls: "bg-red-100 text-red-700" },
      overdue: { label: "Прострочено", cls: "bg-red-100 text-red-800" },
    };
    const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-500" };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Від</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">До</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {entities && entities.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Юр. особа</label>
            <select
              value={legalEntityId}
              onChange={e => setLegalEntityId(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="all">Усі</option>
              {entities.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
            </select>
          </div>
        )}
        <button
          onClick={() => refetch()}
          className="h-9 px-3 flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Оновити
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : !invoices || invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
          <Receipt className="w-12 h-12 opacity-30" />
          <div className="font-semibold">Рахунків ще немає</div>
          <div className="text-sm">Рахунки формуються при відкритті бронювання</div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="text-xs font-semibold text-gray-500 pl-5">№ Рахунку</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Контрагент</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Дата</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Сума</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500">Статус</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 pr-5 text-right">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices || []).map((inv: any) => (
                <TableRow key={inv.id} className="hover:bg-gray-50/50">
                  <TableCell className="pl-5 font-mono text-sm font-semibold text-indigo-700">{inv.invoiceNumber}</TableCell>
                  <TableCell className="text-sm text-gray-700 max-w-[200px] truncate">
                    {inv.counterpartyName || inv.guestName || "—"}
                    {inv.counterpartyEdrpou && <span className="text-gray-400 text-xs ml-1">({inv.counterpartyEdrpou})</span>}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{fmtDate(inv.createdAt)}</TableCell>
                  <TableCell className="text-sm font-semibold text-gray-900">
                    {fmtNum(inv.amount)} ₴
                  </TableCell>
                  <TableCell>{statusBadge(inv.status)}</TableCell>
                  <TableCell className="pr-5">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handlePrint(inv)}
                        title="Друкувати"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <span className="sr-only">Друк</span>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                          <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                      </button>
                      {deleteId === inv.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(inv.id)}
                            disabled={deleting}
                            className="h-7 px-2 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {deleting ? "..." : "Так"}
                          </button>
                          <button
                            onClick={() => setDeleteId(null)}
                            className="h-7 px-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Ні
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteId(inv.id)}
                          title="Видалити"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// UKRAINIAN ACCOUNTING LAYER TABS
// ═══════════════════════════════════════════════════════════════════════════════

const fmtNum2 = (n: any) => n ? new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2 }).format(Number(n)) : "0,00";
const fmtCur2 = (n: any) => `${fmtNum2(n)} ₴`;

// ─── TAX INVOICES TAB (Податкові накладні) ────────────────────────────────────
function TaxInvoicesTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ sellerEntityId: "", buyerCounterpartyId: "", taxableAmount: "", vatAmount: "", totalAmount: "", vatRate: "20", operationCode: "07", pnType: "standard", notes: "" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ua-tax-invoices", filter],
    queryFn: () => acctFetch(`tax-invoices${filter !== "all" ? `?status=${filter}` : ""}`), staleTime: 15_000,
  });
  const { data: entitiesData } = useQuery({ queryKey: ["acc-entities-sel"], queryFn: () => acctFetch("legal-entities"), staleTime: 60_000 });
  const { data: cpData } = useQuery({ queryKey: ["acc-counterparties-sel"], queryFn: () => acctFetch("counterparties"), staleTime: 60_000 });

  const createMut = useMutation({
    mutationFn: (body: any) => acctFetch("tax-invoices", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ua-tax-invoices"] }); setNewOpen(false); },
  });

  const genXmlMut = useMutation({
    mutationFn: (id: number) => acctFetch(`tax-invoices/${id}/generate-xml`, { method: "POST" }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["ua-tax-invoices"] }); if (d.xml) alert("XML ПН згенеровано успішно!"); },
  });

  const medocMut = useMutation({
    mutationFn: (id: number) => acctFetch(`tax-invoices/${id}/submit-medoc`, { method: "POST" }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["ua-tax-invoices"] }); alert(d.message); },
  });

  const vchasnoMut = useMutation({
    mutationFn: (id: number) => acctFetch(`tax-invoices/${id}/submit-vchasno`, { method: "POST" }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["ua-tax-invoices"] }); alert(d.message); },
  });

  const invoices = data?.invoices || [];
  const STATUS_CFG: Record<string, { label: string; color: string }> = {
    draft:     { label: "Чернетка",  color: "bg-gray-100 text-gray-600" },
    ready:     { label: "Готова",    color: "bg-blue-100 text-blue-700" },
    submitted: { label: "Відправлена", color: "bg-amber-100 text-amber-700" },
    registered: { label: "Зареєстрована", color: "bg-green-100 text-green-700" },
    rejected:  { label: "Відхилена", color: "bg-red-100 text-red-700" },
  };

  const handleVatCalc = (taxable: string, rate: string) => {
    const t = parseFloat(taxable) || 0;
    const r = parseFloat(rate) || 20;
    const vat = (t * r / 100);
    setForm(f => ({ ...f, taxableAmount: taxable, vatAmount: vat.toFixed(2), totalAmount: (t + vat).toFixed(2) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Податкові накладні (ПН)</h2>
          <p className="text-xs text-gray-400">XML J1201009 · M.E.Doc · Вчасно.КЕП · ДПС реєстр</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {["all","draft","ready","submitted","registered","rejected"].map(s => (
              <button key={s} onClick={() => setFilter(s)} className={`text-xs px-2.5 py-1 rounded-md transition-colors ${filter === s ? "bg-white shadow text-indigo-600 font-medium" : "text-gray-500"}`}>
                {s === "all" ? "Всі" : STATUS_CFG[s]?.label || s}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Нова ПН</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Нова Податкова Накладна</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Постачальник (юр. особа)</Label>
                  <Select value={form.sellerEntityId} onValueChange={v => setForm(f => ({ ...f, sellerEntityId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Оберіть юр. особу" /></SelectTrigger>
                    <SelectContent>{(entitiesData?.entities || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Покупець (контрагент)</Label>
                  <Select value={form.buyerCounterpartyId} onValueChange={v => setForm(f => ({ ...f, buyerCounterpartyId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Оберіть контрагента" /></SelectTrigger>
                    <SelectContent>{(cpData?.counterparties || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Тип ПН</Label>
                  <Select value={form.pnType} onValueChange={v => setForm(f => ({ ...f, pnType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Стандартна</SelectItem>
                      <SelectItem value="correction">Коригуюча</SelectItem>
                      <SelectItem value="zero_rate">0% ставка</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Ставка ПДВ %</Label>
                    <Select value={form.vatRate} onValueChange={v => { setForm(f => ({ ...f, vatRate: v })); handleVatCalc(form.taxableAmount, v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="20">20%</SelectItem><SelectItem value="7">7%</SelectItem><SelectItem value="0">0%</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Код операції</Label>
                    <Select value={form.operationCode} onValueChange={v => setForm(f => ({ ...f, operationCode: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="07">07 - послуги</SelectItem>
                        <SelectItem value="01">01 - товари</SelectItem>
                        <SelectItem value="14">14 - ОЗ/НА</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">База оподаткування ₴ *</Label><Input type="number" value={form.taxableAmount} onChange={e => handleVatCalc(e.target.value, form.vatRate)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Сума ПДВ ₴</Label><Input type="number" value={form.vatAmount} readOnly className="bg-gray-50" /></div>
                  <div><Label className="text-xs">Разом ₴</Label><Input type="number" value={form.totalAmount} readOnly className="bg-gray-50" /></div>
                </div>
                <div><Label className="text-xs">Примітки</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button className="w-full" onClick={() => createMut.mutate({ ...form, sellerEntityId: form.sellerEntityId ? parseInt(form.sellerEntityId) : undefined, buyerCounterpartyId: form.buyerCounterpartyId ? parseInt(form.buyerCounterpartyId) : undefined })} disabled={!form.taxableAmount || createMut.isPending}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Створити ПН
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Integration status bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "BAS/1C XML", icon: Cpu, color: "bg-blue-50 border-blue-200 text-blue-700", status: "Адаптер готовий" },
          { label: "M.E.Doc", icon: FolderOpen, color: "bg-violet-50 border-violet-200 text-violet-700", status: "Файловий обмін" },
          { label: "Вчасно.КЕП", icon: ShieldCheck, color: "bg-green-50 border-green-200 text-green-700", status: "REST API" },
          { label: "ДПС реєстр", icon: Server, color: "bg-amber-50 border-amber-200 text-amber-700", status: "Через M.E.Doc" },
        ].map(({ label, icon: Icon, color, status }) => (
          <div key={label} className={`border rounded-xl p-3 flex items-center gap-2 ${color}`}>
            <Icon className="h-4 w-4 shrink-0" />
            <div><p className="text-xs font-semibold">{label}</p><p className="text-xs opacity-70">{status}</p></div>
          </div>
        ))}
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader><TableRow className="bg-gray-50 text-xs">
              <TableHead>Номер</TableHead><TableHead>Тип</TableHead><TableHead>Дата</TableHead>
              <TableHead>Продавець</TableHead><TableHead>Покупець</TableHead>
              <TableHead className="text-right">База ₴</TableHead><TableHead className="text-right">ПДВ ₴</TableHead><TableHead className="text-right">Разом ₴</TableHead>
              <TableHead>Статус</TableHead><TableHead>Дії</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {invoices.map((inv: any) => {
                const cfg = STATUS_CFG[inv.status] || { label: inv.status, color: "bg-gray-100 text-gray-500" };
                return (
                  <TableRow key={inv.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-xs font-semibold">{inv.pn_series}{inv.pn_number}</TableCell>
                    <TableCell><span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{inv.pn_type === "correction" ? "Корегуюча" : "Стандартна"}</span></TableCell>
                    <TableCell className="text-xs">{inv.pn_date}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{inv.seller_name || inv.seller_name_entity || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{inv.buyer_name || inv.buyer_name_cp || "—"}</TableCell>
                    <TableCell className="text-right text-xs">{fmtNum2(inv.taxable_amount)}</TableCell>
                    <TableCell className="text-right text-xs text-indigo-600">{fmtNum2(inv.vat_amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-sm">{fmtNum2(inv.total_amount)}</TableCell>
                    <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span></TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {inv.status === "draft" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => genXmlMut.mutate(inv.id)} disabled={genXmlMut.isPending}><Code2 className="h-3 w-3 mr-1" />XML</Button>}
                        {(inv.status === "ready" || inv.status === "submitted") && <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-violet-600" onClick={() => medocMut.mutate(inv.id)} disabled={medocMut.isPending}><FolderOpen className="h-3 w-3 mr-1" />MEDoc</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-600" onClick={() => vchasnoMut.mutate(inv.id)} disabled={vchasnoMut.isPending}><ShieldCheck className="h-3 w-3 mr-1" />Вчасно</Button>
                        </>}
                        {inv.xml_content && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { const blob = new Blob([inv.xml_content], { type: "application/xml" }); const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = `PN_${inv.pn_number}.xml`; a.click(); URL.revokeObjectURL(u); }}><Download className="h-3 w-3" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!invoices.length && <TableRow><TableCell colSpan={10} className="text-center text-xs text-gray-400 py-8">Немає податкових накладних</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-2">Workflow реєстрації ПН в Україні:</p>
        <div className="flex items-center gap-2 flex-wrap">
          {["1. Створити ПН", "→", "2. Генерувати XML (J1201009)", "→", "3. Підписати КЕП", "→", "4. Відправити в MEDoc / Вчасно", "→", "5. Реєстрація в ДПС"].map((s, i) => (
            <span key={i} className={s === "→" ? "text-blue-400" : "bg-blue-100 px-2 py-1 rounded font-medium"}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BAS / 1C EXPORT TAB ─────────────────────────────────────────────────────
function BasExportTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ dateFrom: "", dateTo: "", format: "bas_xml" });
  const [result, setResult] = useState<any>(null);

  const { data: historyData, isLoading: histLoading } = useQuery({
    queryKey: ["bas-history"], queryFn: () => acctFetch("export/bas/history"), staleTime: 30_000,
  });

  const exportMut = useMutation({
    mutationFn: (body: any) => acctFetch("export/bas", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["bas-history"] }); setResult(d); },
  });

  const markMut = useMutation({
    mutationFn: (id: number) => acctFetch(`export/bas/${id}/mark-imported`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bas-history"] }),
  });

  const handleDownload = (xml: string, fileName: string) => {
    const blob = new Blob([xml], { type: "application/xml" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = fileName; a.click(); URL.revokeObjectURL(u);
  };

  const history = historyData?.exports || [];
  const STATUS_C: Record<string, string> = { generated: "bg-blue-100 text-blue-700", imported: "bg-green-100 text-green-700" };

  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        {/* Export form */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="h-5 w-5 text-indigo-600" />
            <h3 className="font-semibold">Експорт до BAS / 1C</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Дата від</Label><Input type="date" value={form.dateFrom} onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} /></div>
            <div><Label className="text-xs">Дата до</Label><Input type="date" value={form.dateTo} onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} /></div>
          </div>
          <div>
            <Label className="text-xs">Формат</Label>
            <Select value={form.format} onValueChange={v => setForm(f => ({ ...f, format: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bas_xml">BAS XML (J1201009)</SelectItem>
                <SelectItem value="bas_v8">BAS 8.x XML</SelectItem>
                <SelectItem value="medoc_xml">M.E.Doc XML</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => exportMut.mutate(form)} disabled={exportMut.isPending}>
            {exportMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Генерація...</> : <><Download className="h-4 w-4 mr-1" />Генерувати XML</>}
          </Button>
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" /><p className="text-sm font-medium text-green-800">Експорт: {result.docCount} документів</p></div>
              <Button size="sm" className="w-full" variant="outline" onClick={() => handleDownload(result.xml, result.fileName)}>
                <Download className="h-4 w-4 mr-1" />Завантажити {result.fileName}
              </Button>
              <div className="text-xs text-green-700 bg-green-100 rounded p-2">
                <p className="font-semibold">Імпорт в BAS:</p>
                <p>{result.instructions?.bas}</p>
              </div>
            </div>
          )}
        </div>

        {/* Integration guides */}
        <div className="space-y-3">
          {[
            {
              name: "BAS / 1C Підприємство",
              icon: Cpu,
              color: "border-blue-200 bg-blue-50",
              steps: ["Меню Файл → Відкрити", "Обрати XML файл експорту", "Документи → Журнал", "Перевірити імпортовані записи"],
              status: "XML адаптер готовий",
              statusColor: "bg-green-100 text-green-700",
            },
            {
              name: "M.E.Doc",
              icon: FolderOpen,
              color: "border-violet-200 bg-violet-50",
              steps: ["Реєстр → Імпорт XML", "Вказати папку обміну", "Отримати квитанцію ДПС", "Перевірити реєстрацію ПН"],
              status: "Файловий обмін",
              statusColor: "bg-violet-100 text-violet-700",
            },
            {
              name: "Вчасно.КЕП / Вчасно",
              icon: ShieldCheck,
              color: "border-green-200 bg-green-50",
              steps: ["Інтеграції → Вчасно → API ключ", "POST /api/v1/documents", "Підписати КЕП через API", "Відстежити статус реєстрації"],
              status: "REST API готовий",
              statusColor: "bg-green-100 text-green-700",
            },
          ].map(({ name, icon: Icon, color, steps, status, statusColor }) => (
            <div key={name} className={`border rounded-xl p-4 ${color}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><Icon className="h-4 w-4" /><span className="font-semibold text-sm">{name}</span></div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{status}</span>
              </div>
              <ol className="text-xs space-y-0.5 text-gray-600 list-decimal list-inside">
                {steps.map(s => <li key={s}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* Export history */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <span className="font-semibold text-sm flex items-center gap-2"><Cpu className="h-4 w-4 text-indigo-600" />Історія експортів</span>
        </div>
        {histLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div> : (
          <Table>
            <TableHeader><TableRow className="text-xs"><TableHead>Дата</TableHead><TableHead>Формат</TableHead><TableHead>Период</TableHead><TableHead className="text-center">Документів</TableHead><TableHead>Статус</TableHead><TableHead>Дії</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.map((h: any) => (
                <TableRow key={h.id} className="hover:bg-gray-50">
                  <TableCell className="text-xs">{h.exported_at ? new Date(h.exported_at).toLocaleString("uk-UA") : "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{h.format}</TableCell>
                  <TableCell className="text-xs">{h.date_from || "—"} → {h.date_to || "—"}</TableCell>
                  <TableCell className="text-center font-semibold">{h.doc_count}</TableCell>
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_C[h.status] || "bg-gray-100 text-gray-500"}`}>{h.status === "imported" ? "Імпортовано" : "Згенеровано"}</span></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {h.status === "generated" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markMut.mutate(h.id)}>Позн. імпортованим</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!history.length && <TableRow><TableCell colSpan={6} className="text-center text-xs text-gray-400 py-8">Немає історії експортів</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── SIGNING TAB (КЕП / ЕЦП) ─────────────────────────────────────────────────
function SigningTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ docId: "", signerName: "", signerRole: "director", signatureMethod: "kep", provider: "manual", notes: "" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["signing-requests", filter],
    queryFn: () => acctFetch(`signing-requests${filter !== "all" ? `?status=${filter}` : ""}`), staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: (body: any) => acctFetch("signing-requests", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["signing-requests"] }); setNewOpen(false); },
  });

  const signMut = useMutation({
    mutationFn: ({ id, status }: any) => acctFetch(`signing-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signing-requests"] }),
  });

  const requests = data?.requests || [];
  const STATUS_CFG: Record<string, { label: string; color: string }> = {
    pending:  { label: "Очікує підпису", color: "bg-amber-100 text-amber-700" },
    signed:   { label: "Підписано",      color: "bg-green-100 text-green-700" },
    rejected: { label: "Відхилено",      color: "bg-red-100 text-red-700" },
    expired:  { label: "Закінчився",     color: "bg-gray-100 text-gray-500" },
  };

  const METHODS = { kep: "КЕП (ДСТУ 4145)", es: "ЕЦП", dia: "Дія.Підпис", privat: "Приват24 Бізнес", vchasno: "Вчасно.КЕП" };
  const PROVIDERS = { manual: "Ручне підписання", medoc: "M.E.Doc", vchasno: "Вчасно", dia: "Дія" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Черга підписання</h2>
          <p className="text-xs text-gray-400">КЕП · ЕЦП · Дія.Підпис · Вчасно.КЕП · Ручний підпис</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {["pending","signed","rejected","all"].map(s => (
              <button key={s} onClick={() => setFilter(s)} className={`text-xs px-2.5 py-1 rounded-md transition-colors ${filter === s ? "bg-white shadow text-indigo-600 font-medium" : "text-gray-500"}`}>
                {s === "all" ? "Всі" : STATUS_CFG[s]?.label || s}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Запит</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Новий запит на підписання</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">ID документа</Label><Input type="number" value={form.docId} onChange={e => setForm(f => ({ ...f, docId: e.target.value }))} /></div>
                <div><Label className="text-xs">Підписант</Label><Input value={form.signerName} onChange={e => setForm(f => ({ ...f, signerName: e.target.value }))} placeholder="ПІБ підписанта" /></div>
                <div>
                  <Label className="text-xs">Роль</Label>
                  <Select value={form.signerRole} onValueChange={v => setForm(f => ({ ...f, signerRole: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="director">Директор</SelectItem>
                      <SelectItem value="accountant">Бухгалтер</SelectItem>
                      <SelectItem value="authorized">Уповноважений</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Метод підпису</Label>
                  <Select value={form.signatureMethod} onValueChange={v => setForm(f => ({ ...f, signatureMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Провайдер</Label>
                  <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(PROVIDERS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Нотатки</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button className="w-full" onClick={() => createMut.mutate({ ...form, docId: form.docId ? parseInt(form.docId) : undefined })} disabled={createMut.isPending}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Створити запит
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KEP providers info */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { name: "M.E.Doc КЕП", color: "bg-violet-50 border-violet-200", ready: true },
          { name: "Вчасно.КЕП", color: "bg-green-50 border-green-200", ready: true },
          { name: "Дія.Підпис", color: "bg-blue-50 border-blue-200", ready: false },
          { name: "Приват24 Бізнес", color: "bg-emerald-50 border-emerald-200", ready: false },
          { name: "ДПС ІВС", color: "bg-orange-50 border-orange-200", ready: false },
        ].map(({ name, color, ready }) => (
          <div key={name} className={`border rounded-lg p-2.5 text-center ${color}`}>
            <p className="text-xs font-medium text-gray-700">{name}</p>
            <span className={`text-xs ${ready ? "text-green-600" : "text-amber-500"}`}>{ready ? "✓ Готовий" : "⚙ Placeholder"}</span>
          </div>
        ))}
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader><TableRow className="bg-gray-50 text-xs">
              <TableHead>Дата</TableHead><TableHead>Документ</TableHead><TableHead>Підписант</TableHead>
              <TableHead>Роль</TableHead><TableHead>Метод</TableHead><TableHead>Провайдер</TableHead>
              <TableHead>Статус</TableHead><TableHead>Дії</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {requests.map((r: any) => {
                const cfg = STATUS_CFG[r.status] || { label: r.status, color: "bg-gray-100 text-gray-500" };
                return (
                  <TableRow key={r.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs">{new Date(r.requested_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell className="font-mono text-xs">{r.doc_number || `Doc #${r.doc_id}` || "—"}</TableCell>
                    <TableCell className="text-sm">{r.signer_name || "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{r.signer_role}</TableCell>
                    <TableCell><span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{METHODS[r.signature_method as keyof typeof METHODS] || r.signature_method}</span></TableCell>
                    <TableCell className="text-xs capitalize">{PROVIDERS[r.provider as keyof typeof PROVIDERS] || r.provider}</TableCell>
                    <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span></TableCell>
                    <TableCell>
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => signMut.mutate({ id: r.id, status: "signed" })}><BadgeCheck className="h-3 w-3 mr-1" />Підписано</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => signMut.mutate({ id: r.id, status: "rejected" })}>Відхилити</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!requests.length && <TableRow><TableCell colSpan={8} className="text-center text-xs text-gray-400 py-8">Немає запитів зі статусом «{STATUS_CFG[filter]?.label || filter}»</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── ARCHIVE TAB ──────────────────────────────────────────────────────────────
function ArchiveTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: "", documentType: "invoice", category: "primary", counterpartyName: "", docDate: "", amount: "", retentionYears: "10", isOriginal: false, isSigned: false, hasKep: false, fileName: "", notes: "" });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["doc-archive", search, category],
    queryFn: () => acctFetch(`archive${(search || category) ? `?${search ? `search=${encodeURIComponent(search)}` : ""}${category ? `&category=${category}` : ""}` : ""}`),
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: (body: any) => acctFetch("archive", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["doc-archive"] }); setAddOpen(false); setForm({ title: "", documentType: "invoice", category: "primary", counterpartyName: "", docDate: "", amount: "", retentionYears: "10", isOriginal: false, isSigned: false, hasKep: false, fileName: "", notes: "" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => acctFetch(`archive/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doc-archive"] }),
  });

  const docs = data?.documents || [];
  const CATS: Record<string, { label: string; color: string }> = {
    primary:    { label: "Первинні", color: "bg-blue-100 text-blue-700" },
    contract:   { label: "Договори", color: "bg-violet-100 text-violet-700" },
    tax:        { label: "Податкові", color: "bg-orange-100 text-orange-700" },
    hr:         { label: "Кадрові", color: "bg-emerald-100 text-emerald-700" },
    other:      { label: "Інше", color: "bg-gray-100 text-gray-600" },
  };
  const DOC_TYPES = { invoice: "Рахунок", act: "Акт", tax_invoice: "Подат. накл.", contract: "Договір", payment: "Платіжка", report: "Звіт", other: "Інше" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Цифровий архів документів</h2>
          <p className="text-xs text-gray-400">Первинні документи · 10 рочне зберігання · GDPR-compliant</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white border rounded-lg px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <Input className="border-none h-6 p-0 w-36 text-xs focus-visible:ring-0" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Категорія" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Всі</SelectItem>
              {Object.entries(CATS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />До архіву</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Додати до архіву</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">Назва документа *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Тип документа</Label>
                    <Select value={form.documentType} onValueChange={v => setForm(f => ({ ...f, documentType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Категорія</Label>
                    <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(CATS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">Контрагент</Label><Input value={form.counterpartyName} onChange={e => setForm(f => ({ ...f, counterpartyName: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Дата документа</Label><Input type="date" value={form.docDate} onChange={e => setForm(f => ({ ...f, docDate: e.target.value }))} /></div>
                  <div><Label className="text-xs">Сума ₴</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
                </div>
                <div><Label className="text-xs">Назва файлу</Label><Input value={form.fileName} onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))} placeholder="document.pdf" /></div>
                <div>
                  <Label className="text-xs">Зберігання (роки)</Label>
                  <Select value={form.retentionYears} onValueChange={v => setForm(f => ({ ...f, retentionYears: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="3">3 роки</SelectItem><SelectItem value="5">5 років</SelectItem><SelectItem value="10">10 років (рекоменд.)</SelectItem><SelectItem value="75">75 років (кадрові)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="flex gap-4">
                  {[["isOriginal", "Оригінал"], ["isSigned", "Підписаний"], ["hasKep", "З КЕП"]].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={form[key as keyof typeof form] as boolean} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} className="rounded" />
                      {label}
                    </label>
                  ))}
                </div>
                <div><Label className="text-xs">Примітки</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button className="w-full" onClick={() => createMut.mutate({ ...form, amount: form.amount ? parseFloat(form.amount) : undefined, retentionYears: parseInt(form.retentionYears) })} disabled={!form.title || createMut.isPending}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Архівувати
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(CATS).map(([key, { label, color }]) => {
          const cnt = docs.filter((d: any) => d.category === key).length;
          return (
            <button key={key} onClick={() => setCategory(category === key ? "" : key)} className={`border-2 rounded-xl p-3 text-center transition-all ${category === key ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <p className="text-lg font-bold text-gray-800">{cnt}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>{label}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader><TableRow className="bg-gray-50 text-xs">
              <TableHead>Архів №</TableHead><TableHead>Категорія</TableHead><TableHead>Тип</TableHead>
              <TableHead>Назва</TableHead><TableHead>Контрагент</TableHead><TableHead>Дата</TableHead>
              <TableHead className="text-right">Сума ₴</TableHead><TableHead>Атрибути</TableHead>
              <TableHead>Зберігати до</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {docs.map((d: any) => (
                <TableRow key={d.id} className="hover:bg-gray-50">
                  <TableCell className="font-mono text-xs text-gray-500">{d.archive_number}</TableCell>
                  <TableCell><span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CATS[d.category]?.color || "bg-gray-100 text-gray-500"}`}>{CATS[d.category]?.label || d.category}</span></TableCell>
                  <TableCell className="text-xs">{DOC_TYPES[d.document_type as keyof typeof DOC_TYPES] || d.document_type}</TableCell>
                  <TableCell className="text-sm font-medium max-w-[180px] truncate" title={d.title}>{d.title}</TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[120px] truncate">{d.counterparty_name || "—"}</TableCell>
                  <TableCell className="text-xs">{d.doc_date || "—"}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{d.amount ? fmtCur2(d.amount) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {d.is_original && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">ORG</span>}
                      {d.is_signed && <span className="text-xs bg-green-100 text-green-700 px-1 rounded">SGN</span>}
                      {d.has_kep && <span className="text-xs bg-violet-100 text-violet-700 px-1 rounded">КЕП</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{d.retain_until || "—"}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 p-0" onClick={() => { if (confirm("Видалити запис архіву?")) deleteMut.mutate(d.id); }}>✕</Button></TableCell>
                </TableRow>
              ))}
              {!docs.length && <TableRow><TableCell colSpan={10} className="text-center text-xs text-gray-400 py-10">Архів порожній. Додайте перший документ.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── ACC: CHART OF ACCOUNTS (ПЛАН РАХУНКІВ) ───────────────────────────────────
function AccChartOfAccountsTab() {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const qc = useQueryClient();

  const { data: accData, isLoading, refetch } = useAccLedger("accounts");
  const accounts = Array.isArray(accData) ? accData : [];

  const createMut = useMutation({
    mutationFn: (body: any) => accFetch("accounts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["acc-ledger", "accounts"] }); setAddOpen(false); setForm({}); },
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, is_active }: any) => accFetch(`accounts/${id}`, { method: "PATCH", body: JSON.stringify({ is_active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acc-ledger", "accounts"] }),
  });

  const types: Record<string, string> = { asset: "blue", liability: "orange", equity: "purple", income: "green", expense: "red", tax: "slate" };
  const typeLabels: Record<string, string> = { asset: "Актив", liability: "Пасив", equity: "Капітал", income: "Дохід", expense: "Витрати", tax: "Податок" };

  let filtered = accounts.filter((a: any) => {
    if (search && !a.code.includes(search) && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (classFilter !== "all" && String(a.class) !== classFilter) return false;
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9 w-48 h-9 text-sm" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Клас" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі класи</SelectItem>
              {[1,2,3,4,5,6,7,8,9].map(c => <SelectItem key={c} value={String(c)}>Клас {c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Тип" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі типи</SelectItem>
              {Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {accounts.length === 0 && !isLoading && (
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1"/> Завантажити НП(С)БО №291</Button>
          )}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Додати рахунок</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Новий рахунок</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Код</Label><Input value={form.code || ""} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
                <div><Label>Назва</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div>
                  <Label>Тип</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Клас (1-9)</Label>
                  <Select value={form.class ? String(form.class) : undefined} onValueChange={v => setForm({ ...form, class: parseInt(v) })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{[1,2,3,4,5,6,7,8,9].map(c => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>Зберегти</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Код</TableHead><TableHead>Назва</TableHead><TableHead>Тип</TableHead>
                <TableHead>Клас</TableHead><TableHead>Активний</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-sm font-semibold">{a.code}</TableCell>
                  <TableCell className="text-sm" style={{ paddingLeft: a.parent_id ? '2rem' : '1rem' }}>{a.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`bg-${types[a.type]}-50 text-${types[a.type]}-700 border-${types[a.type]}-200`}>
                      {typeLabels[a.type] || a.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{a.class}</TableCell>
                  <TableCell>
                    <Switch checked={a.is_active} onCheckedChange={(v) => toggleActiveMut.mutate({ id: a.id, is_active: v })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── ACC: JOURNAL (ЖУРНАЛ ПРОВОДОК) ───────────────────────────────────────────
function AccJournalTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const qc = useQueryClient();

  const { data, isLoading } = useAccLedger(`entries?from=${dateFrom}&to=${dateTo}&account_code=${search}`);
  const { data: accs } = useAccLedger("accounts");

  const createMut = useMutation({
    mutationFn: (body: any) => accFetch("entries", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["acc-ledger"] }); setAddOpen(false); setForm({}); },
  });
  
  const deleteMut = useMutation({
    mutationFn: (id: number) => accFetch(`entries/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acc-ledger"] }),
  });

  const entries = Array.isArray(data) ? data : [];

  const fmtNumLoc = (n: number | string) => n ? Number(n).toFixed(2) : "0.00";

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Input type="date" className="w-40 h-9 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">-</span>
        <Input type="date" className="w-40 h-9 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <Input className="w-48 h-9 text-sm" placeholder="Код рахунку..." value={search} onChange={e => setSearch(e.target.value)} />
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm" className="ml-auto"><Plus className="h-4 w-4 mr-1"/>Ручна проводка</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Нова проводка</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Дата</Label><Input type="date" value={form.entry_date || ""} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
              <div><Label>Дебет</Label>
                <Select value={form.debit_account_id ? String(form.debit_account_id) : ""} onValueChange={v => setForm({ ...form, debit_account_id: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Дт" /></SelectTrigger>
                  <SelectContent>{(accs?.accounts||[]).filter((a: any)=>a.is_active).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Кредит</Label>
                <Select value={form.credit_account_id ? String(form.credit_account_id) : ""} onValueChange={v => setForm({ ...form, credit_account_id: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Кт" /></SelectTrigger>
                  <SelectContent>{(accs?.accounts||[]).filter((a: any)=>a.is_active).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Сума</Label><Input type="number" value={form.amount || ""} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>Опис</Label><Input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <Button className="w-full" onClick={() => createMut.mutate({ ...form, amount: parseFloat(form.amount) })} disabled={createMut.isPending}>Зберегти</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Дата</TableHead><TableHead>Дт</TableHead><TableHead>Назва Дт</TableHead>
                <TableHead>Кт</TableHead><TableHead>Назва Кт</TableHead><TableHead className="text-right">Сума</TableHead>
                <TableHead>Опис</TableHead><TableHead>Документ</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{e.entry_date ? format(new Date(e.entry_date), "dd.MM.yyyy") : "—"}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{e.debit_code}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{e.debit_name}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{e.credit_code}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{e.credit_name}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{fmtNumLoc(e.amount)}</TableCell>
                  <TableCell className="text-xs text-gray-600">{e.description}</TableCell>
                  <TableCell className="text-xs text-gray-400">{e.doc_id ? `Doc #${e.doc_id}` : e.is_manual ? "Ручна" : "—"}</TableCell>
                  <TableCell>
                    {e.is_manual && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => deleteMut.mutate(e.id)}><XCircle className="h-4 w-4"/></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="bg-gray-50 p-4 border-t text-sm font-semibold flex justify-end gap-4">
            <span>Всього оборот:</span>
            <span className="text-blue-600">{fmtNumLoc(entries.reduce((a:number, e:any)=>a + parseFloat(e.amount), 0))} ₴</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ACC: DOCUMENTS (ДОКУМЕНТИ) ───────────────────────────────────────────────
function AccDocumentsTab() {
  const [type, setType] = useState("");
  const qc = useQueryClient();
  const { data, isLoading } = useAccLedger(`documents${type ? `?doc_type=${type}` : ""}`);
  const docs = Array.isArray(data) ? data : [];

  const postMut = useMutation({
    mutationFn: (id: number) => accFetch(`documents/${id}/post`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acc-ledger"] }),
  });

  const Types: Record<string, string> = {
    invoice_out: "Видаткова накладна", invoice_in: "Прибуткова накладна",
    act_out: "Акт (видача)", act_in: "Акт (отримання)",
    payment_in: "Оплата отримана", payment_out: "Оплата сплачена",
    advance_in: "Аванс отриманий", advance_out: "Аванс виданий",
    payroll: "Нарахування ЗП", esv: "ЄСВ"
  };

  const fmtNumLoc = (n: number | string) => n ? Number(n).toFixed(2) : "0.00";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-48 h-9 text-sm"><SelectValue placeholder="Всі типи" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Всі типи</SelectItem>
            {Object.entries(Types).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="ml-auto"><Plus className="h-4 w-4 mr-1"/>Створити документ</Button>
      </div>
      {isLoading ? <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow><TableHead>Дата</TableHead><TableHead>Номер</TableHead><TableHead>Тип</TableHead><TableHead>Контрагент</TableHead><TableHead className="text-right">Сума</TableHead><TableHead>Статус</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs">{d.doc_date ? format(new Date(d.doc_date), "dd.MM.yyyy") : "—"}</TableCell>
                  <TableCell className="text-xs font-semibold">{d.doc_number}</TableCell>
                  <TableCell className="text-xs">{Types[d.doc_type] || d.doc_type}</TableCell>
                  <TableCell className="text-xs">{d.contractor_name || "—"}</TableCell>
                  <TableCell className="text-sm font-semibold text-right">{fmtNumLoc(d.total)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={d.status === "posted" ? "bg-green-50 text-green-700" : d.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"}>
                      {d.status === "posted" ? "Проведено" : d.status === "draft" ? "Чернетка" : "Скасовано"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {d.status === "draft" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => postMut.mutate(d.id)}>Провести</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── ACC: CONTRACTORS (КОНТРАГЕНТИ) ───────────────────────────────────────────
function AccContractorsTab() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<any>({ contractor_type: "both" });
  const qc = useQueryClient();
  const { data, isLoading } = useAccLedger(`contractors${search ? `?search=${encodeURIComponent(search)}` : ""}`);
  const list = Array.isArray(data) ? data : [];

  const createMut = useMutation({
    mutationFn: (body: any) => accFetch("contractors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["acc-ledger"] }); setAddOpen(false); setForm({ contractor_type: "both" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input className="w-64 h-9 text-sm" placeholder="Пошук за назвою або ЄДРПОУ..." value={search} onChange={e => setSearch(e.target.value)} />
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm" className="ml-auto"><Plus className="h-4 w-4 mr-1"/>Додати</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новий контрагент</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Назва *</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>ЄДРПОУ</Label><Input value={form.edrpou || ""} onChange={e => setForm({ ...form, edrpou: e.target.value })} /></div>
              <div><Label>ІПН</Label><Input value={form.ipn || ""} onChange={e => setForm({ ...form, ipn: e.target.value })} /></div>
              <div><Label>№ ПДВ</Label><Input value={form.vat_number || ""} onChange={e => setForm({ ...form, vat_number: e.target.value })} /></div>
              <div><Label>Тип</Label>
                <Select value={form.contractor_type} onValueChange={v => setForm({ ...form, contractor_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Покупець</SelectItem>
                    <SelectItem value="supplier">Постачальник</SelectItem>
                    <SelectItem value="both">Обидва</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Адреса</Label><Input value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <Button className="w-full" onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>Зберегти</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow><TableHead>Назва</TableHead><TableHead>ЄДРПОУ</TableHead><TableHead>ІПН</TableHead><TableHead>Тип</TableHead><TableHead>Статус</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm font-medium">{c.name}</TableCell>
                  <TableCell className="text-xs font-mono">{c.edrpou || "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{c.ipn || "—"}</TableCell>
                  <TableCell className="text-xs capitalize">{c.contractor_type}</TableCell>
                  <TableCell><Badge variant="outline">{c.is_active ? "Активний" : "Неактивний"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── ACC: VAT (ПДВ) ───────────────────────────────────────────────────────────
function AccVatTab() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString());
  const [view, setView]   = useState<"declaration" | "d5">("declaration");
  const { data, isLoading } = useAccLedger(`vat/declaration?year=${year}&month=${month}`);
  const { data: d5, isLoading: d5Loading } = useAccLedger(`vat/declaration/d5?year=${year}&month=${month}`);
  const fmt2 = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const MONTHS_UK = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{[2023,2024,2025,2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_UK.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex border rounded-lg overflow-hidden ml-auto">
          {(["declaration","d5"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${view===v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {v === "declaration" ? "Декларація" : "Додаток Д5"}
            </button>
          ))}
        </div>
      </div>

      {view === "declaration" && (
        isLoading ? <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : (
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-1"><CardTitle className="text-xs text-red-700">Зобов'язання (Р6)</CardTitle></CardHeader>
                <CardContent className="pt-0"><div className="text-2xl font-bold text-red-700">{fmt2(data?.section_a?.r6?.vat)} ₴</div><div className="text-xs text-red-500 mt-0.5">База: {fmt2(data?.issued_base)} ₴</div></CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-1"><CardTitle className="text-xs text-blue-700">Кредит (Р17)</CardTitle></CardHeader>
                <CardContent className="pt-0"><div className="text-2xl font-bold text-blue-700">{fmt2(data?.section_b?.r17?.vat)} ₴</div><div className="text-xs text-blue-500 mt-0.5">База: {fmt2(data?.received_base)} ₴</div></CardContent>
              </Card>
              <Card className={Number(data?.section_c?.r18?.vat) > 0 ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50"}>
                <CardHeader className="pb-1">
                  <CardTitle className={`text-xs ${Number(data?.section_c?.r18?.vat) > 0 ? "text-amber-700" : "text-green-700"}`}>
                    {Number(data?.section_c?.r18?.vat) > 0 ? "До сплати (Р18)" : "Відшкодування (Р19)"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className={`text-2xl font-bold ${Number(data?.section_c?.r18?.vat) > 0 ? "text-amber-700" : "text-green-700"}`}>
                    {fmt2(Number(data?.section_c?.r18?.vat) > 0 ? data?.section_c?.r18?.vat : data?.section_c?.r19?.vat)} ₴
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Section A */}
            <Card>
              <CardHeader className="pb-2 bg-red-50/50 rounded-t-lg border-b"><CardTitle className="text-sm font-bold text-red-800">Розділ А — Податкові зобов'язання</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50"><TableHead>Рядок</TableHead><TableHead className="text-right">База (грн)</TableHead><TableHead className="text-right">ПДВ (грн)</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {[
                      { label: "Р1.1 — Операції 20%",            base: data?.section_a?.r1_1?.base, vat: data?.section_a?.r1_1?.vat },
                      { label: "Р1.2 — Операції 7%",             base: data?.section_a?.r1_2?.base, vat: data?.section_a?.r1_2?.vat },
                      { label: "Р3.1 — 0% (експорт)",            base: data?.section_a?.r3_1?.base, vat: null },
                      { label: "Р4.1 — Звільнені операції",       base: data?.section_a?.r4_1?.base, vat: null },
                    ].map((r, i) => (
                      <TableRow key={i} className="hover:bg-red-50/30">
                        <TableCell className="text-sm text-gray-700">{r.label}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt2(r.base)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-700">{r.vat != null ? fmt2(r.vat) : "—"}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-red-100 border-t-2 border-red-300 font-bold">
                      <TableCell className="text-sm font-bold text-red-800">Р6 — Разом зобов'язання</TableCell>
                      <TableCell className="text-right font-mono font-bold text-red-800">{fmt2(data?.issued_base)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-red-800">{fmt2(data?.section_a?.r6?.vat)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Section B */}
            <Card>
              <CardHeader className="pb-2 bg-blue-50/50 rounded-t-lg border-b"><CardTitle className="text-sm font-bold text-blue-800">Розділ Б — Податковий кредит</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50"><TableHead>Рядок</TableHead><TableHead className="text-right">База (грн)</TableHead><TableHead className="text-right">ПДВ (грн)</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {[
                      { label: "Р10.1 — Кредит 20%", base: data?.section_b?.r10_1?.base, vat: data?.section_b?.r10_1?.vat },
                      { label: "Р10.2 — Кредит 7%",  base: data?.section_b?.r10_2?.base, vat: data?.section_b?.r10_2?.vat },
                    ].map((r, i) => (
                      <TableRow key={i} className="hover:bg-blue-50/30">
                        <TableCell className="text-sm text-gray-700">{r.label}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt2(r.base)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-blue-700">{fmt2(r.vat)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-blue-100 border-t-2 border-blue-300">
                      <TableCell className="text-sm font-bold text-blue-800">Р12 — Разом кредит</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-800">{fmt2(data?.received_base)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-800">{fmt2(data?.section_b?.r12?.vat)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-blue-200 border-t border-blue-400">
                      <TableCell className="text-sm font-bold text-blue-900">Р17 — Загальна сума кредиту</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono font-bold text-blue-900">{fmt2(data?.section_b?.r17?.vat)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Section C */}
            <Card className={Number(data?.section_c?.r18?.vat) > 0 ? "border-amber-300" : "border-green-300"}>
              <CardHeader className="pb-2 rounded-t-lg border-b"><CardTitle className="text-sm font-bold text-gray-800">Розділ В — Розрахунки з бюджетом</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50"><TableHead>Рядок</TableHead><TableHead className="text-right">Сума ПДВ (грн)</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow className={Number(data?.section_c?.r18?.vat) > 0 ? "bg-amber-50" : "bg-gray-50"}>
                      <TableCell className="text-sm font-semibold">Р18 — До сплати (позитивне значення)</TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-700">{fmt2(data?.section_c?.r18?.vat)}</TableCell>
                    </TableRow>
                    <TableRow className={Number(data?.section_c?.r19?.vat) > 0 ? "bg-green-50" : "bg-gray-50"}>
                      <TableCell className="text-sm font-semibold">Р19 — Від'ємне значення (відшкодування)</TableCell>
                      <TableCell className="text-right font-mono font-bold text-green-700">{fmt2(data?.section_c?.r19?.vat)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )
      )}

      {view === "d5" && (
        d5Loading ? <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : (
          <Card>
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-bold text-blue-800">Додаток Д5 — Розшифровка податкового кредиту по постачальниках</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Використовується для заповнення Д5 до декларації ПДВ</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-blue-50">
                  <TableRow>
                    <TableHead>Постачальник</TableHead>
                    <TableHead className="w-32">ІПН</TableHead>
                    <TableHead className="w-32">ЄДРПОУ</TableHead>
                    <TableHead className="text-right w-32">База, грн</TableHead>
                    <TableHead className="text-right w-32">ПДВ, грн</TableHead>
                    <TableHead className="text-right w-20">К-ть ПН</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!d5?.rows || d5.rows.length === 0) ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">Немає вхідних ПН за вказаний період</TableCell></TableRow>
                  ) : d5.rows.map((r: any, i: number) => (
                    <TableRow key={i} className="hover:bg-blue-50/30">
                      <TableCell className="text-sm font-medium">{r.contractor_name}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-600">{r.ipn || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-600">{r.edrpou || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt2(r.base)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-blue-700 font-semibold">{fmt2(r.vat)}</TableCell>
                      <TableCell className="text-right text-sm text-gray-500">{r.records_count}</TableCell>
                    </TableRow>
                  ))}
                  {d5?.rows?.length > 0 && (
                    <TableRow className="bg-blue-100 border-t-2 border-blue-300 font-bold">
                      <TableCell colSpan={3} className="text-sm font-bold text-blue-900">РАЗОМ</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-900">{fmt2(d5?.total?.base)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-900">{fmt2(d5?.total?.vat)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

// ─── ACC: REPORTS (ЗВІТИ) ─────────────────────────────────────────────────────
function AccReportsTab() {
  const now = new Date();
  const [reportType, setReportType] = useState<"osv" | "pnl" | "balance">("osv");
  const [year, setYear]   = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [asDate, setAsDate] = useState(format(now, "yyyy-MM-dd"));
  const qc = useQueryClient();

  const osvPath  = `reports/trial-balance?year=${year}&month=${month}`;
  const pnlPath  = `reports/profit-loss?year=${year}&month=${month}`;
  const balPath  = `reports/balance-sheet?date=${asDate}`;

  const { data: osvRaw, isLoading: osvLoading } = useQuery({ queryKey: ["acc-ledger", osvPath], queryFn: () => accFetch(osvPath), staleTime: 30_000, enabled: reportType === "osv" });
  const { data: pnlData, isLoading: pnlLoading } = useQuery({ queryKey: ["acc-ledger", pnlPath], queryFn: () => accFetch(pnlPath), staleTime: 30_000, enabled: reportType === "pnl" });
  const { data: balData, isLoading: balLoading } = useQuery({ queryKey: ["acc-ledger", balPath], queryFn: () => accFetch(balPath), staleTime: 30_000, enabled: reportType === "balance" });

  const osvData: any[] = osvRaw?.rows ?? (Array.isArray(osvRaw) ? osvRaw : []);
  const loading = osvLoading || pnlLoading || balLoading;
  const fmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const MONTHS = [
    ["1","Січень"],["2","Лютий"],["3","Березень"],["4","Квітень"],
    ["5","Травень"],["6","Червень"],["7","Липень"],["8","Серпень"],
    ["9","Вересень"],["10","Жовтень"],["11","Листопад"],["12","Грудень"],
  ];
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const PNL_SECTIONS: Record<string, string> = { A: "А. Доходи від реалізації", B: "Б. Операційна діяльність", C: "В. Інша діяльність", D: "Г. Результат" };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border rounded-lg overflow-hidden">
          {([
            { id: "osv",     label: "ОСВ" },
            { id: "pnl",     label: "Форма 2 (Ф2)" },
            { id: "balance", label: "Баланс (Ф1)" },
          ] as const).map(({ id, label }) => (
            <button key={id} onClick={() => setReportType(id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${reportType === id ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {reportType !== "balance" ? (
            <>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </>
          ) : (
            <Input type="date" value={asDate} onChange={e => setAsDate(e.target.value)} className="w-40 h-8 text-xs" />
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5"
            onClick={() => qc.invalidateQueries({ queryKey: ["acc-ledger", reportType === "osv" ? osvPath : reportType === "pnl" ? pnlPath : balPath] })}>
            <RefreshCw className="w-3.5 h-3.5" /> Оновити
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div>
      ) : (
        <>
          {/* ═══ ОСВ ═══ */}
          {reportType === "osv" && (
            <Card>
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-blue-600" />
                  Оборотно-сальдова відомість — {MONTHS.find(m => m[0] === month)?.[1]} {year}
                  {osvData.length > 0 && <Badge className="ml-2 text-[10px]">{osvData.length} рахунків</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-gray-50 text-[11px]">
                    <TableRow>
                      <TableHead className="w-20 text-center">Рахунок</TableHead>
                      <TableHead>Назва рахунку</TableHead>
                      <TableHead className="text-right w-28 text-gray-600">Сальдо поч. Дт</TableHead>
                      <TableHead className="text-right w-28 text-gray-600">Сальдо поч. Кт</TableHead>
                      <TableHead className="text-right w-28 text-blue-700">Оборот Дт</TableHead>
                      <TableHead className="text-right w-28 text-orange-700">Оборот Кт</TableHead>
                      <TableHead className="text-right w-28 text-gray-800">Сальдо кін. Дт</TableHead>
                      <TableHead className="text-right w-28 text-gray-800">Сальдо кін. Кт</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {osvData.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                        <Scale className="w-8 h-8 mx-auto mb-2 opacity-30" />Проводок за обраний місяць не знайдено
                      </TableCell></TableRow>
                    ) : osvData.map((r: any, i: number) => {
                      const ob = Number(r.opening_balance || 0);
                      const cb = Number(r.closing_balance || 0);
                      return (
                        <TableRow key={i} className="hover:bg-gray-50">
                          <TableCell className="font-mono text-sm font-bold text-blue-800 text-center">{r.code}</TableCell>
                          <TableCell className="text-xs text-gray-700 max-w-xs truncate">{r.name}</TableCell>
                          <TableCell className="text-right text-xs font-medium text-gray-700">{ob > 0 ? fmt(ob) : "—"}</TableCell>
                          <TableCell className="text-right text-xs font-medium text-gray-700">{ob < 0 ? fmt(Math.abs(ob)) : "—"}</TableCell>
                          <TableCell className="text-right text-xs font-medium text-blue-700">{Number(r.debit_turn) > 0 ? fmt(r.debit_turn) : "—"}</TableCell>
                          <TableCell className="text-right text-xs font-medium text-orange-700">{Number(r.credit_turn) > 0 ? fmt(r.credit_turn) : "—"}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-gray-900">{cb > 0 ? fmt(cb) : "—"}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-gray-900">{cb < 0 ? fmt(Math.abs(cb)) : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  {osvData.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2 border-blue-300">
                      <tr className="font-bold text-[11px]">
                        <td colSpan={2} className="px-4 py-2 text-blue-900">РАЗОМ</td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {fmt(osvData.reduce((s, r) => s + Math.max(0, Number(r.opening_balance||0)), 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {fmt(osvData.reduce((s, r) => s + Math.max(0, -Number(r.opening_balance||0)), 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-blue-800">
                          {fmt(osvData.reduce((s, r) => s + Number(r.debit_turn||0), 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-orange-800">
                          {fmt(osvData.reduce((s, r) => s + Number(r.credit_turn||0), 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {fmt(osvData.reduce((s, r) => s + Math.max(0, Number(r.closing_balance||0)), 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {fmt(osvData.reduce((s, r) => s + Math.max(0, -Number(r.closing_balance||0)), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ═══ Ф2 — Звіт про фінансові результати ═══ */}
          {reportType === "pnl" && pnlData && (
            <div className="space-y-4">
              {/* KPI */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="p-4">
                    <div className="text-xs text-green-700 font-medium mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Чистий дохід (Р2000)</div>
                    <div className="text-2xl font-bold text-green-700">{fmt(pnlData.rows?.find((r:any)=>r.code==="2000")?.value ?? 0)}</div>
                  </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="p-4">
                    <div className="text-xs text-red-700 font-medium mb-1 flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5" />Валовий прибуток (Р2090)</div>
                    <div className="text-2xl font-bold text-red-700">{fmt(pnlData.rows?.find((r:any)=>r.code==="2090")?.value ?? 0)}</div>
                  </CardContent>
                </Card>
                <Card className={`border-2 ${(pnlData.netProfit ?? 0) >= 0 ? "border-blue-300 bg-blue-50" : "border-orange-300 bg-orange-50"}`}>
                  <CardContent className="p-4">
                    <div className={`text-xs font-medium mb-1 ${(pnlData.netProfit ?? 0) >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                      Чистий {(pnlData.netProfit ?? 0) >= 0 ? "прибуток" : "збиток"} (Р2350)
                    </div>
                    <div className={`text-2xl font-bold ${(pnlData.netProfit ?? 0) >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                      {fmt(Math.abs(pnlData.netProfit ?? 0))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-sm font-bold text-gray-800">
                    Звіт про фінансові результати — НП(С)БО 1, Форма 2
                    <span className="ml-2 text-xs font-normal text-gray-400">{MONTHS.find(m=>m[0]===month)?.[1]} {year}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="w-20">Рядок</TableHead>
                        <TableHead>Стаття</TableHead>
                        <TableHead className="text-right w-40">Сума, грн</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        let lastSection = "";
                        return (pnlData.rows ?? []).map((r: any, i: number) => {
                          const sectionChanged = r.section !== lastSection;
                          if (sectionChanged) lastSection = r.section;
                          return (
                            <>
                              {sectionChanged && (
                                <TableRow key={`sec-${r.section}`} className="bg-gray-100 border-t border-gray-200">
                                  <TableCell colSpan={3} className="text-[10px] font-bold text-gray-500 uppercase tracking-wide py-1.5 px-4">
                                    {PNL_SECTIONS[r.section]}
                                  </TableCell>
                                </TableRow>
                              )}
                              <TableRow key={i} className={`hover:bg-gray-50 ${r.bold ? "bg-blue-50/40" : ""} ${r.final ? "bg-blue-100 border-t-2 border-blue-300" : ""}`}>
                                <TableCell className={`font-mono text-xs text-center ${r.bold ? "font-bold text-blue-800" : "text-gray-500"}`}>{r.code}</TableCell>
                                <TableCell className={`text-xs ${r.bold ? "font-semibold text-gray-900" : "text-gray-700"} ${r.final ? "font-bold text-blue-900" : ""}`}>{r.label}</TableCell>
                                <TableCell className={`text-right font-mono text-sm ${
                                  r.final ? "font-bold " + ((r.value??0) >= 0 ? "text-blue-800" : "text-red-700") :
                                  r.bold ? "font-semibold text-gray-800" :
                                  (r.value ?? 0) >= 0 ? "text-gray-700" : "text-red-600"
                                }`}>
                                  {(r.value ?? 0) !== 0 ? fmt(r.value) : "—"}
                                </TableCell>
                              </TableRow>
                            </>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Balance Sheet */}
          {reportType === "balance" && balData && (
            <div className="grid grid-cols-2 gap-4">
              {/* АКТИВ */}
              <Card>
                <CardHeader className="pb-2 border-b border-blue-100 bg-blue-50/50 rounded-t-lg">
                  <CardTitle className="text-sm font-bold text-blue-800 flex items-center justify-between">
                    <span>АКТИВ</span>
                    <span className="text-lg">{fmt(balData.totalAssets)} грн</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-blue-50">
                      <TableRow>
                        <TableHead className="w-20">Рахунок</TableHead>
                        <TableHead>Стаття</TableHead>
                        <TableHead className="text-right w-36">Сума, грн</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(balData.assets?.length === 0) ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-4 text-gray-400 text-sm">Активи відсутні</TableCell></TableRow>
                      ) : balData.assets?.map((r: any, i: number) => (
                        <TableRow key={i} className="hover:bg-blue-50/50">
                          <TableCell className="font-mono text-xs font-bold text-blue-800">{r.code}</TableCell>
                          <TableCell className="text-xs">{r.name}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-blue-700">{fmt(r.balance)}</TableCell>
                        </TableRow>
                      ))}
                      {balData.assets?.length > 0 && (
                        <TableRow className="bg-blue-100 border-t-2 border-blue-300">
                          <TableCell colSpan={2} className="text-xs font-bold text-blue-900">Баланс актив</TableCell>
                          <TableCell className="text-right text-sm font-bold text-blue-900">{fmt(balData.totalAssets)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* ПАСИВ */}
              <Card>
                <CardHeader className="pb-2 border-b border-purple-100 bg-purple-50/50 rounded-t-lg">
                  <CardTitle className="text-sm font-bold text-purple-800 flex items-center justify-between">
                    <span>ПАСИВ</span>
                    <span className="text-lg">{fmt(balData.totalLiabilities + balData.totalEquity)} грн</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-purple-50">
                      <TableRow>
                        <TableHead className="w-20">Рахунок</TableHead>
                        <TableHead>Стаття</TableHead>
                        <TableHead className="text-right w-36">Сума, грн</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(balData.equity?.length === 0 && balData.liabilities?.length === 0) ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-4 text-gray-400 text-sm">Пасиви відсутні</TableCell></TableRow>
                      ) : null}
                      {balData.equity?.map((r: any, i: number) => (
                        <TableRow key={`eq-${i}`} className="hover:bg-purple-50/50">
                          <TableCell className="font-mono text-xs font-bold text-purple-800">{r.code}</TableCell>
                          <TableCell className="text-xs"><span className="text-purple-600 text-[10px] mr-1">[ВК]</span>{r.name}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-purple-700">{fmt(Math.abs(r.balance))}</TableCell>
                        </TableRow>
                      ))}
                      {balData.liabilities?.map((r: any, i: number) => (
                        <TableRow key={`li-${i}`} className="hover:bg-purple-50/50">
                          <TableCell className="font-mono text-xs font-bold text-purple-800">{r.code}</TableCell>
                          <TableCell className="text-xs"><span className="text-orange-500 text-[10px] mr-1">[Зб]</span>{r.name}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-orange-700">{fmt(Math.abs(r.balance))}</TableCell>
                        </TableRow>
                      ))}
                      {(balData.equity?.length > 0 || balData.liabilities?.length > 0) && (
                        <TableRow className="bg-purple-100 border-t-2 border-purple-300">
                          <TableCell colSpan={2} className="text-xs font-bold text-purple-900">Баланс пасив</TableCell>
                          <TableCell className="text-right text-sm font-bold text-purple-900">{fmt(balData.totalLiabilities + balData.totalEquity)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Balance check */}
              <div className={`col-span-2 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                Math.abs(balData.totalAssets - balData.totalLiabilities - balData.totalEquity) < 0.01
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-orange-50 text-orange-700 border border-orange-200"
              }`}>
                {Math.abs(balData.totalAssets - balData.totalLiabilities - balData.totalEquity) < 0.01 ? (
                  <><CheckCircle2 className="w-4 h-4" /> Баланс зійшовся: Актив = Пасив = {fmt(balData.totalAssets)} грн</>
                ) : (
                  <><AlertCircle className="w-4 h-4" /> Баланс не зійшовся. Різниця: {fmt(Math.abs(balData.totalAssets - balData.totalLiabilities - balData.totalEquity))} грн</>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── ACC: SYNC TAB ────────────────────────────────────────────────────────────
const SYNC_SOURCES = [
  {
    id: "poster",
    name: "Poster POS",
    icon: "🖨️",
    desc: "Щоденна виручка з ресторану/кафе. Дт 361→703 (дохід), Дт 703→6411 (ПДВ), Дт 311/30→361 (оплата).",
    color: "orange",
    accent: "bg-orange-50 border-orange-200",
    badge: "bg-orange-100 text-orange-700",
    docsLabel: "Документів",
    endpoint: "poster",
  },
  {
    id: "checkbox",
    name: "Checkbox ПРРО",
    icon: "🧾",
    desc: "Z-звіти з програмного РРО. Дт 30→702 (готівка), Дт 311→702 (безготівка), Дт 702→6411 (ПДВ).",
    color: "green",
    accent: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-700",
    docsLabel: "Z-звітів",
    endpoint: "checkbox",
  },
  {
    id: "liqpay",
    name: "LiqPay",
    icon: "💳",
    desc: "Онлайн-платежі. Банківська виписка + Дт 311→361 (зарахування від клієнта).",
    color: "blue",
    accent: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    docsLabel: "Платежів",
    endpoint: "liqpay",
  },
  {
    id: "servio",
    name: "Servio PMS",
    icon: "🏨",
    desc: "Виїзди гостей з PMS. Дт 361→703 (виручка проживання), Дт 703→6411 (ПДВ 20%).",
    color: "purple",
    accent: "bg-purple-50 border-purple-200",
    badge: "bg-purple-100 text-purple-700",
    docsLabel: "Виїздів",
    endpoint: "servio",
  },
] as const;

function AccSyncTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState(format(now, "yyyy-MM-dd"));
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [lastResult, setLastResult] = useState<Record<string, any>>({});

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["acc-sync-status"],
    queryFn: () => accFetch("sync/status"),
    staleTime: 15_000,
  });

  const { data: logData = [], isLoading: logLoading } = useQuery({
    queryKey: ["acc-sync-log"],
    queryFn: () => accFetch("sync/log"),
    staleTime: 15_000,
  });

  const fmtNum = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 0 });
  const fmtAmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const runSync = async (endpoint: string, sourceName: string) => {
    setRunning(r => ({ ...r, [endpoint]: true }));
    try {
      const result = await accFetch(`sync/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      setLastResult(r => ({ ...r, [endpoint]: result }));
      qc.invalidateQueries({ queryKey: ["acc-sync-status"] });
      qc.invalidateQueries({ queryKey: ["acc-sync-log"] });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
      qc.invalidateQueries({ queryKey: ["acc-bank"] });
      toast({
        title: `${sourceName} — синхронізовано`,
        description: `Документів: ${result.docsCreated ?? result.bankStatementsCreated ?? 0} · Проводок: ${result.entriesCreated ?? 0} · Сума: ${fmtAmt(result.totalAmount)} грн`,
      });
    } catch (e: any) {
      toast({ title: `Помилка синхронізації ${sourceName}`, description: e.message, variant: "destructive" });
    } finally {
      setRunning(r => ({ ...r, [endpoint]: false }));
    }
  };

  const syncAll = async () => {
    for (const src of SYNC_SOURCES) {
      await runSync(src.endpoint, src.name);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Синхронізація з зовнішніми системами</h2>
          <p className="text-xs text-gray-500 mt-0.5">Імпорт продажів і платежів → автоматичні проводки в подвійному обліку</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">Період:</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
          <span className="text-xs text-gray-400">—</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="w-36 h-8 text-xs" />
          <Button onClick={syncAll}
            disabled={Object.values(running).some(Boolean)}
            className="h-8 gap-1.5 bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
            {Object.values(running).some(Boolean)
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Синхронізувати все
          </Button>
        </div>
      </div>

      {/* Source cards */}
      <div className="grid grid-cols-2 gap-4">
        {SYNC_SOURCES.map(src => {
          const st: any = status?.[src.id] || {};
          const res = lastResult[src.endpoint];
          const isRunning = running[src.endpoint];
          return (
            <Card key={src.id} className={`border ${src.accent} transition-all ${isRunning ? "opacity-80" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl mt-0.5">{src.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-900">{src.name}</span>
                      {statusLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                      ) : st.connected ? (
                        <Badge className={`text-[10px] px-1.5 py-0 ${src.badge}`}>Підключено</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-400">Demo-режим</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed mb-3">{src.desc}</p>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-white/70 rounded p-2 text-center border border-gray-100">
                        <div className="text-xs font-bold text-gray-800">{fmtNum(st.totalDocs)}</div>
                        <div className="text-[10px] text-gray-500">{src.docsLabel}</div>
                      </div>
                      <div className="bg-white/70 rounded p-2 text-center border border-gray-100">
                        <div className="text-xs font-bold text-gray-800">{fmtNum(st.totalEntries)}</div>
                        <div className="text-[10px] text-gray-500">Проводок</div>
                      </div>
                      <div className="bg-white/70 rounded p-2 text-center border border-gray-100">
                        <div className="text-xs font-bold text-gray-800">{fmtAmt(st.totalAmount)}</div>
                        <div className="text-[10px] text-gray-500">Сума, грн</div>
                      </div>
                    </div>

                    {/* Last sync info */}
                    {st.lastSync && (
                      <div className="text-[10px] text-gray-400 mb-2">
                        Остання синх.: {fmtDate(st.lastSync)}
                      </div>
                    )}

                    {/* Last result */}
                    {res && (
                      <div className="text-[10px] bg-white/80 border border-gray-100 rounded px-2 py-1 mb-2 text-green-700">
                        ✓ {res.docsCreated ?? res.bankStatementsCreated ?? 0} док · {res.entriesCreated ?? 0} провод · {fmtAmt(res.totalAmount)} грн
                        {res.source === "demo" && <span className="text-gray-400 ml-1">(demo)</span>}
                      </div>
                    )}

                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs w-full gap-1.5"
                      disabled={isRunning}
                      onClick={() => runSync(src.endpoint, src.name)}>
                      {isRunning
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Синхронізація...</>
                        : <><RefreshCw className="w-3 h-3" /> Синхронізувати {src.name}</>}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sync log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <FileClock className="w-4 h-4" /> Журнал синхронізацій
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logLoading ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
          ) : (Array.isArray(logData) && logData.length === 0) ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <RefreshCw className="w-7 h-7 mx-auto mb-2 opacity-30" />
              Синхронізацій ще не було. Натисніть «Синхронізувати все» щоб почати.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-36">Дата/час</TableHead>
                  <TableHead className="w-28">Джерело</TableHead>
                  <TableHead>Діапазон</TableHead>
                  <TableHead className="text-right w-24">Докум.</TableHead>
                  <TableHead className="text-right w-24">Провод.</TableHead>
                  <TableHead className="text-right w-36">Сума, грн</TableHead>
                  <TableHead className="text-center w-20">Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(logData) ? logData : []).map((row: any) => (
                  <TableRow key={row.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs">{fmtDate(row.sync_date)}</TableCell>
                    <TableCell>
                      <span className="text-xs font-medium capitalize">
                        {row.source === "poster"   ? "🖨️ Poster"   :
                         row.source === "checkbox" ? "🧾 Checkbox" :
                         row.source === "liqpay"   ? "💳 LiqPay"   :
                         row.source === "servio"   ? "🏨 Servio"   : row.source}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {fmtDate(row.date_from)} — {fmtDate(row.date_to)}
                    </TableCell>
                    <TableCell className="text-right text-xs">{row.docs_created}</TableCell>
                    <TableCell className="text-right text-xs">{row.entries_created}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{fmtAmt(row.total_amount)}</TableCell>
                    <TableCell className="text-center">
                      {row.status === "ok"
                        ? <Badge className="text-[10px] bg-green-100 text-green-700 border-0">OK</Badge>
                        : <Badge variant="destructive" className="text-[10px]">Помилка</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info box */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800 space-y-1.5">
        <div className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Server className="w-4 h-4" /> Як налаштувати реальні підключення
        </div>
        <div><span className="font-medium">Poster POS:</span> введіть API-ключ у вкладці Інтеграції → Poster. Ключ генерується в Особистому кабінеті joinposter.com.</div>
        <div><span className="font-medium">Checkbox ПРРО:</span> вкажіть логін касира, пароль і ліцензійний ключ ПРРО у вкладці Інтеграції → Checkbox.</div>
        <div><span className="font-medium">LiqPay:</span> додайте LIQPAY_PUBLIC_KEY та LIQPAY_PRIVATE_KEY у налаштуваннях середовища. Підтримується API звіту по транзакціях.</div>
        <div><span className="font-medium">Servio PMS:</span> вкажіть Base URL сервера Servio та API-ключ у вкладці Інтеграції → Servio.</div>
        <div className="text-blue-600 pt-1">Без реальних ключів система працює в <strong>demo-режимі</strong> — генерує реалістичні дані для тестування проводок.</div>
      </div>
    </div>
  );
}

// ─── BANK TAB ─────────────────────────────────────────────────────────────────
function AccBankTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [from, setFrom] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"));
  const [to, setTo]     = useState(format(now, "yyyy-MM-dd"));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]  = useState<any>({ bank_account: "", statement_date: format(now, "yyyy-MM-dd"), description: "", amount: "", contractor_id: "" });
  const [addLoading, setAddLoading] = useState(false);

  const { data: stmts = [], isLoading } = useQuery({
    queryKey: ["acc-bank", from, to],
    queryFn: () => accFetch(`bank?from=${from}&to=${to}`),
    staleTime: 30_000,
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ["acc-ledger", "contractors"],
    queryFn: () => accFetch("contractors"),
    staleTime: 60_000,
  });

  const fmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalIn  = (stmts as any[]).filter(s => Number(s.amount) > 0).reduce((sum, s) => sum + Number(s.amount), 0);
  const totalOut = (stmts as any[]).filter(s => Number(s.amount) < 0).reduce((sum, s) => sum + Number(s.amount), 0);

  const handleAdd = async () => {
    if (!form.statement_date || !form.amount || !form.description) {
      toast({ title: "Заповніть обов'язкові поля", variant: "destructive" }); return;
    }
    setAddLoading(true);
    try {
      await accFetch("bank", { method: "POST", body: JSON.stringify({
        ...form,
        amount: parseFloat(form.amount),
        contractor_id: form.contractor_id ? parseInt(form.contractor_id) : null,
      }) });
      toast({ title: "Операцію додано" });
      qc.invalidateQueries({ queryKey: ["acc-bank"] });
      setShowAdd(false);
      setForm({ bank_account: "", statement_date: format(now, "yyyy-MM-dd"), description: "", amount: "", contractor_id: "" });
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally { setAddLoading(false); }
  };

  const handleReconcile = async (id: number) => {
    try {
      await accFetch(`bank/${id}/reconcile`, { method: "PATCH" });
      qc.invalidateQueries({ queryKey: ["acc-bank"] });
      toast({ title: "Позначено як звірено" });
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Період:</span>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 h-8 text-xs" />
          <span className="text-xs text-gray-400">—</span>
          <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-36 h-8 text-xs" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled title="Буде в наступному релізі">
            <Upload className="w-3.5 h-3.5" /> Імпорт XML НБУ
          </Button>
          <Button size="sm" className="h-8 gap-1.5 bg-[--mhd-primary] hover:bg-[--mhd-primary]/90" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" /> Додати операцію
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-3 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <div className="text-[11px] text-green-700 font-medium">Надходження</div>
              <div className="text-lg font-bold text-green-700">{fmt(totalIn)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3 flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <div className="text-[11px] text-red-700 font-medium">Списання</div>
              <div className="text-lg font-bold text-red-700">{fmt(Math.abs(totalOut))}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3 flex items-center gap-3">
            <Wallet className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <div className="text-[11px] text-blue-700 font-medium">Сальдо</div>
              <div className={`text-lg font-bold ${(totalIn + totalOut) >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(totalIn + totalOut)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statements table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-28">Дата</TableHead>
                  <TableHead>Опис операції</TableHead>
                  <TableHead>Контрагент</TableHead>
                  <TableHead>Рахунок</TableHead>
                  <TableHead className="text-right w-36">Сума, грн</TableHead>
                  <TableHead className="text-center w-24">Звірено</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stmts as any[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                      <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <div className="text-sm">Виписок за обраний період не знайдено</div>
                      <div className="text-xs mt-1">Додайте операцію вручну або імпортуйте CSV</div>
                    </TableCell>
                  </TableRow>
                ) : (stmts as any[]).map((s: any) => (
                  <TableRow key={s.id} className={`hover:bg-gray-50 ${s.is_reconciled ? "opacity-70" : ""}`}>
                    <TableCell className="text-xs font-medium">{fmtDate(s.statement_date)}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{s.description || "—"}</TableCell>
                    <TableCell className="text-xs text-gray-600">{s.contractor_name || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-gray-500">{s.bank_account || "—"}</TableCell>
                    <TableCell className={`text-right text-sm font-bold ${Number(s.amount) >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {Number(s.amount) >= 0 ? "+" : ""}{fmt(s.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.is_reconciled
                        ? <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 border-green-200">Звірено</Badge>
                        : <Badge variant="outline"   className="text-[10px] text-gray-400">Ні</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      {!s.is_reconciled && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleReconcile(s.id)}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Звірити
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add statement dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Нова банківська операція</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Дата *</Label>
                <Input type="date" value={form.statement_date} onChange={e => setForm((f: any) => ({ ...f, statement_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Сума, грн * <span className="text-gray-400">(«-» для списання)</span></Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm((f: any) => ({ ...f, amount: e.target.value }))} className="mt-1" placeholder="1500.00" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Опис операції *</Label>
              <Input value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} className="mt-1" placeholder="Оплата за послуги проживання" />
            </div>
            <div>
              <Label className="text-xs">Банківський рахунок</Label>
              <Input value={form.bank_account} onChange={e => setForm((f: any) => ({ ...f, bank_account: e.target.value }))} className="mt-1" placeholder="UA123456789012345678901234567" />
            </div>
            <div>
              <Label className="text-xs">Контрагент</Label>
              <Select value={form.contractor_id || ""} onValueChange={v => setForm((f: any) => ({ ...f, contractor_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Не вказано" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Не вказано —</SelectItem>
                  {(Array.isArray(contractors) ? contractors : []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Скасувати</Button>
              <Button onClick={handleAdd} disabled={addLoading} className="bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
                {addLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Додати
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ACC: MONTH CLOSE (ЗАКРИТТЯ МІСЯЦЯ) ───────────────────────────────────────
function AccMonthCloseTab() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear().toString());
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [loading, setLoading] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const previewKey = `month-close/preview?year=${year}&month=${month}`;
  const { data: preview, isLoading: prevLoading, refetch } = useAccLedger(previewKey);
  const fmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MONTHS_UK = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];

  const handleClose = async () => {
    if (!confirm(`Закрити місяць ${MONTHS_UK[+month-1]} ${year}? Будуть створені регламентні проводки.`)) return;
    setLoading(true);
    try {
      const res = await accFetch("month-close/execute", { method: "POST", body: JSON.stringify({ year: +year, month: +month }) });
      toast({ title: `Місяць закрито`, description: `Створено ${res.entriesCreated} проводок. Результат: ${res.netResult >= 0 ? "прибуток" : "збиток"} ${fmt(Math.abs(res.netResult))} грн` });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
      refetch();
    } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleUndo = async () => {
    if (!confirm(`Скасувати закриття ${MONTHS_UK[+month-1]} ${year}? Регламентні проводки будуть видалені.`)) return;
    setUndoLoading(true);
    try {
      await accFetch("month-close/undo", { method: "POST", body: JSON.stringify({ year: +year, month: +month }) });
      toast({ title: "Закриття скасовано" });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
      refetch();
    } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
    finally { setUndoLoading(false); }
  };

  const isClosed = preview?.isClosed;
  const hasData  = (preview?.income?.length > 0 || preview?.expenses?.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={year} onValueChange={v => { setYear(v); }}>
          <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{[2023,2024,2025,2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={month} onValueChange={v => { setMonth(v); }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_UK.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          {isClosed ? (
            <>
              <Badge className="bg-green-100 text-green-700 border-green-300 px-3 py-1.5"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Закрито</Badge>
              <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoLoading} className="border-orange-300 text-orange-700 hover:bg-orange-50">
                {undoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Скасувати закриття
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleClose} disabled={loading || !hasData} className="bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              Закрити місяць
            </Button>
          )}
        </div>
      </div>

      {prevLoading ? <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4"><div className="text-xs text-green-700 font-medium mb-1">Доходи (кл. 7)</div><div className="text-2xl font-bold text-green-700">{fmt(preview?.totalIncome)}</div></CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4"><div className="text-xs text-red-700 font-medium mb-1">Витрати (кл. 9)</div><div className="text-2xl font-bold text-red-700">{fmt(preview?.totalExpenses)}</div></CardContent>
            </Card>
            <Card className={`border-2 ${(preview?.netResult ?? 0) >= 0 ? "border-blue-300 bg-blue-50" : "border-orange-300 bg-orange-50"}`}>
              <CardContent className="p-4">
                <div className={`text-xs font-medium mb-1 ${(preview?.netResult ?? 0) >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                  {(preview?.netResult ?? 0) >= 0 ? "Прибуток → 441" : "Збиток → 442"}
                </div>
                <div className={`text-2xl font-bold ${(preview?.netResult ?? 0) >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                  {fmt(Math.abs(preview?.netResult ?? 0))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview entries */}
          {preview?.entries?.length > 0 ? (
            <Card>
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {isClosed ? "Регламентні проводки (виконано)" : "Попередній перегляд проводок"}
                  <Badge className="ml-2 text-[10px]">{preview.entries.length} проводок</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-20">Дт</TableHead>
                      <TableHead className="w-20">Кт</TableHead>
                      <TableHead>Зміст</TableHead>
                      <TableHead className="text-right w-40">Сума, грн</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.entries.map((e: any, i: number) => (
                      <TableRow key={i} className={`hover:bg-gray-50 ${e.credit === "441" || e.debit === "442" ? "bg-blue-50/50 font-semibold" : ""}`}>
                        <TableCell className="font-mono text-sm font-bold text-blue-800">{e.debit}</TableCell>
                        <TableCell className="font-mono text-sm font-bold text-orange-700">{e.credit}</TableCell>
                        <TableCell className="text-xs text-gray-600">{e.description}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{fmt(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="py-12 text-center text-gray-400">
              <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <div className="text-sm font-medium">Немає оборотів для закриття</div>
              <div className="text-xs mt-1">За обраний місяць не знайдено доходів або витрат</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ACC: ACCOUNT CARD (КАРТКА РАХУНКУ) ───────────────────────────────────────
function AccAccountCardTab() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [code, setCode] = useState("311");
  const [from, setFrom] = useState(format(firstOfMonth, "yyyy-MM-dd"));
  const [to, setTo]     = useState(format(now, "yyyy-MM-dd"));
  const [searchCode, setSearchCode] = useState(code);
  const { data: accounts } = useAccLedger("accounts");

  const { data, isLoading, refetch } = useAccLedger(
    `reports/account-card?code=${searchCode}&from=${from}&to=${to}`,
    { enabled: !!searchCode },
  );

  const fmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string) => d ? format(new Date(d), "dd.MM.yyyy") : "—";

  const topAccounts = ["311","361","631","702","703","92","93","441","30","6411"];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 whitespace-nowrap">Рахунок:</span>
          <Select value={code} onValueChange={v => { setCode(v); setSearchCode(v); }}>
            <SelectTrigger className="w-64 h-9 text-sm"><SelectValue placeholder="Оберіть рахунок..." /></SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-[10px] text-gray-400 font-medium uppercase">Часті</div>
              {topAccounts.map(c => {
                const acc = (Array.isArray(accounts) ? accounts : []).find((a: any) => a.code === c);
                return <SelectItem key={c} value={c}>{c} — {acc?.name ?? c}</SelectItem>;
              })}
              <div className="px-2 py-1 text-[10px] text-gray-400 font-medium uppercase mt-1">Усі</div>
              {(Array.isArray(accounts) ? accounts : []).map((a: any) => (
                <SelectItem key={a.id} value={a.code}>{a.code} — {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Від:</span>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 h-9 text-xs" />
          <span className="text-xs text-gray-500">До:</span>
          <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-36 h-9 text-xs" />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => { setSearchCode(code); refetch(); }}>
          <Search className="w-3.5 h-3.5 mr-1.5" /> Показати
        </Button>
      </div>

      {isLoading ? <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> : data?.account ? (
        <div className="space-y-4">
          {/* Account info + balances */}
          <div className="grid grid-cols-4 gap-3">
            <Card className="col-span-1 bg-gray-50">
              <CardContent className="p-3">
                <div className="text-xs text-gray-500 mb-0.5">Рахунок</div>
                <div className="font-mono text-2xl font-bold text-gray-800">{data.account.code}</div>
                <div className="text-xs text-gray-600 mt-1 leading-tight">{data.account.name}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-gray-500 mb-0.5">Вхідний залишок</div>
                <div className={`text-lg font-bold ${data.openingBalance >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(data.openingBalance)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="grid grid-cols-2 gap-1">
                  <div><div className="text-[10px] text-blue-600">Дт обороти</div><div className="font-bold text-blue-700 text-sm">{fmt(data.totalDebit)}</div></div>
                  <div><div className="text-[10px] text-orange-600">Кт обороти</div><div className="font-bold text-orange-700 text-sm">{fmt(data.totalCredit)}</div></div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2 border-gray-300">
              <CardContent className="p-3">
                <div className="text-xs text-gray-500 mb-0.5">Вихідний залишок</div>
                <div className={`text-lg font-bold ${data.closingBalance >= 0 ? "text-gray-900" : "text-red-700"}`}>{fmt(data.closingBalance)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Entries table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="w-28">Дата</TableHead>
                    <TableHead className="w-28">Документ</TableHead>
                    <TableHead>Зміст</TableHead>
                    <TableHead className="w-20 text-center">Кореспонд.</TableHead>
                    <TableHead className="text-right w-36">Дт, грн</TableHead>
                    <TableHead className="text-right w-36">Кт, грн</TableHead>
                    <TableHead className="text-right w-36">Залишок, грн</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening balance row */}
                  <TableRow className="bg-gray-100 border-b-2 border-gray-300">
                    <TableCell colSpan={4} className="text-xs font-bold text-gray-700 py-2">Вхідний залишок</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-gray-700" colSpan={2} />
                    <TableCell className="text-right font-mono text-sm font-bold text-gray-900">{fmt(data.openingBalance)}</TableCell>
                  </TableRow>
                  {data.rows?.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">Оборотів за обраний період не знайдено</TableCell></TableRow>
                  ) : data.rows?.map((r: any) => (
                    <TableRow key={r.id} className="hover:bg-gray-50">
                      <TableCell className="text-xs font-medium">{fmtDate(r.entry_date)}</TableCell>
                      <TableCell className="text-xs font-mono text-gray-500">
                        {r.doc_type && r.doc_number ? `${r.doc_type.toUpperCase()} №${r.doc_number}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 max-w-xs truncate">{r.description || "—"}</TableCell>
                      <TableCell className="text-center text-xs font-mono">
                        {parseFloat(r.debit_amount) > 0
                          ? <span className="text-orange-600">Кт {r.credit_code}</span>
                          : <span className="text-blue-600">Дт {r.debit_code}</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-blue-700">
                        {parseFloat(r.debit_amount) > 0 ? fmt(r.debit_amount) : ""}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-orange-700">
                        {parseFloat(r.credit_amount) > 0 ? fmt(r.credit_amount) : ""}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${r.running_balance >= 0 ? "text-gray-800" : "text-red-700"}`}>
                        {fmt(r.running_balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Closing balance row */}
                  {data.rows?.length > 0 && (
                    <TableRow className="bg-gray-100 border-t-2 border-gray-300">
                      <TableCell colSpan={4} className="text-xs font-bold text-gray-700 py-2">Вихідний залишок</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-blue-800">{fmt(data.totalDebit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-orange-800">{fmt(data.totalCredit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-gray-900">{fmt(data.closingBalance)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="py-12 text-center text-gray-400">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <div className="text-sm">Оберіть рахунок і натисніть «Показати»</div>
        </div>
      )}
    </div>
  );
}

// ─── ACC: CASH (КАСА ПКО/ВКО) ─────────────────────────────────────────────────
function AccCashTab() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [from, setFrom]     = useState(format(firstOfMonth, "yyyy-MM-dd"));
  const [to, setTo]         = useState(format(now, "yyyy-MM-dd"));
  const [view, setView]     = useState<"orders" | "book">("orders");
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: contractors } = useAccLedger("contractors");
  const { data: accounts }    = useAccLedger("accounts");

  const ordersKey = `cash?from=${from}&to=${to}`;
  const bookKey   = `cash/book?from=${from}&to=${to}`;
  const { data: orders,  isLoading: ordersLoading } = useAccLedger(ordersKey);
  const { data: book,    isLoading: bookLoading   } = useAccLedger(bookKey);

  const emptyForm = { order_type: "pko", order_number: "", order_date: format(now, "yyyy-MM-dd"),
    amount: "", description: "", contractor_id: "", corr_account: "", basis: "", cashier: "", person: "" };
  const [form, setForm] = useState<any>(emptyForm);
  const fmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string) => d ? format(new Date(d), "dd.MM.yyyy") : "—";

  const cashAccounts = ["301","311","361","631","371","681","372","92","93","70","71"];

  const totalPko = (Array.isArray(orders) ? orders : []).filter((o: any) => o.order_type === "pko").reduce((s: number, o: any) => s + Number(o.amount), 0);
  const totalVko = (Array.isArray(orders) ? orders : []).filter((o: any) => o.order_type === "vko").reduce((s: number, o: any) => s + Number(o.amount), 0);

  const handleAdd = async () => {
    if (!form.order_number || !form.order_date || !form.amount) {
      toast({ title: "Заповніть обов'язкові поля", variant: "destructive" }); return;
    }
    setAddLoading(true);
    try {
      await accFetch("cash", { method: "POST", body: JSON.stringify({ ...form, amount: parseFloat(form.amount), contractor_id: form.contractor_id ? +form.contractor_id : null }) });
      toast({ title: `${form.order_type === "pko" ? "ПКО" : "ВКО"} створено` });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
      setShowAdd(false); setForm(emptyForm);
    } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
    finally { setAddLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Видалити ордер? Пов'язану проводку теж буде видалено.")) return;
    try {
      await accFetch(`cash/${id}`, { method: "DELETE" });
      toast({ title: "Ордер видалено" });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
    } catch (e: any) { toast({ title: "Помилка", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Період:</span>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 h-8 text-xs" />
        <span className="text-xs text-gray-400">—</span>
        <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-36 h-8 text-xs" />
        <div className="flex border rounded-lg overflow-hidden">
          {(["orders","book"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view===v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {v === "orders" ? "Ордери" : "Касова книга"}
            </button>
          ))}
        </div>
        <Button size="sm" className="ml-auto h-8 gap-1.5 bg-[--mhd-primary] hover:bg-[--mhd-primary]/90" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Новий ордер
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
            <div><div className="text-[10px] text-green-700">ПКО (прихід)</div><div className="font-bold text-green-700">{fmt(totalPko)}</div></div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
            <div><div className="text-[10px] text-red-700">ВКО (видаток)</div><div className="font-bold text-red-700">{fmt(totalVko)}</div></div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-600 shrink-0" />
            <div><div className="text-[10px] text-blue-700">Залишок (30)</div><div className="font-bold text-blue-700">{fmt(book?.closingBalance ?? 0)}</div></div>
          </CardContent>
        </Card>
      </div>

      {view === "orders" && (
        <Card>
          <CardContent className="p-0">
            {ordersLoading ? <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="w-20">Тип</TableHead>
                    <TableHead className="w-24">№ Ордера</TableHead>
                    <TableHead className="w-28">Дата</TableHead>
                    <TableHead>Зміст / Підстава</TableHead>
                    <TableHead>Контрагент</TableHead>
                    <TableHead className="w-16 text-center">Кор. рах.</TableHead>
                    <TableHead className="text-right w-36">Сума, грн</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Array.isArray(orders) && orders.length === 0) ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                      <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />Ордерів за обраний період не знайдено
                    </TableCell></TableRow>
                  ) : (Array.isArray(orders) ? orders : []).map((o: any) => (
                    <TableRow key={o.id} className="hover:bg-gray-50">
                      <TableCell>
                        <Badge className={o.order_type === "pko" ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300"}>
                          {o.order_type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">{o.order_number}</TableCell>
                      <TableCell className="text-xs">{fmtDate(o.order_date)}</TableCell>
                      <TableCell className="text-xs max-w-xs">
                        <div className="truncate">{o.description || "—"}</div>
                        {o.basis && <div className="text-[10px] text-gray-400 truncate">{o.basis}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">{o.contractor_name || o.person || "—"}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-gray-500">{o.corr_account || "—"}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-bold ${o.order_type === "pko" ? "text-green-700" : "text-red-700"}`}>
                        {o.order_type === "pko" ? "+" : "–"}{fmt(o.amount)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-600" onClick={() => handleDelete(o.id)}>
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {view === "book" && (
        <Card>
          <CardHeader className="pb-2 border-b"><CardTitle className="text-sm font-bold text-gray-800">Касова книга — залишки по днях</CardTitle></CardHeader>
          <CardContent className="p-0">
            {bookLoading ? <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead className="text-right">Залишок на поч. дня</TableHead>
                    <TableHead className="text-right text-green-700">Надходження (ПКО)</TableHead>
                    <TableHead className="text-right text-red-700">Видаток (ВКО)</TableHead>
                    <TableHead className="text-right font-bold">Залишок на кін. дня</TableHead>
                    <TableHead className="text-center w-16">К-ть</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-blue-50 border-b-2 border-blue-200">
                    <TableCell className="text-xs font-bold text-blue-800">Вхідний залишок ({format(new Date(from), "dd.MM.yyyy")})</TableCell>
                    <TableCell colSpan={3} />
                    <TableCell className="text-right font-mono font-bold text-blue-800">{fmt(book?.openingBalance)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {(!book?.rows || book.rows.length === 0) ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-gray-400 text-sm">Операцій за обраний період не знайдено</TableCell></TableRow>
                  ) : book.rows.map((r: any, i: number) => (
                    <TableRow key={i} className="hover:bg-gray-50">
                      <TableCell className="text-xs font-medium">{fmtDate(r.order_date)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-gray-600">{fmt(r.opening_balance)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-700 font-semibold">+{fmt(r.income)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-700 font-semibold">–{fmt(r.expense)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-bold ${r.closing_balance >= 0 ? "text-gray-900" : "text-red-700"}`}>
                        {fmt(r.closing_balance)}
                      </TableCell>
                      <TableCell className="text-center text-xs text-gray-500">{r.docs_count}</TableCell>
                    </TableRow>
                  ))}
                  {book?.rows?.length > 0 && (
                    <TableRow className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                      <TableCell className="text-xs font-bold text-gray-800">РАЗОМ за період</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono font-bold text-green-800">{fmt(book?.totalIncome)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-red-800">{fmt(book?.totalExpense)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-gray-900">{fmt(book?.closingBalance)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Новий касовий ордер</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="flex gap-2">
              {(["pko","vko"] as const).map(t => (
                <button key={t} onClick={() => setForm((f: any) => ({ ...f, order_type: t }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${form.order_type === t
                    ? (t === "pko" ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700")
                    : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  {t === "pko" ? "ПКО — Прихідний" : "ВКО — Видатковий"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">№ Ордера *</Label>
                <Input value={form.order_number} onChange={e => setForm((f: any) => ({ ...f, order_number: e.target.value }))} className="mt-1" placeholder="ПКО-001" /></div>
              <div><Label className="text-xs">Дата *</Label>
                <Input type="date" value={form.order_date} onChange={e => setForm((f: any) => ({ ...f, order_date: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Сума, грн *</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => setForm((f: any) => ({ ...f, amount: e.target.value }))} className="mt-1" placeholder="1000.00" /></div>
            <div><Label className="text-xs">Кореспондуючий рахунок (Дт/Кт)</Label>
              <Select value={form.corr_account} onValueChange={v => setForm((f: any) => ({ ...f, corr_account: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Оберіть рахунок..." /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.map(c => {
                    const acc = (Array.isArray(accounts) ? accounts : []).find((a: any) => a.code === c);
                    return <SelectItem key={c} value={c}>{c} — {acc?.name ?? c}</SelectItem>;
                  })}
                </SelectContent>
              </Select></div>
            <div><Label className="text-xs">{form.order_type === "pko" ? "Прийнято від" : "Видано кому"}</Label>
              <Input value={form.person} onChange={e => setForm((f: any) => ({ ...f, person: e.target.value }))} className="mt-1" placeholder="Прізвище І.О." /></div>
            <div><Label className="text-xs">Підстава</Label>
              <Input value={form.basis} onChange={e => setForm((f: any) => ({ ...f, basis: e.target.value }))} className="mt-1" placeholder="Оплата за послуги згідно рахунку №..." /></div>
            <div><Label className="text-xs">Зміст операції</Label>
              <Input value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setShowAdd(false); setForm(emptyForm); }}>Скасувати</Button>
              <Button onClick={handleAdd} disabled={addLoading} className={form.order_type === "pko" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>
                {addLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Зберегти {form.order_type.toUpperCase()}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ACC: TOURIST TAX (ТУРИСТИЧНИЙ ЗБІР) ──────────────────────────────────────
function AccTouristTaxTab() {
  const now = new Date();
  const [view, setView]     = useState<"records" | "report">("records");
  const [year, setYear]     = useState(String(now.getFullYear()));
  const [month, setMonth]   = useState(String(now.getMonth() + 1));
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const MONTHS_UK = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
  const emptyForm = { record_date: format(now,"yyyy-MM-dd"), guest_name:"", check_in: format(now,"yyyy-MM-dd"), check_out: format(now,"yyyy-MM-dd"), nights:"1", rate_per_night:"", notes:"" };
  const [form, setForm] = useState<any>(emptyForm);

  const recKey  = `tourist-tax?year=${year}&month=${month}`;
  const repKey  = `tourist-tax/report?year=${year}`;
  const { data: records,  isLoading: recLoading  } = useAccLedger(recKey,  { enabled: view === "records" });
  const { data: report,   isLoading: repLoading   } = useAccLedger(repKey,  { enabled: view === "report" });

  const fmt  = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtD = (d: string) => d ? format(new Date(d), "dd.MM.yyyy") : "—";

  const totalAmount  = (Array.isArray(records) ? records : []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const totalPaid    = (Array.isArray(records) ? records : []).filter((r:any) => r.is_paid).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const totalUnpaid  = totalAmount - totalPaid;
  const totalNights  = (Array.isArray(records) ? records : []).reduce((s: number, r: any) => s + Number(r.nights), 0);

  const handleAdd = async () => {
    if (!form.check_in || !form.check_out || !form.nights || !form.rate_per_night) {
      toast({ title: "Заповніть обов'язкові поля", variant: "destructive" }); return;
    }
    setAddLoading(true);
    try {
      await accFetch("tourist-tax", { method:"POST", body: JSON.stringify({ ...form, nights: +form.nights, rate_per_night: +form.rate_per_night }) });
      toast({ title: "Запис додано" });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
      setShowAdd(false); setForm(emptyForm);
    } catch(e: any) { toast({ title:"Помилка", description: e.message, variant:"destructive" }); }
    finally { setAddLoading(false); }
  };

  const handleTogglePaid = async (id: number, is_paid: boolean) => {
    try {
      await accFetch(`tourist-tax/${id}`, { method:"PATCH", body: JSON.stringify({ is_paid: !is_paid }) });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
    } catch(e: any) { toast({ title:"Помилка", description: (e as any).message, variant:"destructive" }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Видалити запис?")) return;
    try {
      await accFetch(`tourist-tax/${id}`, { method:"DELETE" });
      qc.invalidateQueries({ queryKey: ["acc-ledger"] });
      toast({ title:"Запис видалено" });
    } catch(e: any) { toast({ title:"Помилка", description: (e as any).message, variant:"destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border rounded-lg overflow-hidden">
          {(["records","report"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${view===v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {v==="records" ? "Реєстр" : "Звіт по рокам"}
            </button>
          ))}
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{[2023,2024,2025,2026].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        {view === "records" && (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS_UK.map((m,i)=><SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Button size="sm" className="ml-auto h-9 gap-1.5 bg-[--mhd-primary] hover:bg-[--mhd-primary]/90" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Додати запис
        </Button>
      </div>

      {view === "records" && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Card className="border-blue-200 bg-blue-50"><CardContent className="p-3"><div className="text-[10px] text-blue-700 font-medium">Записів</div><div className="text-xl font-bold text-blue-700">{(Array.isArray(records)?records:[]).length}</div></CardContent></Card>
            <Card className="border-purple-200 bg-purple-50"><CardContent className="p-3"><div className="text-[10px] text-purple-700 font-medium">Нічліг</div><div className="text-xl font-bold text-purple-700">{totalNights}</div></CardContent></Card>
            <Card className="border-green-200 bg-green-50"><CardContent className="p-3"><div className="text-[10px] text-green-700 font-medium">Сплачено</div><div className="text-xl font-bold text-green-700">{fmt(totalPaid)} грн</div></CardContent></Card>
            <Card className="border-orange-200 bg-orange-50"><CardContent className="p-3"><div className="text-[10px] text-orange-700 font-medium">Не сплачено</div><div className="text-xl font-bold text-orange-700">{fmt(totalUnpaid)} грн</div></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-0">
              {recLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-28">Дата запису</TableHead>
                      <TableHead>Гість</TableHead>
                      <TableHead className="w-28">Заїзд</TableHead>
                      <TableHead className="w-28">Виїзд</TableHead>
                      <TableHead className="text-right w-20">Ночей</TableHead>
                      <TableHead className="text-right w-32">Ставка/ніч</TableHead>
                      <TableHead className="text-right w-32">Сума</TableHead>
                      <TableHead className="text-center w-24">Статус</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(records) && records.length === 0) ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400 text-sm">
                        <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />Записів за обраний місяць не знайдено
                      </TableCell></TableRow>
                    ) : (Array.isArray(records)?records:[]).map((r:any) => (
                      <TableRow key={r.id} className="hover:bg-gray-50">
                        <TableCell className="text-xs">{fmtD(r.record_date)}</TableCell>
                        <TableCell className="text-xs font-medium">{r.guest_name || <span className="text-gray-400">—</span>}</TableCell>
                        <TableCell className="text-xs">{fmtD(r.check_in)}</TableCell>
                        <TableCell className="text-xs">{fmtD(r.check_out)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{r.nights}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmt(r.rate_per_night)}</TableCell>
                        <TableCell className="text-right text-sm font-bold text-blue-700">{fmt(r.amount)}</TableCell>
                        <TableCell className="text-center">
                          <button onClick={() => handleTogglePaid(r.id, r.is_paid)}>
                            <Badge className={r.is_paid ? "bg-green-100 text-green-700 border-green-300 cursor-pointer" : "bg-orange-100 text-orange-700 border-orange-300 cursor-pointer"}>
                              {r.is_paid ? "Сплачено" : "Не сплачено"}
                            </Badge>
                          </button>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-600" onClick={() => handleDelete(r.id)}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {view === "report" && (
        repLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
          <Card>
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-bold text-gray-800">Річний звіт туристичного збору — {report?.year}</CardTitle>
              <div className="flex gap-4 text-xs text-gray-500 mt-1">
                <span>Всього гостей: <b>{report?.total?.guests}</b></span>
                <span>Всього нічліг: <b>{report?.total?.nights}</b></span>
                <span>Всього сума: <b>{fmt(report?.total?.amount)} грн</b></span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Місяць</TableHead>
                    <TableHead className="text-right">К-ть гостей</TableHead>
                    <TableHead className="text-right">Нічліг</TableHead>
                    <TableHead className="text-right">Нараховано</TableHead>
                    <TableHead className="text-right text-green-700">Сплачено</TableHead>
                    <TableHead className="text-right text-orange-700">Не сплачено</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!report?.months || report.months.length === 0) ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">Записів за {report?.year} рік не знайдено</TableCell></TableRow>
                  ) : report.months.map((m:any) => (
                    <TableRow key={m.month} className="hover:bg-gray-50">
                      <TableCell className="text-sm font-medium">{MONTHS_UK[m.month-1]}</TableCell>
                      <TableCell className="text-right text-sm">{m.guests_count}</TableCell>
                      <TableCell className="text-right text-sm">{m.total_nights}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{fmt(m.total_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-700">{fmt(m.paid_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-orange-700">{fmt(m.unpaid_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Новий запис туристичного збору</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Дата запису</Label><Input type="date" value={form.record_date} onChange={e=>setForm((f:any)=>({...f,record_date:e.target.value}))} className="mt-1" /></div>
              <div><Label className="text-xs">ПІБ гостя</Label><Input value={form.guest_name} onChange={e=>setForm((f:any)=>({...f,guest_name:e.target.value}))} className="mt-1" placeholder="Іваненко І.І." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Дата заїзду *</Label><Input type="date" value={form.check_in} onChange={e=>setForm((f:any)=>({...f,check_in:e.target.value}))} className="mt-1" /></div>
              <div><Label className="text-xs">Дата виїзду *</Label><Input type="date" value={form.check_out} onChange={e=>setForm((f:any)=>({...f,check_out:e.target.value}))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Кількість ночей *</Label><Input type="number" min="1" value={form.nights} onChange={e=>setForm((f:any)=>({...f,nights:e.target.value}))} className="mt-1" /></div>
              <div><Label className="text-xs">Ставка за ніч, грн *</Label><Input type="number" step="0.01" value={form.rate_per_night} onChange={e=>setForm((f:any)=>({...f,rate_per_night:e.target.value}))} className="mt-1" placeholder="52.00" /></div>
            </div>
            {form.nights && form.rate_per_night && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700">
                Сума збору: <strong>{(Number(form.nights)*Number(form.rate_per_night)).toFixed(2)} грн</strong>
              </div>
            )}
            <div><Label className="text-xs">Примітка</Label><Input value={form.notes} onChange={e=>setForm((f:any)=>({...f,notes:e.target.value}))} className="mt-1" /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={()=>{setShowAdd(false);setForm(emptyForm);}}>Скасувати</Button>
              <Button onClick={handleAdd} disabled={addLoading} className="bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
                {addLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Зберегти
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ACC: PAYROLL (ЗАРПЛАТА) ───────────────────────────────────────────────────
function AccPayrollTab() {
  const now = new Date();
  const [view, setView]   = useState<"sheet" | "employees">("sheet");
  const [year, setYear]   = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [showAccrual, setShowAccrual] = useState<any>(null);
  const [posting, setPosting] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const MONTHS_UK = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];

  const sheetKey = `payroll/sheet?year=${year}&month=${month}`;
  const empKey   = "payroll/employees";
  const { data: sheet,     isLoading: sheetLoading } = useAccLedger(sheetKey, { enabled: view === "sheet" });
  const { data: employees, isLoading: empLoading   } = useAccLedger(empKey,   { enabled: true });

  const fmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const emptyEmp = { full_name:"", position:"", ipn:"", base_salary:"", hire_date:"" };
  const [empForm, setEmpForm] = useState<any>(emptyEmp);
  const [empLoading2, setEmpLoading2] = useState(false);

  const [accrualForm, setAccrualForm] = useState({ gross_amount:"", accrual_type:"salary", notes:"" });
  const [accrualLoading, setAccrualLoading] = useState(false);

  const handleAddEmployee = async () => {
    if (!empForm.full_name || !empForm.base_salary) { toast({ title:"Вкажіть ПІБ та оклад", variant:"destructive" }); return; }
    setEmpLoading2(true);
    try {
      await accFetch("payroll/employees", { method:"POST", body: JSON.stringify({ ...empForm, base_salary: +empForm.base_salary }) });
      toast({ title:"Співробітника додано" });
      qc.invalidateQueries({ queryKey:["acc-ledger"] });
      setShowEmpForm(false); setEmpForm(emptyEmp);
    } catch(e:any) { toast({ title:"Помилка", description: e.message, variant:"destructive" }); }
    finally { setEmpLoading2(false); }
  };

  const handleAddAccrual = async () => {
    if (!accrualForm.gross_amount) { toast({ title:"Вкажіть суму нарахування", variant:"destructive" }); return; }
    setAccrualLoading(true);
    try {
      await accFetch("payroll/accruals", { method:"POST", body: JSON.stringify({
        employee_id: showAccrual.employee_id, period_year: +year, period_month: +month,
        accrual_type: accrualForm.accrual_type, gross_amount: +accrualForm.gross_amount, notes: accrualForm.notes,
      }) });
      toast({ title:"Нарахування додано" });
      qc.invalidateQueries({ queryKey:["acc-ledger"] });
      setShowAccrual(null); setAccrualForm({ gross_amount:"", accrual_type:"salary", notes:"" });
    } catch(e:any) { toast({ title:"Помилка", description: e.message, variant:"destructive" }); }
    finally { setAccrualLoading(false); }
  };

  const handlePost = async () => {
    if (!confirm(`Провести зарплату за ${MONTHS_UK[+month-1]} ${year}? Будуть створені проводки 661/641/642/651.`)) return;
    setPosting(true);
    try {
      const res = await accFetch("payroll/post", { method:"POST", body: JSON.stringify({ year:+year, month:+month }) });
      toast({ title:`Зарплату проведено`, description:`Нараховано: ${fmt(res.gross)} грн, ЄСВ: ${fmt(res.esv)} грн. Створено ${res.entriesCreated} проводок` });
      qc.invalidateQueries({ queryKey:["acc-ledger"] });
    } catch(e:any) { toast({ title:"Помилка", description: e.message, variant:"destructive" }); }
    finally { setPosting(false); }
  };

  const emps: any[] = Array.isArray(employees) ? employees : [];
  const empList: any[] = sheet?.employees ?? [];
  const totals = sheet?.totals ?? {};
  const isPosted = empList.some((e:any) => e.is_posted);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border rounded-lg overflow-hidden">
          {(["sheet","employees"] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${view===v?"bg-blue-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>
              {v==="sheet"?"Відомість":"Співробітники"}
            </button>
          ))}
        </div>
        {view === "sheet" && (
          <>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{[2023,2024,2025,2026].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS_UK.map((m,i)=><SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {view === "sheet" && (
            <Button size="sm" onClick={handlePost} disabled={posting || isPosted || empList.length === 0}
              className={isPosted ? "bg-green-100 text-green-700 border border-green-300" : "bg-[--mhd-primary] hover:bg-[--mhd-primary]/90"}>
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              {isPosted ? "Проведено" : "Провести зарплату"}
            </Button>
          )}
          {view === "employees" && (
            <Button size="sm" className="h-9 gap-1.5 bg-[--mhd-primary] hover:bg-[--mhd-primary]/90" onClick={()=>setShowEmpForm(true)}>
              <Plus className="w-3.5 h-3.5" /> Додати співробітника
            </Button>
          )}
        </div>
      </div>

      {/* KPI */}
      {view === "sheet" && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label:"Нараховано (Гр)",    val: totals.gross, color:"blue" },
            { label:"ПДФО 18%",           val: totals.pdfo,  color:"red" },
            { label:"ВЗ 1.5%",            val: totals.vz,    color:"orange" },
            { label:"ЄСВ 22% (робот.)",   val: totals.esv,   color:"purple" },
            { label:"До виплати (Нт)",    val: totals.net,   color:"green" },
          ].map(({label,val,color}) => (
            <Card key={label} className={`border-${color}-200 bg-${color}-50`}>
              <CardContent className="p-3">
                <div className={`text-[10px] text-${color}-700 font-medium mb-0.5`}>{label}</div>
                <div className={`text-base font-bold text-${color}-700`}>{fmt(val)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {view === "sheet" && (
        <Card>
          <CardContent className="p-0">
            {sheetLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>ПІБ</TableHead>
                    <TableHead>Посада</TableHead>
                    <TableHead>ІПН</TableHead>
                    <TableHead className="text-right w-32 text-blue-700">Нараховано</TableHead>
                    <TableHead className="text-right w-28 text-red-600">ПДФО 18%</TableHead>
                    <TableHead className="text-right w-24 text-orange-600">ВЗ 1.5%</TableHead>
                    <TableHead className="text-right w-28 text-purple-600">ЄСВ 22%</TableHead>
                    <TableHead className="text-right w-32 text-green-700">До виплати</TableHead>
                    <TableHead className="text-center w-24">Статус</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empList.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-gray-400 text-sm">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Активних співробітників не знайдено. Спочатку додайте їх у вкладці «Співробітники».
                    </TableCell></TableRow>
                  ) : empList.map((e:any) => (
                    <TableRow key={e.employee_id} className="hover:bg-gray-50">
                      <TableCell className="text-sm font-medium">{e.full_name}</TableCell>
                      <TableCell className="text-xs text-gray-500">{e.position || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-gray-500">{e.ipn || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-blue-700">{fmt(e.gross_total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-600">{fmt(e.pdfo_total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-orange-600">{fmt(e.vz_total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-purple-600">{fmt(e.esv_total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-green-700">{fmt(e.net_total)}</TableCell>
                      <TableCell className="text-center">
                        {e.is_posted
                          ? <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">Проведено</Badge>
                          : <Badge variant="outline" className="text-[10px] text-gray-400">Не проведено</Badge>}
                      </TableCell>
                      <TableCell>
                        {!e.is_posted && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-blue-600" onClick={() => setShowAccrual(e)}>
                            <Plus className="w-3 h-3 mr-0.5" /> Нарахування
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {empList.length > 0 && (
                    <TableRow className="bg-gray-100 border-t-2 border-gray-300 font-bold text-xs">
                      <TableCell colSpan={3} className="font-bold text-gray-800">РАЗОМ</TableCell>
                      <TableCell className="text-right font-bold text-blue-800">{fmt(totals.gross)}</TableCell>
                      <TableCell className="text-right font-bold text-red-700">{fmt(totals.pdfo)}</TableCell>
                      <TableCell className="text-right font-bold text-orange-700">{fmt(totals.vz)}</TableCell>
                      <TableCell className="text-right font-bold text-purple-700">{fmt(totals.esv)}</TableCell>
                      <TableCell className="text-right font-bold text-green-800">{fmt(totals.net)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {view === "employees" && (
        <Card>
          <CardContent className="p-0">
            {empLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
              <Table>
                <TableHeader className="bg-gray-50"><TableRow>
                  <TableHead>ПІБ</TableHead><TableHead>Посада</TableHead>
                  <TableHead>ІПН</TableHead><TableHead className="text-right w-36">Оклад, грн</TableHead>
                  <TableHead className="w-28">З дати</TableHead><TableHead className="text-center w-24">Статус</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {emps.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                      <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />Співробітників не знайдено. Додайте першого.
                    </TableCell></TableRow>
                  ) : emps.map((e:any) => (
                    <TableRow key={e.id} className="hover:bg-gray-50">
                      <TableCell className="text-sm font-medium">{e.full_name}</TableCell>
                      <TableCell className="text-xs text-gray-500">{e.position||"—"}</TableCell>
                      <TableCell className="text-xs font-mono text-gray-500">{e.ipn||"—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{fmt(e.base_salary)}</TableCell>
                      <TableCell className="text-xs">{e.hire_date ? format(new Date(e.hire_date),"dd.MM.yyyy") : "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={e.is_active ? "bg-green-100 text-green-700 border-green-200 text-[10px]" : "bg-gray-100 text-gray-500 text-[10px]"}>
                          {e.is_active ? "Активний" : "Звільнено"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add employee dialog */}
      <Dialog open={showEmpForm} onOpenChange={setShowEmpForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Новий співробітник</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label className="text-xs">ПІБ *</Label><Input value={empForm.full_name} onChange={e=>setEmpForm((f:any)=>({...f,full_name:e.target.value}))} className="mt-1" placeholder="Іваненко Іван Іванович" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Посада</Label><Input value={empForm.position} onChange={e=>setEmpForm((f:any)=>({...f,position:e.target.value}))} className="mt-1" placeholder="Адміністратор" /></div>
              <div><Label className="text-xs">ІПН</Label><Input value={empForm.ipn} onChange={e=>setEmpForm((f:any)=>({...f,ipn:e.target.value}))} className="mt-1" placeholder="1234567890" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Оклад, грн *</Label><Input type="number" step="100" value={empForm.base_salary} onChange={e=>setEmpForm((f:any)=>({...f,base_salary:e.target.value}))} className="mt-1" placeholder="20000" /></div>
              <div><Label className="text-xs">Дата прийому</Label><Input type="date" value={empForm.hire_date} onChange={e=>setEmpForm((f:any)=>({...f,hire_date:e.target.value}))} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={()=>{setShowEmpForm(false);setEmpForm(emptyEmp);}}>Скасувати</Button>
              <Button onClick={handleAddEmployee} disabled={empLoading2} className="bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
                {empLoading2?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<Plus className="w-4 h-4 mr-1"/>} Зберегти
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add accrual dialog */}
      <Dialog open={!!showAccrual} onOpenChange={v=>!v&&setShowAccrual(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Нарахування — {showAccrual?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label className="text-xs">Вид нарахування</Label>
              <Select value={accrualForm.accrual_type} onValueChange={v=>setAccrualForm(f=>({...f,accrual_type:v}))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary">Зарплата</SelectItem>
                  <SelectItem value="bonus">Премія</SelectItem>
                  <SelectItem value="sick">Лікарняні</SelectItem>
                  <SelectItem value="vacation">Відпускні</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Нараховано (Гр), грн *</Label>
              <Input type="number" step="0.01" value={accrualForm.gross_amount} onChange={e=>setAccrualForm(f=>({...f,gross_amount:e.target.value}))} className="mt-1" placeholder="20000.00" />
            </div>
            {accrualForm.gross_amount && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between"><span>ПДФО 18%:</span><strong>{(+accrualForm.gross_amount * 0.18).toFixed(2)} грн</strong></div>
                <div className="flex justify-between"><span>ВЗ 1.5%:</span><strong>{(+accrualForm.gross_amount * 0.015).toFixed(2)} грн</strong></div>
                <div className="flex justify-between"><span>ЄСВ 22% (роб.):</span><strong>{(+accrualForm.gross_amount * 0.22).toFixed(2)} грн</strong></div>
                <div className="flex justify-between border-t pt-1 font-semibold text-green-700"><span>До виплати:</span><strong>{(+accrualForm.gross_amount * 0.805).toFixed(2)} грн</strong></div>
              </div>
            )}
            <div><Label className="text-xs">Примітка</Label><Input value={accrualForm.notes} onChange={e=>setAccrualForm(f=>({...f,notes:e.target.value}))} className="mt-1" /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={()=>setShowAccrual(null)}>Скасувати</Button>
              <Button onClick={handleAddAccrual} disabled={accrualLoading} className="bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
                {accrualLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<Calculator className="w-4 h-4 mr-1"/>} Нарахувати
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ACC: FIXED ASSETS (ОСНОВНІ ЗАСОБИ) ───────────────────────────────────────
function AccFixedAssetsTab() {
  const now = new Date();
  const [view, setView]     = useState<"list" | "report">("list");
  const [asDate, setAsDate] = useState(format(now,"yyyy-MM-dd"));
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [deprTarget, setDeprTarget] = useState<any>(null);
  const [deprYear,   setDeprYear]   = useState(String(now.getFullYear()));
  const [deprMonth,  setDeprMonth]  = useState(String(now.getMonth()+1));
  const [deprLoading, setDeprLoading] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const MONTHS_UK = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];

  const listKey   = "fixed-assets";
  const reportKey = `fixed-assets/report?date=${asDate}`;
  const { data: assets,  isLoading: assetsLoading  } = useAccLedger(listKey,   { enabled: view === "list" });
  const { data: report,  isLoading: reportLoading   } = useAccLedger(reportKey, { enabled: view === "report" });

  const DEPR_METHODS = [{ v:"straight-line", l:"Прямолінійний" }, { v:"reducing", l:"Зменшення залишку" }];
  const FA_ACCOUNTS  = [{ v:"101", l:"101 — Земельні ділянки" },{ v:"103", l:"103 — Будинки та споруди" },
    { v:"104", l:"104 — Машини та обладнання" },{ v:"105", l:"105 — Транспортні засоби" },
    { v:"106", l:"106 — Інструменти та інвентар" },{ v:"109", l:"109 — Інші основні засоби" }];

  const emptyForm = { name:"", inventory_number:"", account_code:"104", initial_cost:"", liquidation_value:"0", useful_life_months:"60", depreciation_method:"straight-line", start_date:format(now,"yyyy-MM-dd"), category:"", notes:"" };
  const [form, setForm] = useState<any>(emptyForm);

  const fmt = (n: any) => Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleAdd = async () => {
    if (!form.name || !form.initial_cost || !form.start_date) {
      toast({ title:"Заповніть обов'язкові поля", variant:"destructive" }); return;
    }
    setAddLoading(true);
    try {
      await accFetch("fixed-assets", { method:"POST", body: JSON.stringify({
        ...form, initial_cost: +form.initial_cost, liquidation_value: +form.liquidation_value,
        useful_life_months: +form.useful_life_months,
      }) });
      toast({ title:"Основний засіб додано" });
      qc.invalidateQueries({ queryKey:["acc-ledger"] });
      setShowAdd(false); setForm(emptyForm);
    } catch(e:any) { toast({ title:"Помилка", description: e.message, variant:"destructive" }); }
    finally { setAddLoading(false); }
  };

  const handleDepreciate = async () => {
    if (!deprTarget) return;
    setDeprLoading(true);
    try {
      const res = await accFetch(`fixed-assets/${deprTarget.id}/depreciate`, {
        method:"POST", body: JSON.stringify({ year:+deprYear, month:+deprMonth }),
      });
      toast({ title:`Амортизацію нараховано`, description:`${deprTarget.name}: ${fmt(res.amount)} грн за ${MONTHS_UK[+deprMonth-1]} ${deprYear}` });
      qc.invalidateQueries({ queryKey:["acc-ledger"] });
      setDeprTarget(null);
    } catch(e:any) { toast({ title:"Помилка", description: e.message, variant:"destructive" }); }
    finally { setDeprLoading(false); }
  };

  const handleDispose = async (id: number, name: string) => {
    if (!confirm(`Списати «${name}»?`)) return;
    try {
      await accFetch(`fixed-assets/${id}`, { method:"PATCH", body: JSON.stringify({ is_disposed:true, disposed_at: format(now,"yyyy-MM-dd") }) });
      toast({ title:"ОЗ списано" });
      qc.invalidateQueries({ queryKey:["acc-ledger"] });
    } catch(e:any) { toast({ title:"Помилка", description: e.message, variant:"destructive" }); }
  };

  const assetList: any[] = Array.isArray(assets) ? assets : [];
  const repData = report?.rows ?? [];
  const repTotals = report?.totals ?? {};

  const monthlyDeprPreview = form.initial_cost && form.liquidation_value !== undefined && form.useful_life_months
    ? ((+form.initial_cost - +form.liquidation_value) / +form.useful_life_months)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border rounded-lg overflow-hidden">
          {(["list","report"] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${view===v?"bg-blue-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>
              {v==="list"?"Картки ОЗ":"Відомість залишків"}
            </button>
          ))}
        </div>
        {view === "report" && (
          <Input type="date" value={asDate} onChange={e=>setAsDate(e.target.value)} className="w-40 h-9 text-xs" />
        )}
        <Button size="sm" className="ml-auto h-9 gap-1.5 bg-[--mhd-primary] hover:bg-[--mhd-primary]/90" onClick={()=>setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Додати ОЗ
        </Button>
      </div>

      {view === "list" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-blue-200 bg-blue-50"><CardContent className="p-3"><div className="text-[10px] text-blue-700 font-medium">ОЗ на обліку</div><div className="text-xl font-bold text-blue-700">{assetList.length} од.</div></CardContent></Card>
            <Card className="border-gray-200 bg-gray-50"><CardContent className="p-3"><div className="text-[10px] text-gray-700 font-medium">Первісна вартість</div><div className="text-xl font-bold text-gray-700">{fmt(assetList.reduce((s,r)=>s+Number(r.initial_cost),0))} грн</div></CardContent></Card>
            <Card className="border-green-200 bg-green-50"><CardContent className="p-3"><div className="text-[10px] text-green-700 font-medium">Залишкова вартість</div><div className="text-xl font-bold text-green-700">{fmt(assetList.reduce((s,r)=>s+Number(r.residual_value),0))} грн</div></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-0">
              {assetsLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-20">Рах.</TableHead>
                      <TableHead>Назва об'єкту</TableHead>
                      <TableHead className="w-28">Інв. №</TableHead>
                      <TableHead className="w-24">Введено</TableHead>
                      <TableHead className="w-16 text-center">Міс.</TableHead>
                      <TableHead className="text-right w-32">Первісна, грн</TableHead>
                      <TableHead className="text-right w-32">Знос, грн</TableHead>
                      <TableHead className="text-right w-32">Залишкова, грн</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetList.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400 text-sm">
                        <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-30" />Основних засобів не знайдено. Додайте перший об'єкт.
                      </TableCell></TableRow>
                    ) : assetList.map((a:any) => (
                      <TableRow key={a.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-xs font-bold text-blue-800">{a.account_code}</TableCell>
                        <TableCell className="text-xs font-medium">{a.name}{a.category && <span className="ml-1 text-[10px] text-gray-400">({a.category})</span>}</TableCell>
                        <TableCell className="text-xs font-mono text-gray-500">{a.inventory_number || "—"}</TableCell>
                        <TableCell className="text-xs">{a.start_date ? format(new Date(a.start_date),"dd.MM.yyyy") : "—"}</TableCell>
                        <TableCell className="text-center text-xs text-gray-500">{a.useful_life_months}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(a.initial_cost)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">{fmt(a.accumulated_depreciation)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${Number(a.residual_value)>0?"text-green-700":"text-gray-400"}`}>{fmt(a.residual_value)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-blue-600 hover:bg-blue-50" onClick={()=>setDeprTarget(a)}>
                              <Calculator className="w-3 h-3 mr-0.5" /> Аморт.
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-red-400 hover:bg-red-50 hover:text-red-600" onClick={()=>handleDispose(a.id,a.name)}>
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {view === "report" && (
        <Card>
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-bold text-gray-800">Відомість основних засобів станом на {format(new Date(asDate),"dd.MM.yyyy")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {reportLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-500" /></div> : (
              <Table>
                <TableHeader className="bg-gray-50"><TableRow>
                  <TableHead className="w-20">Рах.</TableHead><TableHead>Назва</TableHead>
                  <TableHead className="text-right w-36">Первісна, грн</TableHead>
                  <TableHead className="text-right w-36">Знос, грн</TableHead>
                  <TableHead className="text-right w-36">Залишкова, грн</TableHead>
                  <TableHead className="text-right w-20">Знос, %</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {repData.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400 text-sm">Основних засобів не знайдено</TableCell></TableRow>
                  ) : repData.map((a:any) => {
                    const wearPct = Number(a.initial_cost) > 0 ? (Number(a.accumulated_depreciation)/Number(a.initial_cost)*100).toFixed(1) : "0.0";
                    return (
                      <TableRow key={a.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-xs font-bold text-blue-800">{a.account_code}</TableCell>
                        <TableCell className="text-xs font-medium">{a.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(a.initial_cost)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">{fmt(a.accumulated_depreciation)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${Number(a.residual_value)>0?"text-green-700":"text-gray-400"}`}>{fmt(a.residual_value)}</TableCell>
                        <TableCell className="text-right text-xs">
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${+wearPct>80?"bg-red-100 text-red-700":+wearPct>50?"bg-orange-100 text-orange-700":"bg-green-100 text-green-700"}`}>
                            {wearPct}%
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {repData.length > 0 && (
                    <TableRow className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                      <TableCell colSpan={2} className="text-xs font-bold text-gray-800">РАЗОМ</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold">{fmt(repTotals.initial_cost)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-red-700">{fmt(repTotals.accumulated_depreciation)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-green-800">{fmt(repTotals.residual_value)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add fixed asset dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Новий основний засіб</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label className="text-xs">Назва об'єкту *</Label>
              <Input value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))} className="mt-1" placeholder="Пральна машина Miele W1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Рахунок обліку</Label>
                <Select value={form.account_code} onValueChange={v=>setForm((f:any)=>({...f,account_code:v}))}>
                  <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{FA_ACCOUNTS.map(a=><SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Інвентарний №</Label>
                <Input value={form.inventory_number} onChange={e=>setForm((f:any)=>({...f,inventory_number:e.target.value}))} className="mt-1" placeholder="ОЗ-001" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Первісна вартість *</Label>
                <Input type="number" step="0.01" value={form.initial_cost} onChange={e=>setForm((f:any)=>({...f,initial_cost:e.target.value}))} className="mt-1" placeholder="50000" /></div>
              <div><Label className="text-xs">Ліквідаційна вартість</Label>
                <Input type="number" step="0.01" value={form.liquidation_value} onChange={e=>setForm((f:any)=>({...f,liquidation_value:e.target.value}))} className="mt-1" placeholder="0" /></div>
              <div><Label className="text-xs">Строк служби (міс.)</Label>
                <Input type="number" value={form.useful_life_months} onChange={e=>setForm((f:any)=>({...f,useful_life_months:e.target.value}))} className="mt-1" placeholder="60" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Метод амортизації</Label>
                <Select value={form.depreciation_method} onValueChange={v=>setForm((f:any)=>({...f,depreciation_method:v}))}>
                  <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPR_METHODS.map(m=><SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Дата введення *</Label>
                <Input type="date" value={form.start_date} onChange={e=>setForm((f:any)=>({...f,start_date:e.target.value}))} className="mt-1" /></div>
            </div>
            {monthlyDeprPreview > 0 && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                Щомісячна амортизація (прямолінійний): <strong>{monthlyDeprPreview.toFixed(2)} грн/міс</strong>
                <span className="ml-2 text-blue-500">• Дт 92 → Кт 131</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={()=>{setShowAdd(false);setForm(emptyForm);}}>Скасувати</Button>
              <Button onClick={handleAdd} disabled={addLoading} className="bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
                {addLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<Plus className="w-4 h-4 mr-1"/>} Додати ОЗ
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Depreciation dialog */}
      <Dialog open={!!deprTarget} onOpenChange={v=>!v&&setDeprTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Нарахування амортизації</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <div className="font-semibold text-gray-800 mb-1">{deprTarget?.name}</div>
              <div className="text-gray-500">Залишкова вартість: <strong>{fmt(deprTarget?.residual_value)} грн</strong></div>
              <div className="text-gray-500">Строк служби: <strong>{deprTarget?.useful_life_months} міс.</strong></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Рік</Label>
                <Select value={deprYear} onValueChange={setDeprYear}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{[2023,2024,2025,2026].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Місяць</Label>
                <Select value={deprMonth} onValueChange={setDeprMonth}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS_UK.map((m,i)=><SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded">
              Буде створено проводку: <strong>Дт 92 → Кт 131</strong>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={()=>setDeprTarget(null)}>Скасувати</Button>
              <Button onClick={handleDepreciate} disabled={deprLoading} className="bg-[--mhd-primary] hover:bg-[--mhd-primary]/90">
                {deprLoading?<Loader2 className="w-4 h-4 animate-spin mr-1"/>:<Calculator className="w-4 h-4 mr-1"/>} Нарахувати
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
