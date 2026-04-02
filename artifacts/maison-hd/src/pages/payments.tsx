import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, Link, RotateCcw, AlertTriangle, Clock, CheckCircle2,
  XCircle, RefreshCw, Plus, ExternalLink, Copy, Filter, Search,
  Banknote, Calendar, Activity, Webhook, Stethoscope, ChevronDown,
  ChevronRight, Eye, Building2, User, Mail, Phone, FileText,
  BarChart3, Layers, ArrowRight, Zap, Globe, TrendingUp, Hash,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const API  = `${BASE}/api`;

function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  }).then(r => r.json());
}

// ─── Status Badges ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    pending:   { label: "Очікує",     cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    paid:      { label: "Оплачено",   cls: "bg-green-100 text-green-800 border-green-200" },
    failed:    { label: "Помилка",    cls: "bg-red-100 text-red-800 border-red-200" },
    expired:   { label: "Прострочено",cls: "bg-gray-100 text-gray-600 border-gray-200" },
    cancelled: { label: "Скасовано",  cls: "bg-gray-100 text-gray-500 border-gray-200" },
    processing:{ label: "Обробка",    cls: "bg-blue-100 text-blue-700 border-blue-200" },
    refunded:  { label: "Повернуто",  cls: "bg-purple-100 text-purple-700 border-purple-200" },
    active:    { label: "Активний",   cls: "bg-green-100 text-green-800 border-green-200" },
  };
  const c = cfg[status] || { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${c.cls}`}>{c.label}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    full:          { label: "Повна",    cls: "bg-indigo-50 text-indigo-700" },
    deposit:       { label: "Депозит",  cls: "bg-orange-50 text-orange-700" },
    final_balance: { label: "Залишок",  cls: "bg-teal-50 text-teal-700" },
    partial:       { label: "Частина",  cls: "bg-sky-50 text-sky-700" },
    installment:   { label: "Розстрочка",cls:"bg-violet-50 text-violet-700" },
  };
  const c = cfg[type] || { label: type, cls: "bg-gray-50 text-gray-600" };
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.cls}`}>{c.label}</span>;
}

