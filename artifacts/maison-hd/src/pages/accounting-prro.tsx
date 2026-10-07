import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Printer, Shield, CheckCircle2, AlertTriangle, 
  ChevronRight, History, Calendar, Lock, RefreshCw,
  CheckSquare, Building2, FileText
} from "lucide-react";

// ── API Helper ────────────────────────────────────────────────────────────────
const API = "/api";
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  }).then(async r => {
    let d;
    try { d = await r.json(); } catch (e) { throw new Error(r.statusText); }
    if (!r.ok) throw new Error(d.error || r.statusText || "Сталася помилка");
    return d;
  });
}

function fDate(d: string | undefined | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("uk-UA", { 
      day: "2-digit", month: "2-digit", year: "numeric", 
      hour: "2-digit", minute: "2-digit" 
    }).format(new Date(d));
  } catch {
    return d;
  }
}

// ── Components ────────────────────────────────────────────────────────────────

function DocumentStatusBadge({ doc }: { doc: any }) {
  if (doc.status === "completed" || doc.status === "fiscalized") {
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1 shadow-none"><CheckCircle2 className="w-3 h-3"/> Фіскалізовано</Badge>;
  }
  if (doc.policyDecision === "exempt") {
    return <Badge className="bg-slate-100 text-slate-600 border-slate-200 gap-1 shadow-none dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"><CheckSquare className="w-3 h-3"/> Звільнено</Badge>;
  }
  if (doc.policyDecision === "manual_review") {
    return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 shadow-none"><AlertTriangle className="w-3 h-3"/> На розгляді</Badge>;
  }
  return <Badge className="bg-muted text-muted-foreground border-border shadow-none">{doc.status || "Очікує"}</Badge>;
}

function EventsTimeline({ documentId }: { documentId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["prro-doc-events", documentId],
    queryFn: () => apiFetch(`/prro/documents/${documentId}/events`),
  });

  if (isLoading) return <div className="py-8 flex justify-center"><RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" /></div>;
  if (isError) return <div className="py-4 text-center text-xs text-red-500">Помилка завантаження історії</div>;

  const events = data?.events || [];
  if (!events.length) return <div className="py-8 text-center text-xs text-muted-foreground">Історія операцій порожня</div>;

  return (
    <div className="space-y-4 relative mt-2">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
      {events.map((ev: any, i: number) => (
        <div key={ev.id || i} className="relative pl-8">
          <div className="absolute left-0 top-1 w-6 h-6 bg-background border border-border rounded-full flex items-center justify-center shadow-sm z-10">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          </div>
          <div className="text-[11px] font-mono text-muted-foreground mb-0.5" data-testid={`event-time-${ev.id}`}>{fDate(ev.createdAt)}</div>
          <div className="text-sm font-medium text-foreground">{ev.eventType || ev.type || "Подія"}</div>
          {ev.message && <div className="text-xs text-muted-foreground mt-1 bg-muted/40 p-2 rounded-md">{ev.message}</div>}
        </div>
      ))}
    </div>
  );
}

