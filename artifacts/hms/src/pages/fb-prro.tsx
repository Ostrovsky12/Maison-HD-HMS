import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, Clock,
  Play, Square, FileText, Printer, RefreshCw, ExternalLink,
  ChevronDown, ChevronUp, Receipt, BarChart3, History,
} from "lucide-react";

const API = "/api";
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  }).then(async r => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.statusText);
    return d;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PrroStatus = {
  id: number; name: string; short_name?: string; type: string;
  status: "open" | "closed" | "no_shift" | "not_configured" | "error";
  error?: string;
  shift: {
    id: string; status: string; opened_at: string; closed_at?: string;
    balance?: { initial: number; balance: number; };
  } | null;
  cashier: { name: string; tin: string } | null;
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PrroStatus["status"] }) {
  const cfg: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    open: { label: "Зміну відкрито", className: "bg-green-500/15 text-green-600 border-green-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    closed: { label: "Зміну закрито", className: "bg-slate-500/15 text-slate-500 border-slate-500/30", icon: <XCircle className="w-3 h-3" /> },
    no_shift: { label: "Зміна не відкрита", className: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: <AlertTriangle className="w-3 h-3" /> },
    not_configured: { label: "Не налаштовано", className: "bg-muted text-muted-foreground border-border", icon: <Clock className="w-3 h-3" /> },
    error: { label: "Помилка з'єднання", className: "bg-red-500/15 text-red-600 border-red-500/30", icon: <XCircle className="w-3 h-3" /> },
  };
  const c = cfg[status] || cfg.not_configured;
  return (
    <Badge className={`gap-1 border ${c.className}`}>
      {c.icon}{c.label}
    </Badge>
  );
}

