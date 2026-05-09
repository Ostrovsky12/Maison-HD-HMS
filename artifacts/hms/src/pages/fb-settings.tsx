import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Percent, CreditCard, Printer, Plus, Pencil, Trash2,
  Check, AlertCircle, Wifi, Usb, Network,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers || {}),
    },
  }).then(r => r.json());
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TaxGroup = {
  id: number; name: string; code: string; rate: number;
  is_excise: boolean; uktzed?: string; description?: string;
  is_default: boolean; is_active: boolean;
};

type PaymentForm = {
  id: number; name: string; code: string; type: string;
  legal_entity_id?: number; legal_entity_name?: string;
  liqpay_public_key?: string; sort_order: number; is_active: boolean;
};

type Printer = {
  id: number; name: string; type: string; driver: string;
  connection: string; ip_address?: string; port?: number;
  usb_vendor?: string; usb_product?: string; paper_width: number;
  is_default: boolean; print_copies: number; is_active: boolean;
};

type LegalEntity = { id: number; name: string; type: string; };

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: "Готівка",
  card: "Термінал (картка)",
  liqpay: "LiqPay",
  bonus: "Бонусні бали",
  account: "На рахунок (безготівково)",
  voucher: "Ваучер / Сертифікат",
};

const PRINTER_TYPE_LABELS: Record<string, string> = {
  receipt: "Чековий (ПРРО)",
  kitchen: "Кухонний",
  bar: "Барний",
  label: "Етикетки",
};

const DRIVER_LABELS: Record<string, string> = {
  escpos: "ESC/POS (стандарт)",
  star: "Star (TSP / mPOP)",
  epson: "Epson TM",
  sunmi: "Sunmi",
  pdf: "PDF (віртуальний)",
};

const CONNECTION_LABELS: Record<string, string> = {
  network: "Мережа (TCP/IP)",
  usb: "USB",
  bluetooth: "Bluetooth",
  serial: "Serial (COM)",
};

const DEFAULT_TAX_GROUPS = [
  { name: "ПДВ 20%", code: "A", rate: 20, isExcise: false, description: "Загальна ставка ПДВ" },
  { name: "ПДВ 7%", code: "B", rate: 7, isExcise: false, description: "Послуги готелів та ін." },
  { name: "ПДВ 0%", code: "C", rate: 0, isExcise: false, description: "Експорт / нульова ставка" },
  { name: "Без ПДВ", code: "D", rate: 0, isExcise: false, description: "Звільнені від ПДВ" },
  { name: "Акциз (алкоголь)", code: "E", rate: 0, isExcise: true, description: "Алкогольні напої, УКЗЕД обов'язковий" },
];

const DEFAULT_PAYMENT_FORMS = [
  { name: "Готівка", code: "CASH", type: "cash", sortOrder: 0 },
  { name: "Термінал", code: "CARD", type: "card", sortOrder: 1 },
  { name: "LiqPay", code: "LIQPAY", type: "liqpay", sortOrder: 2 },
];

// ── Tax Groups Tab ─────────────────────────────────────────────────────────────

function TaxGroupsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxGroup | null>(null);
  const [form, setForm] = useState({ name: "", code: "", rate: "20", isExcise: false, uktzed: "", description: "", isDefault: false });

  const { data, isLoading } = useQuery({
    queryKey: ["fb-tax-groups"],
    queryFn: () => apiFetch("/fb/settings/tax-groups"),
  });

  const save = useMutation({
    mutationFn: (body: any) => editing
      ? apiFetch(`/fb/settings/tax-groups/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : apiFetch("/fb/settings/tax-groups", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tax-groups"] }); setOpen(false); toast({ title: "Збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/fb/settings/tax-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-tax-groups"] }),
  });

  const seedDefaults = useMutation({
    mutationFn: async () => {
      for (const g of DEFAULT_TAX_GROUPS) {
        await apiFetch("/fb/settings/tax-groups", { method: "POST", body: JSON.stringify(g) });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tax-groups"] }); toast({ title: "Стандартні групи ПДВ додано" }); },
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", code: "", rate: "20", isExcise: false, uktzed: "", description: "", isDefault: false });
    setOpen(true);
  }

  function openEdit(tg: TaxGroup) {
    setEditing(tg);
    setForm({ name: tg.name, code: tg.code, rate: String(tg.rate), isExcise: tg.is_excise, uktzed: tg.uktzed || "", description: tg.description || "", isDefault: tg.is_default });
    setOpen(true);
  }

  const groups: TaxGroup[] = data?.taxGroups || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Податкові групи ПДВ</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Ставки згідно ПКУ України. Прив'язуються до позицій меню.</p>
        </div>
        <div className="flex gap-2">
          {groups.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
              Заповнити стандартні
            </Button>
          )}
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Додати</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Завантаження...</div>
      ) : groups.length === 0 ? (
        <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm">
          <Percent className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Немає податкових груп. Натисніть «Заповнити стандартні» або «Додати».
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(tg => (
            <div key={tg.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">{tg.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{tg.name}</span>
                  {tg.is_default && <Badge variant="secondary" className="text-[10px] h-4">За замовчуванням</Badge>}
                  {tg.is_excise && <Badge variant="destructive" className="text-[10px] h-4">Акциз</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {tg.rate > 0 ? `${tg.rate}%` : "0% / звільнені"}
                  {tg.uktzed && <> · УКЗЕД: {tg.uktzed}</>}
                  {tg.description && <> · {tg.description}</>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(tg)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove.mutate(tg.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Редагувати групу ПДВ" : "Нова група ПДВ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Назва *</Label>
                <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ПДВ 20%" />
              </div>
              <div>
                <Label className="text-xs">Код (A–Z) *</Label>
                <Input className="mt-1" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="A" maxLength={5} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Ставка (%)</Label>
              <Input className="mt-1" type="number" min={0} max={100} step={0.01} value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">УКЗЕД (для підакцизних)</Label>
              <Input className="mt-1" value={form.uktzed} onChange={e => setForm(f => ({ ...f, uktzed: e.target.value }))} placeholder="2204" />
            </div>
            <div>
              <Label className="text-xs">Примітка</Label>
              <Input className="mt-1" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.isExcise} onCheckedChange={v => setForm(f => ({ ...f, isExcise: v }))} />
                <Label className="text-xs">Підакцизний товар</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.isDefault} onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} />
                <Label className="text-xs">За замовчуванням</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
            <Button onClick={() => save.mutate({ ...form, rate: Number(form.rate) })} disabled={save.isPending || !form.name || !form.code}>
              {save.isPending ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Payment Forms Tab ─────────────────────────────────────────────────────────

function PaymentFormsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentForm | null>(null);
  const [form, setForm] = useState({ name: "", code: "", type: "cash", legalEntityId: "", liqpayPublicKey: "", liqpayPrivateKey: "", sortOrder: "0" });

  const { data } = useQuery({ queryKey: ["fb-payment-forms"], queryFn: () => apiFetch("/fb/settings/payment-forms") });
  const { data: leData } = useQuery({ queryKey: ["legal-entities"], queryFn: () => apiFetch("/legal-entities") });

  const save = useMutation({
    mutationFn: (body: any) => editing
      ? apiFetch(`/fb/settings/payment-forms/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : apiFetch("/fb/settings/payment-forms", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-payment-forms"] }); setOpen(false); toast({ title: "Збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/fb/settings/payment-forms/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-payment-forms"] }),
  });

  const seedDefaults = useMutation({
    mutationFn: async () => {
      for (const pf of DEFAULT_PAYMENT_FORMS) {
        await apiFetch("/fb/settings/payment-forms", { method: "POST", body: JSON.stringify(pf) });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-payment-forms"] }); toast({ title: "Стандартні форми оплати додано" }); },
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", code: "", type: "cash", legalEntityId: "", liqpayPublicKey: "", liqpayPrivateKey: "", sortOrder: String((data?.paymentForms?.length || 0)) });
    setOpen(true);
  }

  function openEdit(pf: PaymentForm) {
    setEditing(pf);
    setForm({ name: pf.name, code: pf.code, type: pf.type, legalEntityId: pf.legal_entity_id ? String(pf.legal_entity_id) : "", liqpayPublicKey: pf.liqpay_public_key || "", liqpayPrivateKey: "", sortOrder: String(pf.sort_order) });
    setOpen(true);
  }

  const forms: PaymentForm[] = data?.paymentForms || [];
  const legalEntities: LegalEntity[] = leData?.legalEntities || [];

  const typeIcon: Record<string, string> = { cash: "💵", card: "💳", liqpay: "📱", bonus: "🎁", account: "🏦", voucher: "🎫" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Форми оплати</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Які способи оплати доступні на касі. LiqPay прив'язується до юр. особи.</p>
        </div>
        <div className="flex gap-2">
          {forms.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
              Заповнити стандартні
            </Button>
          )}
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Додати</Button>
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm">
          <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Немає форм оплати. Натисніть «Заповнити стандартні» або «Додати».
        </div>
      ) : (
        <div className="space-y-2">
          {forms.map(pf => (
            <div key={pf.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-lg">
                {typeIcon[pf.type] || "💰"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{pf.name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 font-mono">{pf.code}</Badge>
                  <Badge variant="secondary" className="text-[10px] h-4">{PAYMENT_TYPE_LABELS[pf.type] || pf.type}</Badge>
                </div>
                {pf.legal_entity_name && (
                  <div className="text-xs text-muted-foreground mt-0.5">Юр. особа: {pf.legal_entity_name}</div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(pf)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove.mutate(pf.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Редагувати форму оплати" : "Нова форма оплати"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Назва *</Label>
                <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Готівка" />
              </div>
              <div>
                <Label className="text-xs">Код *</Label>
                <Input className="mt-1" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="CASH" maxLength={20} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Тип оплати</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.type === "liqpay" && (
              <>
                <div>
                  <Label className="text-xs">Юридична особа</Label>
                  <Select value={form.legalEntityId} onValueChange={v => setForm(f => ({ ...f, legalEntityId: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Обрати юр. особу" /></SelectTrigger>
                    <SelectContent>
                      {legalEntities.map(le => (
                        <SelectItem key={le.id} value={String(le.id)}>{le.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">LiqPay Public Key</Label>
                  <Input className="mt-1 font-mono text-xs" value={form.liqpayPublicKey} onChange={e => setForm(f => ({ ...f, liqpayPublicKey: e.target.value }))} placeholder="sandbox_i..." />
                </div>
                <div>
                  <Label className="text-xs">LiqPay Private Key</Label>
                  <Input className="mt-1 font-mono text-xs" type="password" value={form.liqpayPrivateKey} onChange={e => setForm(f => ({ ...f, liqpayPrivateKey: e.target.value }))} placeholder="sandbox_..." />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Порядок відображення</Label>
              <Input className="mt-1" type="number" min={0} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
            <Button onClick={() => save.mutate({ ...form, legalEntityId: form.legalEntityId ? Number(form.legalEntityId) : null, sortOrder: Number(form.sortOrder) })} disabled={save.isPending || !form.name || !form.code}>
              {save.isPending ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Printers Tab ──────────────────────────────────────────────────────────────

function PrintersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Printer | null>(null);
  const [form, setForm] = useState({
    name: "", type: "receipt", driver: "escpos", connection: "network",
    ipAddress: "", port: "9100", usbVendor: "", usbProduct: "",
    paperWidth: "80", isDefault: false, printCopies: "1",
  });

  const { data } = useQuery({ queryKey: ["fb-printers"], queryFn: () => apiFetch("/fb/settings/printers") });

  const save = useMutation({
    mutationFn: (body: any) => editing
      ? apiFetch(`/fb/settings/printers/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : apiFetch("/fb/settings/printers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-printers"] }); setOpen(false); toast({ title: "Збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/fb/settings/printers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-printers"] }),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", type: "receipt", driver: "escpos", connection: "network", ipAddress: "", port: "9100", usbVendor: "", usbProduct: "", paperWidth: "80", isDefault: false, printCopies: "1" });
    setOpen(true);
  }

  function openEdit(p: Printer) {
    setEditing(p);
    setForm({ name: p.name, type: p.type, driver: p.driver, connection: p.connection, ipAddress: p.ip_address || "", port: String(p.port || 9100), usbVendor: p.usb_vendor || "", usbProduct: p.usb_product || "", paperWidth: String(p.paper_width), isDefault: p.is_default, printCopies: String(p.print_copies) });
    setOpen(true);
  }

  const printers: Printer[] = data?.printers || [];

  const connIcon: Record<string, React.ReactNode> = {
    network: <Network className="w-3.5 h-3.5" />,
    usb: <Usb className="w-3.5 h-3.5" />,
    bluetooth: <Wifi className="w-3.5 h-3.5" />,
    serial: <Network className="w-3.5 h-3.5" />,
  };

  const typeColor: Record<string, string> = {
    receipt: "bg-violet-500/10 text-violet-500",
    kitchen: "bg-orange-500/10 text-orange-500",
    bar: "bg-blue-500/10 text-blue-500",
    label: "bg-green-500/10 text-green-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Принтери</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Чековий (ПРРО), кухонний та барний принтери. ESC/POS, Star, Epson.</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Додати</Button>
      </div>

      {printers.length === 0 ? (
        <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm">
          <Printer className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Принтерів немає. Додайте чековий принтер для друку фіскальних чеків.
        </div>
      ) : (
        <div className="space-y-2">
          {printers.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${typeColor[p.type] || "bg-muted"}`}>
                <Printer className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.is_default && <Badge variant="secondary" className="text-[10px] h-4">Основний</Badge>}
                  <Badge variant="outline" className="text-[10px] h-4">{PRINTER_TYPE_LABELS[p.type] || p.type}</Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  {connIcon[p.connection]}
                  <span>{CONNECTION_LABELS[p.connection] || p.connection}</span>
                  {p.ip_address && <span>· {p.ip_address}:{p.port}</span>}
                  <span>· {DRIVER_LABELS[p.driver] || p.driver}</span>
                  <span>· {p.paper_width}мм</span>
                  {p.print_copies > 1 && <span>· {p.print_copies} копії</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove.mutate(p.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Редагувати принтер" : "Новий принтер"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label className="text-xs">Назва *</Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Чековий принтер 1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Тип принтера</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRINTER_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Драйвер</Label>
                <Select value={form.driver} onValueChange={v => setForm(f => ({ ...f, driver: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DRIVER_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">З'єднання</Label>
              <Select value={form.connection} onValueChange={v => setForm(f => ({ ...f, connection: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONNECTION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.connection === "network" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">IP-адреса</Label>
                  <Input className="mt-1 font-mono text-xs" value={form.ipAddress} onChange={e => setForm(f => ({ ...f, ipAddress: e.target.value }))} placeholder="192.168.1.100" />
                </div>
                <div>
                  <Label className="text-xs">Порт</Label>
                  <Input className="mt-1 font-mono text-xs" type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
                </div>
              </div>
            )}
            {form.connection === "usb" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">USB Vendor ID</Label>
                  <Input className="mt-1 font-mono text-xs" value={form.usbVendor} onChange={e => setForm(f => ({ ...f, usbVendor: e.target.value }))} placeholder="0x04b8" />
                </div>
                <div>
                  <Label className="text-xs">USB Product ID</Label>
                  <Input className="mt-1 font-mono text-xs" value={form.usbProduct} onChange={e => setForm(f => ({ ...f, usbProduct: e.target.value }))} placeholder="0x0202" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Ширина стрічки (мм)</Label>
                <Select value={form.paperWidth} onValueChange={v => setForm(f => ({ ...f, paperWidth: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58 мм</SelectItem>
                    <SelectItem value="80">80 мм</SelectItem>
                    <SelectItem value="112">112 мм</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Кількість копій</Label>
                <Input className="mt-1" type="number" min={1} max={5} value={form.printCopies} onChange={e => setForm(f => ({ ...f, printCopies: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isDefault} onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} />
              <Label className="text-xs">Основний принтер цього типу</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
            <Button
              onClick={() => save.mutate({ ...form, port: Number(form.port), paperWidth: Number(form.paperWidth), printCopies: Number(form.printCopies) })}
              disabled={save.isPending || !form.name}
            >
              {save.isPending ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FbSettingsPage() {
  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            F&B — Базові налаштування
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Налаштуйте податкові групи, форми оплати та принтери перед відкриттям зміни.
          </p>
        </div>

        <Tabs defaultValue="tax">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tax" className="gap-1.5 text-xs">
              <Percent className="w-3.5 h-3.5" />Групи ПДВ
            </TabsTrigger>
            <TabsTrigger value="payment" className="gap-1.5 text-xs">
              <CreditCard className="w-3.5 h-3.5" />Форми оплати
            </TabsTrigger>
            <TabsTrigger value="printers" className="gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" />Принтери
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tax" className="mt-4">
            <TaxGroupsTab />
          </TabsContent>
          <TabsContent value="payment" className="mt-4">
            <PaymentFormsTab />
          </TabsContent>
          <TabsContent value="printers" className="mt-4">
            <PrintersTab />
          </TabsContent>
        </Tabs>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
            <p className="font-semibold">Вимоги ДПС України</p>
            <p>З 01.01.2022 РРО/ПРРО обов'язковий для всіх готівкових розрахунків та e-платежів. Алкоголь і тютюн потребують акцизного коду УКЗЕД. ФОП на 2-й групі не є платником ПДВ.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