function ReportAttemptStatus({ attempt, successful, onRetry, onReconcile }: { attempt: any, successful: any, onRetry: (id: string)=>void, onReconcile: (id: string)=>void }) {
  if (!attempt) {
    if (successful) return <span className="text-foreground text-xs">{fDate(successful.createdAt)}</span>;
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  if (attempt.status === 'completed' || attempt.status === 'fiscalized') {
    return <span className="text-foreground text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> {fDate(attempt.createdAt)}</span>;
  }

  if (attempt.status === 'failed_safe_to_retry' || attempt.status === 'pending_retry') {
    return (
       <div className="flex flex-col gap-1.5 items-start">
         <div className="text-red-500 flex items-center gap-1 text-xs"><AlertTriangle className="w-3 h-3" /> Помилка: {attempt.error || "Не вдалося"}</div>
         <div className="text-[10px] text-muted-foreground">Остання спроба: {fDate(attempt.createdAt)}</div>
         <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => onRetry(attempt.id)} data-testid={`btn-retry-${attempt.id}`}>Повторити спробу</Button>
         {successful && <div className="text-[10px] text-muted-foreground mt-1 border-t border-border pt-1">Останній успішний: {fDate(successful.createdAt)}</div>}
       </div>
    );
  }

  if (attempt.status === 'outcome_unknown') {
    return (
       <div className="flex flex-col gap-1.5 items-start">
         <div className="text-amber-500 flex items-center gap-1 text-xs"><AlertTriangle className="w-3 h-3" /> Статус невідомий</div>
         <div className="text-[10px] text-muted-foreground">Остання спроба: {fDate(attempt.createdAt)}</div>
         <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => onReconcile(attempt.id)} data-testid={`btn-reconcile-${attempt.id}`}>Звірити з ДПС</Button>
         {successful && <div className="text-[10px] text-muted-foreground mt-1 border-t border-border pt-1">Останній успішний: {fDate(successful.createdAt)}</div>}
       </div>
    );
  }

  return (
       <div className="flex flex-col gap-1.5 items-start">
         <div className="text-destructive flex items-center gap-1 text-xs"><AlertTriangle className="w-3 h-3" /> {attempt.status}</div>
         <div className="text-[10px] text-muted-foreground">Спроба: {fDate(attempt.createdAt)}</div>
         {successful && <div className="text-[10px] text-muted-foreground mt-1 border-t border-border pt-1">Останній успішний: {fDate(successful.createdAt)}</div>}
       </div>
  );
}