// ── Report modal ──────────────────────────────────────────────────────────────
function ReportModal({ title, data, onClose }: { title: string; data: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />{title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {data.receiptUrl && (
            <a href={data.receiptUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline">
              <ExternalLink className="w-3.5 h-3.5" />Відкрити звіт на receipt.checkbox.ua
            </a>
          )}
          {data.text && (
            <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap">
              {data.text}
            </pre>
          )}
          {!data.text && data.report && (
            <div className="text-xs space-y-1.5 bg-muted rounded-lg p-3">
              {data.report.fiscal_code && <div><span className="text-muted-foreground">Фіскальний номер:</span> <span className="font-mono font-semibold">{data.report.fiscal_code}</span></div>}
              {data.report.created_at && <div><span className="text-muted-foreground">Дата/час:</span> {new Date(data.report.created_at).toLocaleString("uk-UA")}</div>}
              {data.report.total_sum !== undefined && <div><span className="text-muted-foreground">Загальна сума:</span> {(data.report.total_sum / 100).toFixed(2)} ₴</div>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          {data.receiptUrl && (
            <Button onClick={() => window.open(data.receiptUrl, "_blank")}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Відкрити
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Close shift confirmation ───────────────────────────────────────────────────
function CloseShiftDialog({ entity, onClose, onConfirm, loading }: {
  entity: PrroStatus; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Закрити зміну та сформувати Z-звіт</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-amber-700 dark:text-amber-400 text-xs">
            <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
            Після закриття зміни всі операції будуть зафіксовані в ДПС. Z-звіт буде надіслано автоматично.
          </div>
          <p>Юридична особа: <strong>{entity.name}</strong></p>
          {entity.shift?.opened_at && (
            <p>Зміна відкрита: <strong>{new Date(entity.shift.opened_at).toLocaleString("uk-UA")}</strong></p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            <Square className="w-3.5 h-3.5 mr-1.5" />
            {loading ? "Закриття..." : "Закрити зміну"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Entity card ───────────────────────────────────────────────────────────────
function PrroEntityCard({ entity, onRefresh }: { entity: PrroStatus; onRefresh: () => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [reportModal, setReportModal] = useState<{ title: string; data: any } | null>(null);
  const [closeDialog, setCloseDialog] = useState(false);

  const openShift = useMutation({
    mutationFn: () => apiFetch(`/fb/prro/${entity.id}/open-shift`, { method: "POST" }),
    onSuccess: (d) => {
      toast({ title: d.alreadyOpen ? "Зміна вже відкрита" : "Зміну відкрито у Checkbox" });
      onRefresh();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const closeShift = useMutation({
    mutationFn: () => apiFetch(`/fb/prro/${entity.id}/close-shift`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Зміну закрито. Z-звіт сформовано у Checkbox." });
      setCloseDialog(false);
      onRefresh();
    },
    onError: (e: any) => { toast({ title: "Помилка", description: e.message, variant: "destructive" }); setCloseDialog(false); },
  });

  const xReport = useMutation({
    mutationFn: () => apiFetch(`/fb/prro/${entity.id}/x-report`),
    onSuccess: (d) => setReportModal({ title: `X-звіт — ${entity.name}`, data: d }),
    onError: (e: any) => toast({ title: "Помилка X-звіту", description: e.message, variant: "destructive" }),
  });

  const zReport = useMutation({
    mutationFn: () => apiFetch(`/fb/prro/${entity.id}/z-report`),
    onSuccess: (d) => setReportModal({ title: `Z-звіт — ${entity.name}`, data: d }),
    onError: (e: any) => toast({ title: "Помилка Z-звіту", description: e.message, variant: "destructive" }),
  });

  const testReceipt = useMutation({
    mutationFn: () => apiFetch(`/fb/prro/${entity.id}/test-receipt`, { method: "POST" }),
    onSuccess: (d) => setReportModal({ title: `Тест-чек — ${entity.name}`, data: d }),
    onError: (e: any) => toast({ title: "Помилка тест-чеку", description: e.message, variant: "destructive" }),
  });

  const isOpen = entity.status === "open";
  const isClosed = entity.status === "closed";
  const canOperate = entity.status !== "not_configured" && entity.status !== "error";
  const anyLoading = openShift.isPending || closeShift.isPending || xReport.isPending || zReport.isPending || testReceipt.isPending;

  return (
    <>
      <div className={`rounded-xl border bg-card ${isOpen ? "border-green-500/30 shadow-sm shadow-green-500/10" : ""}`}>
        {/* Header */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs
              ${isOpen ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
              {entity.type === "fop" ? "ФОП" : entity.type === "tov" ? "ТОВ" : entity.type.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{entity.name}</span>
                <StatusBadge status={entity.status} />
              </div>
              {entity.cashier && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Касир: {entity.cashier.name}
                  {entity.cashier.tin && <> · ТІН: {entity.cashier.tin}</>}
                </div>
              )}
              {entity.error && (
                <div className="text-xs text-red-500 mt-0.5">{entity.error}</div>
              )}
              {entity.shift?.opened_at && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Відкрито: {new Date(entity.shift.opened_at).toLocaleString("uk-UA")}
                  {entity.shift.closed_at && <> · Закрито: {new Date(entity.shift.closed_at).toLocaleString("uk-UA")}</>}
                </div>
              )}
            </div>
            <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground shrink-0 p-1">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            {!isOpen && (
              <Button size="sm" onClick={() => openShift.mutate()} disabled={!canOperate || anyLoading}
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                <Play className="w-3.5 h-3.5" />
                {openShift.isPending ? "Відкриття..." : "Відкрити зміну"}
              </Button>
            )}
            {isOpen && (
              <>
                <Button size="sm" variant="outline" onClick={() => xReport.mutate()} disabled={anyLoading} className="gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  {xReport.isPending ? "..." : "X-звіт"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => testReceipt.mutate()} disabled={anyLoading} className="gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  {testReceipt.isPending ? "..." : "Тест-чек"}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setCloseDialog(true)} disabled={anyLoading} className="gap-1.5">
                  <Square className="w-3.5 h-3.5" />
                  Закрити зміну
                </Button>
              </>
            )}
            {isClosed && (
              <Button size="sm" variant="outline" onClick={() => zReport.mutate()} disabled={anyLoading} className="gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                {zReport.isPending ? "..." : "Z-звіт"}
              </Button>
            )}
          </div>
        </div>

        {/* Expanded: shift details */}
        {expanded && entity.shift && (
          <div className="border-t px-4 pb-4 pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Деталі зміни</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <div><span className="text-muted-foreground">ID зміни:</span> <span className="font-mono">{entity.shift.id}</span></div>
              <div><span className="text-muted-foreground">Статус:</span> {entity.shift.status}</div>
              {entity.shift.balance && (
                <>
                  <div><span className="text-muted-foreground">Початковий залишок:</span> {((entity.shift.balance.initial || 0) / 100).toFixed(2)} ₴</div>
                  <div><span className="text-muted-foreground">Поточний залишок:</span> {((entity.shift.balance.balance || 0) / 100).toFixed(2)} ₴</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {closeDialog && (
        <CloseShiftDialog
          entity={entity}
          onClose={() => setCloseDialog(false)}
          onConfirm={() => closeShift.mutate()}
          loading={closeShift.isPending}
        />
      )}
      {reportModal && (
        <ReportModal title={reportModal.title} data={reportModal.data} onClose={() => setReportModal(null)} />
      )}
    </>
  );
}

// ── Shifts history panel ──────────────────────────────────────────────────────
function ShiftsHistory({ entityId, entityName }: { entityId: number; entityName: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["prro-shifts", entityId],
    queryFn: () => apiFetch(`/fb/prro/${entityId}/shifts`),
    enabled: open,
  });

  const shifts: any[] = data?.shifts || [];

  return (
    <div className="rounded-xl border bg-card">
      <button
        className="w-full flex items-center gap-2 p-3 text-sm font-medium hover:bg-accent/5 transition-colors rounded-xl"
        onClick={() => setOpen(o => !o)}
      >
        <History className="w-4 h-4 text-muted-foreground" />
        <span className="flex-1 text-left text-muted-foreground text-xs">Історія змін — {entityName}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t">
          {isLoading ? (
            <p className="text-xs text-muted-foreground p-3">Завантаження...</p>
          ) : shifts.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">Немає змін</p>
          ) : (
            <div className="divide-y">
              {shifts.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === "OPENED" ? "bg-green-500" : "bg-slate-400"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-muted-foreground">{s.id?.slice(0, 8)}…</span>
                    {" "}{s.status === "OPENED" ? "Відкрита" : "Закрита"}
                  </div>
                  <div className="text-muted-foreground shrink-0">
                    {s.opened_at ? new Date(s.opened_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </div>
                  {s.id && (
                    <a href={`https://receipt.checkbox.ua/${s.id}`} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline shrink-0">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FbPrroPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fb-prro-status"],
    queryFn: () => apiFetch("/fb/prro/status"),
    refetchInterval: 60_000,
  });

  const statuses: PrroStatus[] = data?.statuses || [];
  const openCount = statuses.filter(s => s.status === "open").length;

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              ПРРО — Фіскалізація
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Checkbox API · Управління змінами та фіскальними чеками
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Оновити
          </Button>
        </div>

        {/* Summary */}
        {statuses.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{openCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Відкритих змін</div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold">{statuses.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Каси з ПРРО</div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-amber-500">{statuses.filter(s => s.status === "error" || s.status === "not_configured").length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Потребують уваги</div>
            </div>
          </div>
        )}

        {/* Entities */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="rounded-xl border bg-card p-4 animate-pulse h-24" />
            ))}
          </div>
        ) : statuses.length === 0 ? (
          <div className="border border-dashed rounded-xl p-12 text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium text-sm">Немає юридичних осіб з ПРРО</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Перейдіть до «Юр. особи» та увімкніть ПРРО (Checkbox) для кожної юр. особи.
            </p>
            <Button size="sm" variant="outline" onClick={() => setLocation("/fb/legal-entities")}>
              Налаштувати юр. особи
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {statuses.map(entity => (
              <PrroEntityCard key={entity.id} entity={entity} onRefresh={() => qc.invalidateQueries({ queryKey: ["fb-prro-status"] })} />
            ))}
          </div>
        )}

        {/* Shifts history */}
        {statuses.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Історія змін</p>
            {statuses.map(entity => (
              <ShiftsHistory key={entity.id} entityId={entity.id} entityName={entity.name} />
            ))}
          </div>
        )}

        {/* Info block */}
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 flex gap-3">
          <Printer className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p className="font-semibold">Як працює Checkbox ПРРО</p>
            <p>Кожна юр. особа має власну зміну в Checkbox. Відкрийте зміну перед початком роботи касира. X-звіт — проміжний (зміна не закривається). Z-звіт — фінальний (після закриття зміни). Всі чеки передаються до ДПС в реальному часі.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