function fmt(n: any) { return Number(n || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2 }); }
function fmtDate(d: any) { if (!d) return "—"; return new Date(d).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

// ─── Create Session Modal ───────────────────────────────────────────────────
function CreateSessionModal({ open, onClose, onCreated, entities, bookings }: any) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    amount: "", currency: "UAH", description: "", type: "full", chargeReason: "",
    provider: "liqpay", bookingId: "", legalEntityId: "", guestName: "", guestEmail: "",
    guestPhone: "", notes: "", expiryHours: "72", resultUrl: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast({ title: "Введіть суму > 0", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const body: any = {
        amount: parseFloat(form.amount), currency: form.currency, type: form.type,
        provider: form.provider, chargeReason: form.chargeReason || undefined,
        description: form.description || form.chargeReason || undefined,
        expiryHours: parseInt(form.expiryHours) || 72,
        guestName: form.guestName || undefined, guestEmail: form.guestEmail || undefined,
        guestPhone: form.guestPhone || undefined, notes: form.notes || undefined,
        resultUrl: form.resultUrl || undefined,
      };
      if (form.bookingId)     body.bookingId     = parseInt(form.bookingId);
      if (form.legalEntityId) body.legalEntityId = parseInt(form.legalEntityId);

      const res = await apiFetch("/payment-layer/sessions", { method: "POST", body: JSON.stringify(body) });
      if (res.error) throw new Error(res.error);
      toast({ title: res.hasKeys ? "Сесію створено. Посилання готове!" : "Сесію створено. Налаштуйте LiqPay ключі." });
      onCreated(res);
      onClose();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-indigo-500" />Нова платіжна сесія</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Сума *</Label>
              <Input type="number" placeholder="1500.00" value={form.amount} onChange={e => set("amount", e.target.value)} />
            </div>
            <div>
              <Label>Валюта</Label>
              <Select value={form.currency} onValueChange={v => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UAH">UAH — гривня</SelectItem>
                  <SelectItem value="USD">USD — долар</SelectItem>
                  <SelectItem value="EUR">EUR — євро</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Тип платежу</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Повна оплата</SelectItem>
                  <SelectItem value="deposit">Депозит</SelectItem>
                  <SelectItem value="final_balance">Залишок</SelectItem>
                  <SelectItem value="partial">Частковий</SelectItem>
                  <SelectItem value="installment">Розстрочка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Провайдер</Label>
              <Select value={form.provider} onValueChange={v => set("provider", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="liqpay">LiqPay</SelectItem>
                  <SelectItem value="fondy" disabled>Fondy (незабаром)</SelectItem>
                  <SelectItem value="wayforpay" disabled>WayForPay (незабаром)</SelectItem>
                  <SelectItem value="stripe" disabled>Stripe (незабаром)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Причина/підстава платежу</Label>
            <Input placeholder="Передоплата за бронювання №..." value={form.chargeReason} onChange={e => set("chargeReason", e.target.value)} />
          </div>

          <div>
            <Label>Опис (для гостя)</Label>
            <Input placeholder="Оплата проживання Dogoda Resort" value={form.description} onChange={e => set("description", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Юридична особа</Label>
              <Select value={form.legalEntityId} onValueChange={v => set("legalEntityId", v)}>
                <SelectTrigger><SelectValue placeholder="Обрати..." /></SelectTrigger>
                <SelectContent>
                  {entities.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name} {e.liqpay_public_key ? "✓" : "⚠️"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Бронювання (необов'язково)</Label>
              <Select value={form.bookingId} onValueChange={v => set("bookingId", v)}>
                <SelectTrigger><SelectValue placeholder="Обрати..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Без бронювання</SelectItem>
                  {bookings.slice(0, 50).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.booking_ref} — {b.guest_name || "Гість"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase">Дані гостя</p>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Ім'я</Label><Input placeholder="Іван Петренко" value={form.guestName} onChange={e => set("guestName", e.target.value)} /></div>
              <div><Label className="text-xs">Email</Label><Input placeholder="ivan@mail.com" value={form.guestEmail} onChange={e => set("guestEmail", e.target.value)} /></div>
              <div><Label className="text-xs">Телефон</Label><Input placeholder="+380..." value={form.guestPhone} onChange={e => set("guestPhone", e.target.value)} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Термін дії (год)</Label>
              <Select value={form.expiryHours} onValueChange={v => set("expiryHours", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 год</SelectItem>
                  <SelectItem value="48">48 год</SelectItem>
                  <SelectItem value="72">72 год</SelectItem>
                  <SelectItem value="168">7 днів</SelectItem>
                  <SelectItem value="720">30 днів</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>URL після оплати</Label>
              <Input placeholder="https://..." value={form.resultUrl} onChange={e => set("resultUrl", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Нотатки</Label>
            <Textarea placeholder="Внутрішні нотатки..." value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={submit} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <CreditCard className="w-4 h-4 mr-1" />}
            Створити сесію
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Session Detail Modal ───────────────────────────────────────────────────
function SessionDetailModal({ sessionId, open, onClose, onRefresh }: any) {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && sessionId) {
      apiFetch(`/payment-layer/sessions/${sessionId}`).then(setData);
    }
  }, [open, sessionId]);

  async function action(type: "sync" | "retry" | "cancel" | "mark-paid") {
    setLoading(true);
    try {
      const body = type === "mark-paid" ? JSON.stringify({ method: "liqpay" }) : "{}";
      const res = await apiFetch(`/payment-layer/sessions/${sessionId}/${type}`, { method: "POST", body });
      if (res.error) throw new Error(res.error);
      toast({ title: type === "sync" ? `Статус: ${res.providerStatus || res.status}` : "Виконано" });
      const fresh = await apiFetch(`/payment-layer/sessions/${sessionId}`);
      setData(fresh);
      onRefresh();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }

  function copyUrl() {
    const url = data?.session?.checkout_url;
    if (!url) { toast({ title: "URL не доступний" }); return; }
    navigator.clipboard.writeText(url);
    toast({ title: "URL скопійовано!" });
  }

  const session = data?.session;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-500" />
            Сесія {session?.session_ref || "…"}
          </DialogTitle>
        </DialogHeader>
        {!session ? (
          <div className="py-8 flex items-center justify-center"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={session.status} />
              <TypeBadge type={session.type} />
              <span className="text-xs text-gray-500 font-mono">{session.provider}</span>
              {session.retry_count > 0 && <span className="text-xs text-orange-600">Спроба #{session.retry_count + 1}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Сума</p>
                <p className="text-2xl font-bold text-indigo-600">{fmt(session.amount)} {session.currency}</p>
                {session.paid_amount > 0 && <p className="text-xs text-green-600">Оплачено: {fmt(session.paid_amount)} {session.currency}</p>}
              </div>
              <div className="space-y-1 text-sm">
                {session.entity_name && <p><span className="text-gray-500">Юр. особа:</span> {session.entity_name}</p>}
                {session.booking_ref && <p><span className="text-gray-500">Бронювання:</span> {session.booking_ref}</p>}
                {session.charge_reason && <p><span className="text-gray-500">Причина:</span> {session.charge_reason}</p>}
                <p><span className="text-gray-500">Діє до:</span> {fmtDate(session.expires_at)}</p>
                {session.paid_at && <p className="text-green-700"><span className="text-gray-500">Оплачено:</span> {fmtDate(session.paid_at)}</p>}
              </div>
            </div>

            {session.guest_name && (
              <div className="border rounded-lg p-3 bg-gray-50 flex gap-4 text-sm">
                {session.guest_name  && <span className="flex items-center gap-1"><User className="w-3 h-3" />{session.guest_name}</span>}
                {session.guest_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{session.guest_email}</span>}
                {session.guest_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{session.guest_phone}</span>}
              </div>
            )}

            {session.checkout_url && (
              <div className="border rounded-lg p-3 bg-indigo-50">
                <p className="text-xs font-semibold text-indigo-600 mb-2">Посилання для оплати</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono text-gray-700 truncate flex-1">{session.checkout_url}</p>
                  <Button size="sm" variant="outline" onClick={copyUrl} className="shrink-0"><Copy className="w-3 h-3 mr-1" />Копіювати</Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(session.checkout_url, "_blank")} className="shrink-0"><ExternalLink className="w-3 h-3 mr-1" />Відкрити</Button>
                </div>
              </div>
            )}

            {session.last_error && (
              <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                <p className="text-xs font-semibold text-red-600 mb-1">Помилка</p>
                <p className="text-sm text-red-700">{session.last_error}</p>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {["pending", "paid", "failed", "expired"].includes(session.status) && (
                <Button size="sm" onClick={() => action("sync")} disabled={loading} variant="outline">
                  <RefreshCw className="w-3 h-3 mr-1" />Синхронізувати
                </Button>
              )}
              {["failed", "expired"].includes(session.status) && session.retry_count < session.max_retries && (
                <Button size="sm" onClick={() => action("retry")} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
                  <RotateCcw className="w-3 h-3 mr-1" />Повторити
                </Button>
              )}
              {session.status === "pending" && (
                <>
                  <Button size="sm" onClick={() => action("mark-paid")} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle2 className="w-3 h-3 mr-1" />Позначити оплаченим
                  </Button>
                  <Button size="sm" onClick={() => action("cancel")} disabled={loading} variant="outline" className="text-red-600 border-red-200">
                    <XCircle className="w-3 h-3 mr-1" />Скасувати
                  </Button>
                </>
              )}
            </div>

            {(data?.diagnostics?.length > 0) && (
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1"><Stethoscope className="w-4 h-4 text-red-500" />Діагностика</p>
                <div className="space-y-2">
                  {data.diagnostics.map((d: any) => (
                    <div key={d.id} className="border border-red-100 rounded p-2 bg-red-50 text-xs">
                      <span className="font-medium text-red-700">[{d.category}]</span> {d.error_message}
                      {d.resolution && <p className="text-gray-600 mt-1">💡 {d.resolution}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(data?.webhooks?.length > 0) && (
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1"><Webhook className="w-4 h-4 text-blue-500" />Webhook-логи</p>
                <div className="space-y-1">
                  {data.webhooks.map((w: any) => (
                    <div key={w.id} className="flex items-center gap-3 text-xs border rounded p-2 bg-gray-50">
                      <span className={w.signature_valid ? "text-green-600" : "text-red-500"}>{w.signature_valid ? "✓" : "✗"}</span>
                      <span className="font-mono">{w.event_type}</span>
                      <span className="text-gray-500">{fmtDate(w.received_at)}</span>
                      {w.amount && <span className="font-medium">{fmt(w.amount)} {w.currency}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Schedule Modal ──────────────────────────────────────────────────
function CreateScheduleModal({ open, onClose, onCreated, entities, bookings }: any) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "deposit_balance", totalAmount: "", currency: "UAH",
    guestName: "", guestEmail: "", provider: "liqpay",
    legalEntityId: "", bookingId: "", notes: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.totalAmount) { toast({ title: "Введіть загальну суму", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const body: any = {
        name: form.name || "Графік оплати", type: form.type,
        totalAmount: parseFloat(form.totalAmount), currency: form.currency,
        provider: form.provider,
        guestName: form.guestName || undefined, guestEmail: form.guestEmail || undefined,
        notes: form.notes || undefined,
      };
      if (form.bookingId)     body.bookingId     = parseInt(form.bookingId);
      if (form.legalEntityId) body.legalEntityId = parseInt(form.legalEntityId);
      const res = await apiFetch("/payment-layer/schedules", { method: "POST", body: JSON.stringify(body) });
      if (res.error) throw new Error(res.error);
      toast({ title: "Графік створено!" });
      onCreated(res.schedule);
      onClose();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }

  const scheduleTypes = [
    { value: "deposit_balance", label: "Депозит 30% + Залишок 70%" },
    { value: "three_stage",    label: "3 рівних платежі (33/33/34%)" },
    { value: "full",           label: "Одноразова повна оплата" },
    { value: "custom",         label: "Власний графік" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-500" />Новий графік оплати</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Назва графіку</Label>
            <Input placeholder="Бронювання Лют 2026 — Апартаменти" value={form.name} onChange={e => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Тип графіку</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{scheduleTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Загальна сума</Label>
              <Input type="number" placeholder="5000.00" value={form.totalAmount} onChange={e => set("totalAmount", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Юр. особа</Label>
              <Select value={form.legalEntityId} onValueChange={v => set("legalEntityId", v)}>
                <SelectTrigger><SelectValue placeholder="Обрати..." /></SelectTrigger>
                <SelectContent>
                  {entities.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Бронювання</Label>
              <Select value={form.bookingId} onValueChange={v => set("bookingId", v)}>
                <SelectTrigger><SelectValue placeholder="Обрати..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Без бронювання</SelectItem>
                  {bookings.slice(0, 30).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.booking_ref}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ім'я гостя</Label><Input value={form.guestName} onChange={e => set("guestName", e.target.value)} /></div>
            <div><Label>Email гостя</Label><Input value={form.guestEmail} onChange={e => set("guestEmail", e.target.value)} /></div>
          </div>
          <div><Label>Нотатки</Label><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={submit} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Calendar className="w-4 h-4 mr-1" />}Створити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sessions Tab ──────────────────────────────────────────────────────────
function SessionsTab({ entities, bookings }: { entities: any[]; bookings: any[] }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId]     = useState<number | null>(null);
  const [filters, setFilters]       = useState({ status: "all", type: "all", search: "", provider: "all" });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filters.status !== "all")   params.set("status",   filters.status);
    if (filters.type   !== "all")   params.set("type",     filters.type);
    if (filters.provider !== "all") params.set("provider", filters.provider);
    if (filters.search)             params.set("search",   filters.search);
    const res = await apiFetch(`/payment-layer/sessions?${params}`);
    setSessions(res.sessions || []);
    setTotal(res.total || 0);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function setFilter(k: string, v: string) { setFilters(f => ({ ...f, [k]: v })); }

  async function syncSession(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await apiFetch(`/payment-layer/sessions/${id}/sync`, { method: "POST", body: "{}" });
    toast({ title: res.error ? res.error : `Статус: ${res.providerStatus || res.status}` });
    load();
  }

  async function copyLink(url: string, e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(url);
    toast({ title: "Посилання скопійовано!" });
  }

  const statusColors: Record<string, string> = {
    paid: "border-l-green-500", pending: "border-l-yellow-400",
    failed: "border-l-red-500", expired: "border-l-gray-400",
    cancelled: "border-l-gray-300", processing: "border-l-blue-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2 text-gray-400" />
            <Input className="pl-8 w-56 h-8 text-sm" placeholder="Пошук..." value={filters.search} onChange={e => setFilter("search", e.target.value)} />
          </div>
          <Select value={filters.status} onValueChange={v => setFilter("status", v)}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі статуси</SelectItem>
              <SelectItem value="pending">Очікує</SelectItem>
              <SelectItem value="paid">Оплачено</SelectItem>
              <SelectItem value="failed">Помилка</SelectItem>
              <SelectItem value="expired">Прострочено</SelectItem>
              <SelectItem value="cancelled">Скасовано</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.type} onValueChange={v => setFilter("type", v)}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі типи</SelectItem>
              <SelectItem value="full">Повна</SelectItem>
              <SelectItem value="deposit">Депозит</SelectItem>
              <SelectItem value="final_balance">Залишок</SelectItem>
              <SelectItem value="partial">Частковий</SelectItem>
              <SelectItem value="installment">Розстрочка</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3 h-3 mr-1" />Оновити</Button>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-1" />Нова сесія
        </Button>
      </div>

      <div className="text-xs text-gray-500">{total} сесій всього</div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-2">
          {sessions.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Немає платіжних сесій</p>
              <Button className="mt-4" size="sm" onClick={() => setShowCreate(true)}>Створити першу</Button>
            </div>
          )}
          {sessions.map(s => (
            <div key={s.id} onClick={() => setDetailId(s.id)}
              className={`border-l-4 ${statusColors[s.status] || "border-l-gray-300"} border border-gray-200 rounded-lg p-3 bg-white hover:bg-gray-50 cursor-pointer transition-colors`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <p className="font-mono text-sm font-semibold text-gray-800">{s.session_ref}</p>
                    <p className="text-xs text-gray-500">{fmtDate(s.created_at)}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    <TypeBadge type={s.type} />
                    <span className="text-xs text-gray-400 font-mono">{s.provider}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-indigo-700">{fmt(s.amount)} {s.currency}</p>
                    {s.paid_amount > 0 && s.status !== "paid" && <p className="text-xs text-green-600">Сплачено: {fmt(s.paid_amount)}</p>}
                    {s.entity_name && <p className="text-xs text-gray-400">{s.entity_name}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {s.checkout_url && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={e => copyLink(s.checkout_url, e)} title="Копіювати посилання">
                        <Copy className="w-3 h-3" />
                      </Button>
                    )}
                    {["pending", "paid", "failed"].includes(s.status) && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={e => syncSession(s.id, e)} title="Синхронізувати">
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {(s.guest_name || s.booking_ref || s.charge_reason) && (
                <div className="mt-1.5 flex gap-3 text-xs text-gray-500 flex-wrap">
                  {s.guest_name    && <span className="flex items-center gap-1"><User className="w-3 h-3" />{s.guest_name}</span>}
                  {s.booking_ref   && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{s.booking_ref}</span>}
                  {s.charge_reason && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{s.charge_reason}</span>}
                  {s.expires_at && s.status === "pending" && <span className="flex items-center gap-1 text-orange-500"><Clock className="w-3 h-3" />до {fmtDate(s.expires_at)}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateSessionModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} entities={entities} bookings={bookings} />
      {detailId && (
        <SessionDetailModal open={!!detailId} sessionId={detailId} onClose={() => setDetailId(null)} onRefresh={load} />
      )}
    </div>
  );
}

// ─── Schedules Tab ─────────────────────────────────────────────────────────
function SchedulesTab({ entities, bookings }: { entities: any[]; bookings: any[] }) {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded]     = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/payment-layer/schedules");
    setSchedules(res.schedules || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function chargeStep(schedId: number, stepId: number) {
    const res = await apiFetch(`/payment-layer/schedules/${schedId}/charge-step/${stepId}`, { method: "POST", body: "{}" });
    if (res.error) { toast({ title: res.error, variant: "destructive" }); return; }
    toast({ title: res.checkoutUrl ? "Посилання створено!" : "Сесію ініційовано (без ключів LiqPay)" });
    if (res.checkoutUrl) { navigator.clipboard.writeText(res.checkoutUrl); toast({ title: "Посилання скопійовано!" }); }
    load();
  }

  const stepTypeLabel: Record<string, string> = {
    deposit: "Депозит", final_balance: "Залишок", installment: "Розстрочка", full: "Повна оплата",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3 h-3 mr-1" />Оновити</Button>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-1" />Новий графік
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>Немає графіків оплати</p>
          <Button className="mt-4" size="sm" onClick={() => setShowCreate(true)}>Створити перший графік</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(sc => {
            const paidPct = sc.total_amount > 0 ? Math.round((sc.paid_amount / sc.total_amount) * 100) : 0;
            const isExp = expanded === sc.id;
            return (
              <div key={sc.id} className="border rounded-xl bg-white overflow-hidden">
                <div className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(isExp ? null : sc.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {isExp ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <div>
                        <p className="font-semibold text-gray-800">{sc.name}</p>
                        <p className="text-xs text-gray-500">{sc.booking_ref || "Без бронювання"} · {sc.provider}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-indigo-700">{fmt(sc.total_amount)} {sc.currency}</p>
                      <p className="text-xs text-gray-500">Сплачено {fmt(sc.paid_amount)} ({paidPct}%)</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-indigo-600 h-1.5 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0%</span><span>{paidPct}%</span><span>100%</span>
                    </div>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t bg-gray-50 p-4 space-y-2">
                    {(sc.steps || []).map((step: any) => (
                      <div key={step.id} className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{step.step_number}</div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{step.label || stepTypeLabel[step.type] || step.type}</p>
                          <p className="text-xs text-gray-500">
                            {step.due_date ? `Термін: ${new Date(step.due_date).toLocaleDateString("uk-UA")}` : step.due_days_before_checkin ? `За ${step.due_days_before_checkin} дн. до заїзду` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{fmt(step.amount)} {sc.currency}</p>
                          {step.percent && <p className="text-xs text-gray-400">{step.percent}%</p>}
                        </div>
                        <StatusBadge status={step.status} />
                        {step.status === "pending" && (
                          <Button size="sm" onClick={() => chargeStep(sc.id, step.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2">
                            <Link className="w-3 h-3 mr-1" />Нарахувати
                          </Button>
                        )}
                        {step.status === "paid" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateScheduleModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} entities={entities} bookings={bookings} />
    </div>
  );
}

// ─── Webhooks Tab ───────────────────────────────────────────────────────────
function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filter !== "all") params.set("provider", filter);
    const res = await apiFetch(`/payment-layer/webhooks?${params}`);
    setWebhooks(res.webhooks || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі провайдери</SelectItem>
              <SelectItem value="liqpay">LiqPay</SelectItem>
              <SelectItem value="fondy">Fondy</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3 h-3 mr-1" />Оновити</Button>
        </div>
        <div className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          Webhook URL: <span className="font-mono">/api/payment-layer/webhook/liqpay</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Webhook className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>Немає вхідних webhook-подій</p>
          <p className="text-xs mt-2">Налаштуйте LiqPay Server URL та проведіть тестову оплату</p>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map(w => (
            <div key={w.id} className={`border rounded-lg overflow-hidden ${w.signature_valid ? "border-green-200" : "border-red-200"}`}>
              <div className="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${w.signature_valid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {w.signature_valid ? "✓" : "✗"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{w.provider}</span>
                    <span className="text-xs text-gray-500">{w.event_type}</span>
                    <StatusBadge status={w.status} />
                    {w.session_ref && <span className="text-xs font-mono text-indigo-600">{w.session_ref}</span>}
                  </div>
                  <p className="text-xs text-gray-400">{fmtDate(w.received_at)}</p>
                </div>
                {w.amount && <p className="font-semibold text-gray-700">{fmt(w.amount)} {w.currency}</p>}
                {expanded === w.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </div>
              {expanded === w.id && w.parsed_data && (
                <div className="border-t bg-gray-50 p-3">
                  <pre className="text-xs text-gray-600 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(typeof w.parsed_data === "string" ? JSON.parse(w.parsed_data) : w.parsed_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Diagnostics Tab ────────────────────────────────────────────────────────
function DiagnosticsTab() {
  const { toast } = useToast();
  const [diags, setDiags]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("open");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filter === "open")     params.set("resolved", "false");
    if (filter === "resolved") params.set("resolved", "true");
    const res = await apiFetch(`/payment-layer/diagnostics?${params}`);
    setDiags(res.diagnostics || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: number) {
    const res = await apiFetch(`/payment-layer/diagnostics/${id}/resolve`, { method: "PATCH", body: JSON.stringify({ resolution: "Manually resolved" }) });
    if (res.error) { toast({ title: res.error, variant: "destructive" }); return; }
    toast({ title: "Помилку вирішено" });
    load();
  }

  const catColors: Record<string, string> = {
    card_limit:    "bg-orange-100 text-orange-700 border-orange-200",
    session_expired:"bg-gray-100 text-gray-600 border-gray-200",
    config_error:  "bg-red-100 text-red-700 border-red-200",
    fraud_block:   "bg-purple-100 text-purple-700 border-purple-200",
    amount_error:  "bg-yellow-100 text-yellow-700 border-yellow-200",
    unknown:       "bg-gray-100 text-gray-600 border-gray-200",
  };

  const catLabels: Record<string, string> = {
    card_limit: "Ліміт картки", session_expired: "Протерміновано",
    config_error: "Помилка конфігу", fraud_block: "Fraud-блок",
    amount_error: "Сума", unknown: "Невідома",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Відкриті</SelectItem>
            <SelectItem value="resolved">Вирішені</SelectItem>
            <SelectItem value="all">Всі</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-3 h-3 mr-1" />Оновити</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : diags.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-green-600 font-medium">Жодних відкритих помилок!</p>
          <p className="text-xs mt-1">Всі платіжні транзакції виконані успішно</p>
        </div>
      ) : (
        <div className="space-y-2">
          {diags.map(d => (
            <div key={d.id} className={`border rounded-lg p-4 ${d.resolved_at ? "opacity-60 bg-gray-50" : "bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${catColors[d.category] || catColors.unknown}`}>
                      {catLabels[d.category] || d.category}
                    </span>
                    <span className="text-xs font-mono text-gray-500">{d.provider}</span>
                    {d.session_ref && <span className="text-xs font-mono text-indigo-600">{d.session_ref}</span>}
                    {d.resolved_at && <span className="text-xs text-green-600">Вирішено {fmtDate(d.resolved_at)}</span>}
                  </div>
                  <p className="text-sm text-red-700 font-medium">{d.error_message}</p>
                  {d.resolution && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
                      💡 {d.resolution}
                    </div>
                  )}
                  {(d.amount || d.guest_name) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {d.guest_name && <span className="mr-2">{d.guest_name}</span>}
                      {d.amount && <span>{fmt(d.amount)}</span>}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{fmtDate(d.created_at)}</p>
                </div>
                {!d.resolved_at && (
                  <Button size="sm" variant="outline" onClick={() => resolve(d.id)} className="text-green-700 border-green-200 hover:bg-green-50 shrink-0">
                    <CheckCircle2 className="w-3 h-3 mr-1" />Вирішено
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

// ─── Overview Tab ───────────────────────────────────────────────────────────
function OverviewTab() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/payment-layer/overview").then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!data) return null;

  const bs = data.byStatus || {};
  const totalRevenue = Object.values(bs).reduce((acc: number, s: any) => acc + (s.paid || 0), 0);
  const totalPending = (bs.pending?.count || 0);
  const totalFailed  = (bs.failed?.count || 0) + (bs.expired?.count || 0);

  const providerIcons: Record<string, string> = { liqpay: "🏦", fondy: "🌐", wayforpay: "💳", stripe: "⚡", mono: "🟡" };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-indigo-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Надійшло (всього)</p>
            <p className="text-2xl font-bold text-indigo-600">{fmt(totalRevenue)} ₴</p>
            <p className="text-xs text-gray-400">{bs.paid?.count || 0} транзакцій</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Очікують оплати</p>
            <p className="text-2xl font-bold text-yellow-600">{totalPending}</p>
            <p className="text-xs text-gray-400">{fmt(bs.pending?.total || 0)} ₴</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Збої/Прострочення</p>
            <p className="text-2xl font-bold text-red-600">{totalFailed}</p>
            <p className="text-xs text-gray-400">{data.openDiagnostics?.length || 0} відкритих помилок</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Активні графіки</p>
            <p className="text-2xl font-bold text-green-600">{data.schedules?.active || 0}</p>
            <p className="text-xs text-gray-400">{fmt(data.schedules?.paidAmount || 0)} / {fmt(data.schedules?.totalAmount || 0)} ₴</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" />Платіжні провайдери</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(data.availableProviders || {}).map(([key, p]: [string, any]) => (
              <div key={key} className={`flex items-center justify-between p-3 rounded-lg border ${p.status === "active" ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{providerIcons[key] || "💳"}</span>
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.note}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {p.status === "active" ? "Активний" : "Незабаром"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />Статистика по статусах</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(bs).map(([status, s]: [string, any]) => (
              <div key={status} className="flex items-center gap-3">
                <StatusBadge status={status} />
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(100, (s.count / Math.max(...Object.values(bs).map((x: any) => x.count || 1))) * 100)}%` }} />
                </div>
                <span className="text-xs font-mono w-8 text-right">{s.count}</span>
                <span className="text-xs text-gray-500 w-24 text-right">{fmt(s.total)} ₴</span>
              </div>
            ))}
            {Object.keys(bs).length === 0 && <p className="text-sm text-gray-400 text-center py-4">Немає даних</p>}
          </CardContent>
        </Card>
      </div>

      {data.recentFailed?.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-red-600"><AlertTriangle className="w-4 h-4" />Останні збої</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.recentFailed.slice(0, 5).map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 text-sm border rounded p-2 bg-red-50">
                <StatusBadge status={s.status} />
                <span className="font-mono text-xs">{s.session_ref}</span>
                <span className="font-semibold text-gray-700">{fmt(s.amount)} {s.currency}</span>
                {s.guest_name && <span className="text-gray-500">{s.guest_name}</span>}
                {s.last_error && <span className="text-red-600 text-xs truncate">{s.last_error}</span>}
                <span className="text-gray-400 text-xs ml-auto">{fmtDate(s.updated_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2"><Zap className="w-4 h-4" />Webhook Integration Guide</p>
          <div className="space-y-1 text-xs text-blue-700 font-mono">
            <p>LiqPay Server URL: <strong>/api/payment-layer/webhook/liqpay</strong></p>
            <p>Налаштування: LiqPay Dashboard → Merchant → Server URL</p>
            <p>Провайдери: liqpay ✅ · fondy 🔜 · wayforpay 🔜 · stripe 🔜 · monobank 🔜</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const [tab, setTab]           = useState("sessions");
  const [entities, setEntities] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/legal-entities").then(r => setEntities(r.legalEntities || r || []));
    apiFetch("/bookings?limit=100&status=confirmed").then(r => setBookings(r.bookings || []));
  }, []);

  const TABS = [
    { id: "overview",    label: "Огляд",       icon: BarChart3 },
    { id: "sessions",    label: "Сесії",       icon: CreditCard },
    { id: "schedules",   label: "Графіки",     icon: Calendar },
    { id: "webhooks",    label: "Webhook-логи",icon: Webhook },
    { id: "diagnostics", label: "Діагностика", icon: Stethoscope },
  ];

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-space">Платіжний шар</h1>
            <p className="text-sm text-gray-500 mt-0.5">Universal Payment Abstraction · LiqPay · Мультипровайдер · Графіки оплат</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />LiqPay Active
            </span>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">Fondy · WayForPay · Stripe</span>
          </div>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex gap-0 overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active ? "border-[--mhd-primary] text-[--mhd-primary]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  <Icon className="w-4 h-4" />{t.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div>
          {tab === "overview"    && <OverviewTab />}
          {tab === "sessions"    && <SessionsTab entities={entities} bookings={bookings} />}
          {tab === "schedules"   && <SchedulesTab entities={entities} bookings={bookings} />}
          {tab === "webhooks"    && <WebhooksTab />}
          {tab === "diagnostics" && <DiagnosticsTab />}
        </div>
      </div>
    </AppLayout>
  );
}