function ReclassifyForm({ document, onClose }: { document: any, onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  
  const [decision, setDecision] = useState(document.policyDecision || "manual_review");
  const [reason, setReason] = useState(document.policyReason || "");
  const [legalBasis, setLegalBasis] = useState(document.reviewLegalBasis || "");
  const [legalReference, setLegalReference] = useState(document.reviewLegalReference || "");

  const mut = useMutation({
    mutationFn: (payload: any) => apiFetch(`/prro/accountant/documents/${document.id}/reclassify`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    onSuccess: () => {
      toast({ title: "Документ успішно перекласифіковано" });
      qc.invalidateQueries({ queryKey: ["accounting-prro-journal"] });
      qc.invalidateQueries({ queryKey: ["accounting-prro-overview"] });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    }
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      mut.mutate({ decision, reason, legalBasis, legalReference });
    }} className="space-y-5 bg-card border border-border p-6 rounded-xl shadow-sm">
      
      <div>
        <label className="text-xs font-semibold mb-2 block uppercase tracking-wider text-muted-foreground">Фіскальне рішення</label>
        <select 
          value={decision} 
          onChange={e=>setDecision(e.target.value)} 
          className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-1 focus-visible:ring-primary outline-none transition-shadow"
          data-testid="select-decision"
        >
          <option value="fiscalize">Фіскалізувати (Надіслати в ДПС)</option>
          <option value="exempt">Звільнити від фіскалізації (Exempt)</option>
          <option value="manual_review">Залишити на ручному розгляді</option>
        </select>
      </div>
      
      <div>
        <label className="text-xs font-semibold mb-2 block uppercase tracking-wider text-muted-foreground">Внутрішній коментар / Причина</label>
        <Textarea 
          value={reason} 
          onChange={e=>setReason(e.target.value)} 
          className="text-sm resize-none" 
          rows={3} 
          placeholder="Опишіть причину зміни рішення..." 
          data-testid="input-reason"
        />
      </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border mt-4">
          <div>
            <label className="text-xs font-semibold mb-2 block uppercase tracking-wider text-muted-foreground">Юридична підстава</label>
            <Input 
              value={legalBasis} 
              onChange={e=>setLegalBasis(e.target.value)} 
              className="h-10 text-sm" 
              placeholder="ПКУ Ст. 296.10" 
              data-testid="input-legal-basis"
            />
          </div>
          <div>
            <label className="text-xs font-semibold mb-2 block uppercase tracking-wider text-muted-foreground">Документ-підтвердження</label>
            <Input 
              value={legalReference} 
              onChange={e=>setLegalReference(e.target.value)} 
              className="h-10 text-sm" 
              placeholder="Наказ №42 від 10.02.2024" 
              data-testid="input-legal-ref"
            />
          </div>
        </div>

      <div className="pt-4 flex justify-end gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onClose} data-testid="btn-cancel">Скасувати</Button>
        <Button type="submit" disabled={mut.isPending} data-testid="btn-reclassify-submit" className="bg-primary hover:bg-primary/90">
          {mut.isPending ? "Збереження..." : "Застосувати рішення"}
        </Button>
      </div>
    </form>
  )
}

function RegisterFormDialog({ isOpen, entityId, register, onClose }: { isOpen: boolean, entityId?: string, register?: any, onClose: () => void }) {
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [fiscalNumber, setFiscalNumber] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setName(register?.name || "");
      setDeviceId(register?.deviceId || register?.checkbox_id || "");
      setFiscalNumber(register?.fiscalNumber || "");
      setLocationName(register?.locationName || "");
      setLocationAddress(register?.locationAddress || "");
    }
  }, [isOpen, register]);

  const mut = useMutation({
    mutationFn: (payload: any) => {
      if (register?.id) {
        return apiFetch(`/prro/registers/${register.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        return apiFetch(`/prro/registers`, { method: "POST", body: JSON.stringify({ ...payload, legalEntityId: entityId }) });
      }
    },
    onSuccess: () => {
      toast({ title: register?.id ? "Касу оновлено" : "Касу створено" });
      qc.invalidateQueries({ queryKey: ["accounting-prro-overview"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" })
  });

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{register?.id ? "Редагувати касу" : "Додати нову касу"}</DialogTitle>
        <DialogDescription className="sr-only">
          Налаштування реєстратора розрахункових операцій для вибраної юридичної особи.
        </DialogDescription>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate({ name, deviceId, fiscalNumber, locationName, locationAddress }); }} className="space-y-4 mt-2">
           <div>
             <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Назва каси</label>
             <Input value={name} onChange={e=>setName(e.target.value)} required data-testid="input-reg-name" />
           </div>
           <div>
             <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Device ID</label>
             <Input value={deviceId} onChange={e=>setDeviceId(e.target.value)} required data-testid="input-reg-device" />
           </div>
           <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Фіскальний номер</label>
              <Input value={fiscalNumber} onChange={e=>setFiscalNumber(e.target.value)} required data-testid="input-reg-fiscal" />
           </div>
           <div className="grid grid-cols-2 gap-4">
             <div>
               <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Назва точки</label>
               <Input value={locationName} onChange={e=>setLocationName(e.target.value)} data-testid="input-reg-loc-name" />
             </div>
             <div>
               <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Адреса</label>
               <Input value={locationAddress} onChange={e=>setLocationAddress(e.target.value)} data-testid="input-reg-loc-address" />
             </div>
           </div>
           <div className="flex justify-end gap-2 pt-4 border-t mt-4">
             <Button type="button" variant="outline" onClick={onClose}>Скасувати</Button>
             <Button type="submit" disabled={mut.isPending} className="bg-primary hover:bg-primary/90">{mut.isPending ? "Збереження..." : "Зберегти"}</Button>
           </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenShiftDialog({ isOpen, registerId, onClose }: { isOpen: boolean, registerId?: string, onClose: () => void }) {
  const [signerKeyId, setSignerKeyId] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (isOpen) setSignerKeyId("");
  }, [isOpen]);

  const mut = useMutation({
    mutationFn: () => apiFetch(`/prro/registers/${registerId}/shifts/open`, { method: "POST", body: JSON.stringify({ signerKeyId }) }),
    onSuccess: () => {
      toast({ title: "Зміну відкрито" });
      qc.invalidateQueries({ queryKey: ["accounting-prro-overview"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка відкриття", description: e.message, variant: "destructive" })
  });

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Відкрити зміну</DialogTitle>
        <DialogDescription>
          Вкажіть ідентифікатор ключа касира (Signer Key ID).
          Ми не зберігаємо та не вимагаємо передачі самого закритого ключа чи пароля.
        </DialogDescription>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4 mt-4">
           <div>
             <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Signer Key ID</label>
             <Input value={signerKeyId} onChange={e=>setSignerKeyId(e.target.value)} required placeholder="Ідентифікатор ключа..." data-testid="input-shift-key" />
           </div>
           <div className="flex justify-end gap-2 pt-4 border-t">
             <Button type="button" variant="outline" onClick={onClose}>Скасувати</Button>
             <Button type="submit" disabled={mut.isPending || !signerKeyId} className="bg-green-600 hover:bg-green-700 text-white">{mut.isPending ? "Відкриття..." : "Відкрити зміну"}</Button>
           </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftDialog({ isOpen, registerId, shiftId, onClose }: { isOpen: boolean, registerId?: string, shiftId?: string, onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => apiFetch(`/prro/registers/${registerId}/shifts/${shiftId}/close`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Зміну закрито, Z-звіт відправлено" });
      qc.invalidateQueries({ queryKey: ["accounting-prro-overview"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка закриття", description: e.message, variant: "destructive" })
  });

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Закрити зміну (Z-звіт)</DialogTitle>
        <DialogDescription className="sr-only">
          Підтвердження закриття активної зміни та формування Z-звіту.
        </DialogDescription>
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-amber-700 mt-4">
          <AlertTriangle className="w-5 h-5 mb-2" />
          <p className="text-sm font-medium">Ви впевнені, що хочете закрити зміну?</p>
          <p className="text-xs mt-1">Ця дія сформує Z-звіт та незворотно закриє поточну зміну для цієї каси. Продовжувати роботу можна буде лише після відкриття нової зміни.</p>
        </div>
        <div className="flex justify-end gap-2 pt-6">
           <Button type="button" variant="outline" onClick={onClose}>Скасувати</Button>
           <Button type="button" variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Закриття..." : "Закрити зміну"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverviewTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [registerForm, setRegisterForm] = useState<{ isOpen: boolean, entityId?: string, register?: any }>({ isOpen: false });
  const [shiftForm, setShiftForm] = useState<{ isOpen: boolean, registerId?: string }>({ isOpen: false });
  const [closeShiftConfirm, setCloseShiftConfirm] = useState<{ isOpen: boolean, registerId?: string, shiftId?: string }>({ isOpen: false });

  const retryMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/prro/documents/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Запит на повторну спробу надіслано" });
      qc.invalidateQueries({ queryKey: ["accounting-prro-overview"] });
      qc.invalidateQueries({ queryKey: ["accounting-prro-journal"] });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" })
  });

  const reconcileMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/prro/documents/${id}/reconcile`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Запит на звірку надіслано" });
      qc.invalidateQueries({ queryKey: ["accounting-prro-overview"] });
      qc.invalidateQueries({ queryKey: ["accounting-prro-journal"] });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" })
  });

  const xReportMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/prro/registers/${id}/reports/x`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "X-звіт створено" });
      qc.invalidateQueries({ queryKey: ["accounting-prro-overview"] });
    },
    onError: (e: any) => toast({ title: "Помилка X-звіту", description: e.message, variant: "destructive" })
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["accounting-prro-overview"],
    queryFn: () => apiFetch("/prro/accountant/overview"),
  });

  if (isLoading) return (
    <div className="space-y-6">
      {[1,2].map(i => <div key={i} className="h-48 bg-muted/20 animate-pulse rounded-xl border border-border" />)}
    </div>
  );

  if (isError) return (
    <div className="p-8 text-center border border-destructive/20 bg-destructive/5 rounded-xl text-destructive" data-testid="overview-error">
      <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-80" />
      <h3 className="font-medium mb-1">Помилка завантаження даних</h3>
      <p className="text-sm opacity-80 mb-4">Не вдалося отримати конфігурацію ПРРО.</p>
      <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Спробувати знову</Button>
    </div>
  );

  const legalEntities = data?.legalEntities || [];

  if (!legalEntities.length) return (
    <div className="p-12 text-center border border-dashed border-border rounded-xl" data-testid="overview-empty">
      <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
      <h3 className="font-medium text-lg mb-1">Немає підключених юридичних осіб</h3>
      <p className="text-sm text-muted-foreground">ПРРО не налаштовано для жодної юр. особи у вашій організації.</p>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="overview-content">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9">
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Оновити статуси
        </Button>
      </div>
      
      {legalEntities.map((ent: any) => (
        <div key={ent.id} className="border border-border rounded-xl bg-card overflow-hidden" data-testid={`card-entity-${ent.id}`}>
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-base text-foreground">{ent.name}</h3>
                <p className="text-xs text-muted-foreground">ЄДРПОУ: {ent.edrpou} {ent.type ? `• ${ent.type.toUpperCase()}` : ""}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setRegisterForm({ isOpen: true, entityId: ent.id })} data-testid={`btn-add-reg-${ent.id}`}>
              Додати касу
            </Button>
          </div>
          
          <div className="p-0 overflow-x-auto">
            {ent.registers && ent.registers.length > 0 ? (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 font-medium">Реєстратор (ПРРО)</th>
                    <th className="px-5 py-3 font-medium">Активна зміна</th>
                    <th className="px-5 py-3 font-medium">X-звіт</th>
                    <th className="px-5 py-3 font-medium">Z-звіт</th>
                    <th className="px-5 py-3 font-medium text-right">Дії</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ent.registers.map((reg: any) => (
                    <tr key={reg.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-register-${reg.id}`}>
                      <td className="px-5 py-4 align-top">
                        <div className="font-medium">{reg.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{reg.deviceId || reg.checkbox_id || reg.id}</div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {reg.activeShift ? (
                          <div>
                            <div className="flex items-center gap-1.5 text-green-600 font-medium text-xs">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                              </span>
                              Відкрита
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {fDate(reg.activeShift.openedAt || reg.activeShift.opened_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckSquare className="w-3 h-3"/> Закрита</span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <ReportAttemptStatus
                          attempt={reg.latestXReportAttempt}
                          successful={reg.lastXReport}
                          onRetry={(id) => retryMut.mutate(id)}
                          onReconcile={(id) => reconcileMut.mutate(id)}
                        />
                      </td>
                      <td className="px-5 py-4 align-top">
                        <ReportAttemptStatus
                          attempt={reg.latestZReportAttempt}
                          successful={reg.lastZReport}
                          onRetry={(id) => retryMut.mutate(id)}
                          onReconcile={(id) => reconcileMut.mutate(id)}
                        />
                      </td>
                      <td className="px-5 py-4 align-top text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" className="h-8 text-xs px-2.5" onClick={() => setRegisterForm({ isOpen: true, register: reg })} data-testid={`btn-edit-reg-${reg.id}`}>Редагувати</Button>
                          {reg.activeShift ? (
                            <>
                              <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" onClick={() => xReportMut.mutate(reg.id)} disabled={xReportMut.isPending} data-testid={`btn-x-reg-${reg.id}`}>X-звіт</Button>
                              <Button variant="destructive" size="sm" className="h-8 text-xs px-2.5" onClick={() => setCloseShiftConfirm({ isOpen: true, registerId: reg.id, shiftId: reg.activeShift.id })} data-testid={`btn-close-reg-${reg.id}`}>Z-звіт (Закрити)</Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" className="h-8 text-xs px-2.5 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:text-green-800 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20 dark:hover:bg-green-500/20" onClick={() => setShiftForm({ isOpen: true, registerId: reg.id })} data-testid={`btn-open-reg-${reg.id}`}>Відкрити зміну</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
               <div className="p-8 text-center text-muted-foreground text-sm">Немає підключених кас для цієї юридичної особи</div>
            )}
          </div>
        </div>
      ))}
      <RegisterFormDialog isOpen={registerForm.isOpen} entityId={registerForm.entityId} register={registerForm.register} onClose={() => setRegisterForm({ isOpen: false })} />
      <OpenShiftDialog isOpen={shiftForm.isOpen} registerId={shiftForm.registerId} onClose={() => setShiftForm({ isOpen: false })} />
      <CloseShiftDialog isOpen={closeShiftConfirm.isOpen} registerId={closeShiftConfirm.registerId} shiftId={closeShiftConfirm.shiftId} onClose={() => setCloseShiftConfirm({ isOpen: false })} />
    </div>
  );
}

function JournalTab({ overviewData }: { overviewData: any }) {
  const [decision, setDecision] = useState<string>("all");
  const [legalEntityId, setLegalEntityId] = useState<string>("all");
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["accounting-prro-journal", decision, legalEntityId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (decision !== "all") p.set("decision", decision);
      if (legalEntityId !== "all") p.set("legalEntityId", legalEntityId);
      p.set("limit", "100");
      return apiFetch(`/prro/accountant/journal?${p.toString()}`);
    }
  });

  const documents = data?.documents || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4 items-end bg-muted/30 p-4 rounded-xl border border-border">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Фільтр рішень</label>
          <select 
            value={decision} onChange={(e) => setDecision(e.target.value)}
            className="w-full h-10 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary outline-none"
            data-testid="filter-decision"
          >
            <option value="all">Всі документи</option>
            <option value="fiscalize">Фіскалізація (Fiscalize)</option>
            <option value="exempt">Звільнено (Exempt)</option>
            <option value="manual_review">Ручний розгляд (Manual Review)</option>
          </select>
        </div>
        
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Юридична особа</label>
          <select 
            value={legalEntityId} onChange={(e) => setLegalEntityId(e.target.value)}
            className="w-full h-10 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary outline-none"
            data-testid="filter-entity"
          >
            <option value="all">Всі юр. особи</option>
            {overviewData?.legalEntities?.map((ent: any) => (
              <option key={ent.id} value={ent.id}>{ent.name}</option>
            ))}
          </select>
        </div>
        
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-10 ml-auto bg-background">
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Оновити журнал
        </Button>
      </div>

      {isLoading ? (
        <div className="h-96 bg-muted/20 animate-pulse rounded-xl border border-border" />
      ) : isError ? (
        <div className="p-8 text-center border border-destructive/20 bg-destructive/5 rounded-xl text-destructive" data-testid="journal-error">
          Помилка завантаження журналу операцій
        </div>
      ) : documents.length === 0 ? (
        <div className="p-16 text-center border border-dashed border-border rounded-xl text-muted-foreground" data-testid="journal-empty">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <h3 className="font-medium text-lg mb-1 text-foreground">Жодного документа не знайдено</h3>
          <p className="text-sm">Змініть критерії фільтрації для пошуку</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm" data-testid="journal-content">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Створено</th>
                  <th className="px-5 py-3.5 font-medium">Документ</th>
                  <th className="px-5 py-3.5 font-medium">Суб'єкт / Каса</th>
                  <th className="px-5 py-3.5 font-medium text-right">Сума</th>
                  <th className="px-5 py-3.5 font-medium">Статус</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((doc: any) => (
                  <tr key={doc.id} className="hover:bg-muted/10 transition-colors group" data-testid={`row-doc-${doc.id}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs">{fDate(doc.createdAt)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium">{doc.documentNumber || `#${doc.id}`}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{doc.sellerName || "—"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{doc.registerName || "—"}</div>
                    </td>
                    <td className="px-5 py-4 text-right font-medium">
                      {Number(doc.totalAmount).toFixed(2)} ₴
                    </td>
                    <td className="px-5 py-4">
                      <DocumentStatusBadge doc={doc} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedDoc(doc)} className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`btn-inspect-${doc.id}`}>
                        Деталі <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedDoc && (
        <Dialog open={true} onOpenChange={(o) => !o && setSelectedDoc(null)}>
          <DialogContent className="max-w-5xl p-0 overflow-hidden bg-background h-[85vh] flex flex-col md:flex-row rounded-2xl shadow-2xl border-border gap-0" data-testid="doc-dialog">
            {/* Left pane: Details & Form */}
            <div className="flex-1 flex flex-col overflow-y-auto border-r border-border min-w-0">
              <div className="p-6 border-b border-border bg-card">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <DialogTitle className="text-xl font-display font-bold tracking-tight">
                      Документ {selectedDoc.documentNumber || `#${selectedDoc.id}`}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Деталі фіскального рішення, правова підстава та журнал аудиту документа.
                    </DialogDescription>
                    <p className="text-xs font-mono text-muted-foreground mt-1.5">ID: {selectedDoc.id}</p>
                  </div>
                  <DocumentStatusBadge doc={selectedDoc} />
                </div>
                
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm bg-muted/20 p-4 rounded-xl border border-border">
                  <div><span className="text-muted-foreground block text-[11px] uppercase tracking-wider mb-1">Сума</span><span className="font-semibold text-lg">{Number(selectedDoc.totalAmount).toFixed(2)} ₴</span></div>
                  <div><span className="text-muted-foreground block text-[11px] uppercase tracking-wider mb-1">Дата створення</span><span className="font-medium">{fDate(selectedDoc.createdAt)}</span></div>
                  <div><span className="text-muted-foreground block text-[11px] uppercase tracking-wider mb-1">Суб'єкт (Юр. особа)</span><span className="font-medium">{selectedDoc.sellerName || "—"}</span></div>
                  <div><span className="text-muted-foreground block text-[11px] uppercase tracking-wider mb-1">Каса (ПРРО)</span><span className="font-medium">{selectedDoc.registerName || "—"}</span></div>
                </div>
              </div>

              <div className="p-6 bg-background flex-1">
                {(() => {
                   const isUneditable = selectedDoc.status === "completed" || selectedDoc.status === "fiscalized" || Boolean(selectedDoc.fiscalizedAt);
                   if (isUneditable) {
                     return (
                       <div className="bg-green-500/5 rounded-2xl p-10 border border-green-500/20 text-center flex flex-col items-center mt-4">
                         <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-5 shadow-sm">
                           <Lock className="w-8 h-8 text-green-600" />
                         </div>
                         <h4 className="text-xl font-semibold mb-2 text-green-700 dark:text-green-500">Документ зафіксовано</h4>
                         <p className="text-sm text-green-600/80 dark:text-green-400/80 max-w-md mx-auto leading-relaxed">
                           Цей документ вже фіскалізовано або підтверджено. Його неможливо змінити згідно з вимогами ДПС та політикою незмінності фінансових даних.
                         </p>
                         {selectedDoc.fiscalReceiptId && (
                           <div className="mt-8 px-4 py-2.5 bg-background rounded-xl border border-green-500/30 text-sm font-mono flex items-center gap-2 shadow-sm text-green-800 dark:text-green-300">
                             <Shield className="w-4 h-4" /> Фіскальний №: {selectedDoc.fiscalReceiptId}
                           </div>
                         )}
                       </div>
                     );
                   } else {
                     return (
                       <>
                         <h3 className="text-sm font-semibold mb-4 text-foreground">Прийняття рішення щодо документа</h3>
                         <ReclassifyForm document={selectedDoc} onClose={() => setSelectedDoc(null)} />
                       </>
                     );
                   }
                })()}
              </div>
            </div>

            {/* Right pane: Audit Events */}
            <div className="w-full md:w-[340px] flex flex-col bg-muted/20 shrink-0">
              <div className="p-6 border-b border-border bg-card">
                <h3 className="font-semibold flex items-center gap-2 text-sm"><History className="w-4 h-4 text-primary"/> Журнал аудиту</h3>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <EventsTimeline documentId={selectedDoc.id} />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AccountantPrroPage() {
  const [tab, setTab] = useState<"overview" | "journal">("overview");

  // We fetch overview here to pass to JournalTab for filtering
  const { data: overviewData } = useQuery({
    queryKey: ["accounting-prro-overview"],
    queryFn: () => apiFetch("/prro/accountant/overview"),
  });

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6 animate-in fade-in duration-300">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              Облік та контроль ПРРО
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-relaxed">
              Робоче місце бухгалтера для моніторингу касових змін, перевірки нефіскалізованих винятків та прийняття рішень щодо фіскалізації. Усі дії фіксуються в журналі аудиту.
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 border-b border-border">
          <button 
            onClick={() => setTab("overview")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
            data-testid="tab-overview"
          >
            Огляд кас та змін
          </button>
          <button 
            onClick={() => setTab("journal")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "journal" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
            data-testid="tab-journal"
          >
            Журнал операцій
          </button>
        </div>

        <div className="pt-2">
          {tab === "overview" ? <OverviewTab /> : <JournalTab overviewData={overviewData} />}
        </div>
      </div>
    </AppLayout>
  );
}
