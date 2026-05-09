import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Pencil, Trash2, CheckCircle2, XCircle, AlertCircle,
  CreditCard, Shield, ChevronDown, ChevronUp, Landmark, Receipt,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  }).then(r => r.json());
}

type LegalEntity = {
  id: number; name: string; short_name?: string; full_name?: string; type: string;
  edrpou?: string; ipn?: string; vat_number?: string; is_vat_payer?: boolean;
  iban?: string; bank?: string; mfo?: string; address?: string;
  legal_address?: string; actual_address?: string;
  director?: string; accountant?: string; phone?: string; email?: string;
  liqpay_public_key?: string; liqpay_private_key?: string;
  checkbox_login?: string; checkbox_license_key?: string;
  prro_enabled?: boolean; handles_alcohol?: boolean;
  is_default?: boolean; is_active?: boolean; notes?: string;
};

const TYPE_LABELS: Record<string, string> = {
  fop: "ФОП", tov: "ТОВ", pp: "ПП", other: "Інше",
};
const TYPE_COLORS: Record<string, string> = {
  fop: "bg-blue-500/10 text-blue-600",
  tov: "bg-violet-500/10 text-violet-600",
  pp:  "bg-green-500/10 text-green-600",
  other: "bg-muted text-muted-foreground",
};

const EMPTY_FORM = {
  name: "", shortName: "", fullName: "", type: "fop",
  edrpou: "", ipn: "", vatNumber: "", isVatPayer: false,
  iban: "", bank: "", mfo: "", address: "",
  legalAddress: "", actualAddress: "",
  director: "", accountant: "", phone: "", email: "",
  liqpayPublicKey: "", liqpayPrivateKey: "",
  checkboxLogin: "", checkboxPassword: "", checkboxLicenseKey: "",
  prroEnabled: false, handlesAlcohol: false,
  isDefault: false, notes: "",
};

function EntityCard({ entity, onEdit, onDelete }: { entity: LegalEntity; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border bg-card transition-all ${entity.is_default ? "border-primary/40 shadow-sm" : ""}`}>
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${TYPE_COLORS[entity.type] || "bg-muted"}`}>
          {TYPE_LABELS[entity.type] || entity.type}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{entity.name}</span>
            {entity.is_default && <Badge variant="secondary" className="text-[10px] h-4">Основна</Badge>}
            {entity.prro_enabled && (
              <Badge className="text-[10px] h-4 bg-green-500/15 text-green-600 border-green-500/30">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />ПРРО
              </Badge>
            )}
            {entity.handles_alcohol && (
              <Badge className="text-[10px] h-4 bg-amber-500/15 text-amber-600 border-amber-500/30">Алкоголь</Badge>
            )}
            {entity.is_vat_payer && (
              <Badge className="text-[10px] h-4 bg-purple-500/15 text-purple-600 border-purple-500/30">ПДВ</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
            {entity.edrpou && <span>ЄДРПОУ: {entity.edrpou}</span>}
            {entity.ipn && <span>ІПН: {entity.ipn}</span>}
            {entity.iban && <span className="font-mono">{entity.iban.slice(0, 12)}…</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground self-center" /> : <ChevronDown className="w-4 h-4 text-muted-foreground self-center" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {entity.director && <div><span className="text-muted-foreground">Директор:</span> {entity.director}</div>}
          {entity.accountant && <div><span className="text-muted-foreground">Бухгалтер:</span> {entity.accountant}</div>}
          {entity.phone && <div><span className="text-muted-foreground">Телефон:</span> {entity.phone}</div>}
          {entity.email && <div><span className="text-muted-foreground">Email:</span> {entity.email}</div>}
          {entity.bank && <div><span className="text-muted-foreground">Банк:</span> {entity.bank}</div>}
          {entity.mfo && <div><span className="text-muted-foreground">МФО:</span> {entity.mfo}</div>}
          {entity.legal_address && <div className="col-span-2"><span className="text-muted-foreground">Юр. адреса:</span> {entity.legal_address}</div>}
          {entity.actual_address && <div className="col-span-2"><span className="text-muted-foreground">Факт. адреса:</span> {entity.actual_address}</div>}
          {entity.checkbox_login && <div><span className="text-muted-foreground">Checkbox логін:</span> {entity.checkbox_login}</div>}
          {entity.liqpay_public_key && <div><span className="text-muted-foreground">LiqPay:</span> {entity.liqpay_public_key.slice(0, 10)}…</div>}
          {entity.notes && <div className="col-span-2"><span className="text-muted-foreground">Примітка:</span> {entity.notes}</div>}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1 border-b">
      <span className="text-primary">{icon}</span>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
    </div>
  );
}

function EntityDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: LegalEntity | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [checkboxTesting, setCheckboxTesting] = useState(false);
  const [checkboxResult, setCheckboxResult] = useState<{ ok?: boolean; cashier_name?: string; shift_status?: string; error?: string } | null>(null);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name || "", shortName: editing.short_name || "", fullName: editing.full_name || "",
        type: editing.type || "fop", edrpou: editing.edrpou || "", ipn: editing.ipn || "",
        vatNumber: editing.vat_number || "", isVatPayer: editing.is_vat_payer || false,
        iban: editing.iban || "", bank: editing.bank || "", mfo: editing.mfo || "",
        address: editing.address || "", legalAddress: editing.legal_address || "",
        actualAddress: editing.actual_address || "", director: editing.director || "",
        accountant: editing.accountant || "", phone: editing.phone || "", email: editing.email || "",
        liqpayPublicKey: editing.liqpay_public_key || "", liqpayPrivateKey: "",
        checkboxLogin: editing.checkbox_login || "", checkboxPassword: "", checkboxLicenseKey: editing.checkbox_license_key || "",
        prroEnabled: editing.prro_enabled || false, handlesAlcohol: editing.handles_alcohol || false,
        isDefault: editing.is_default || false, notes: editing.notes || "",
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setCheckboxResult(null);
  }, [open, editing]);

  const save = useMutation({
    mutationFn: (body: any) => editing
      ? apiFetch(`/legal-entities/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : apiFetch("/legal-entities", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["legal-entities"] }); onOpenChange(false); toast({ title: "Збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  async function testCheckbox() {
    if (!form.checkboxLogin || !form.checkboxPassword || !form.checkboxLicenseKey) {
      toast({ title: "Заповніть логін, пароль та ключ ліцензії" }); return;
    }
    setCheckboxTesting(true); setCheckboxResult(null);
    try {
      const r = await apiFetch("/legal-entities/checkbox-test", {
        method: "POST",
        body: JSON.stringify({ login: form.checkboxLogin, password: form.checkboxPassword, licenseKey: form.checkboxLicenseKey }),
      });
      setCheckboxResult(r);
    } catch (e: any) { setCheckboxResult({ error: e.message }); }
    finally { setCheckboxTesting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editing ? "Редагувати юр. особу" : "Нова юридична особа"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">

          {/* ── Основна інформація ── */}
          <SectionHeader icon={<Building2 className="w-3.5 h-3.5" />} title="Основна інформація" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Назва *</Label>
              <Input className="mt-1" value={form.name} onChange={e => set("name", e.target.value)} placeholder="ФОП Іваненко І.І." />
            </div>
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fop">ФОП</SelectItem>
                  <SelectItem value="tov">ТОВ</SelectItem>
                  <SelectItem value="pp">ПП</SelectItem>
                  <SelectItem value="other">Інше</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{form.type === "fop" ? "ІПН (РНОКПП)" : "ЄДРПОУ"}</Label>
              <Input className="mt-1 font-mono" value={form.type === "fop" ? form.ipn : form.edrpou} onChange={e => set(form.type === "fop" ? "ipn" : "edrpou", e.target.value)} placeholder={form.type === "fop" ? "3012345678" : "12345678"} />
            </div>
            <div>
              <Label className="text-xs">Номер ПДВ</Label>
              <Input className="mt-1 font-mono" value={form.vatNumber} onChange={e => set("vatNumber", e.target.value)} disabled={!form.isVatPayer} placeholder="123456789" />
            </div>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={form.isVatPayer} onCheckedChange={v => set("isVatPayer", v)} />
              <Label className="text-xs">Платник ПДВ</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.handlesAlcohol} onCheckedChange={v => set("handlesAlcohol", v)} />
              <Label className="text-xs">Торгує алкоголем</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isDefault} onCheckedChange={v => set("isDefault", v)} />
              <Label className="text-xs">Основна</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs">Юридична адреса</Label>
            <Input className="mt-1" value={form.legalAddress} onChange={e => set("legalAddress", e.target.value)} placeholder="вул. Хрещатик, 1, м. Київ, 01001" />
          </div>
          <div>
            <Label className="text-xs">Фактична адреса</Label>
            <Input className="mt-1" value={form.actualAddress} onChange={e => set("actualAddress", e.target.value)} placeholder="Якщо відрізняється від юридичної" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Директор / ФОП</Label>
              <Input className="mt-1" value={form.director} onChange={e => set("director", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Бухгалтер</Label>
              <Input className="mt-1" value={form.accountant} onChange={e => set("accountant", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Телефон</Label>
              <Input className="mt-1" value={form.phone} onChange={e => set("phone", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input className="mt-1 lowercase" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Примітки</Label>
            <Input className="mt-1" value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* ── Банківські реквізити ── */}
          <SectionHeader icon={<Landmark className="w-3.5 h-3.5" />} title="Банківські реквізити" />
          <div>
            <Label className="text-xs">IBAN</Label>
            <Input className="mt-1 font-mono text-xs" value={form.iban} onChange={e => set("iban", e.target.value)} placeholder="UA21 3996 5100 0002 6007 2335 6600 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Банк</Label>
              <Input className="mt-1" value={form.bank} onChange={e => set("bank", e.target.value)} placeholder="АТ «ПриватБанк»" />
            </div>
            <div>
              <Label className="text-xs">МФО</Label>
              <Input className="mt-1 font-mono" value={form.mfo} onChange={e => set("mfo", e.target.value)} placeholder="305299" maxLength={6} />
            </div>
          </div>

          {/* ── ПРРО / Checkbox ── */}
          <SectionHeader icon={<Receipt className="w-3.5 h-3.5" />} title="ПРРО / Checkbox" />
          <div className="flex items-center gap-2">
            <Switch checked={form.prroEnabled} onCheckedChange={v => set("prroEnabled", v)} />
            <Label className="text-xs font-semibold">Підключити Checkbox ПРРО</Label>
          </div>
          {form.prroEnabled ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Логін (email) касира в Checkbox</Label>
                <Input className="mt-1" value={form.checkboxLogin} onChange={e => set("checkboxLogin", e.target.value)} placeholder="касир@email.com" />
              </div>
              <div>
                <Label className="text-xs">Пароль (залиште порожнім, щоб не змінювати)</Label>
                <Input className="mt-1" type="password" value={form.checkboxPassword} onChange={e => set("checkboxPassword", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Ключ ліцензії (License Key)</Label>
                <Input className="mt-1 font-mono text-xs" value={form.checkboxLicenseKey} onChange={e => set("checkboxLicenseKey", e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <Button variant="outline" size="sm" onClick={testCheckbox} disabled={checkboxTesting}>
                <Shield className="w-3.5 h-3.5 mr-1" />
                {checkboxTesting ? "Перевірка..." : "Перевірити з'єднання"}
              </Button>
              {checkboxResult && (
                <div className={`text-xs p-2.5 rounded-lg ${checkboxResult.ok ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>
                  {checkboxResult.ok ? (
                    <><CheckCircle2 className="inline w-3.5 h-3.5 mr-1" />Підключено · Касир: {checkboxResult.cashier_name} · Зміна: {checkboxResult.shift_status}</>
                  ) : (
                    <><XCircle className="inline w-3.5 h-3.5 mr-1" />{checkboxResult.error || "Помилка з'єднання"}</>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Увімкніть ПРРО щоб прив'язати Checkbox до цієї юридичної особи.
            </div>
          )}

          {/* ── LiqPay ── */}
          <SectionHeader icon={<CreditCard className="w-3.5 h-3.5" />} title="LiqPay" />
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-400">
            <CreditCard className="inline w-3.5 h-3.5 mr-1" />
            LiqPay прив'язується окремо до кожної юридичної особи. Гроші надходять безпосередньо на рахунок ФОП або ТОВ.
          </div>
          <div>
            <Label className="text-xs">Public Key</Label>
            <Input className="mt-1 font-mono text-xs" value={form.liqpayPublicKey} onChange={e => set("liqpayPublicKey", e.target.value)} placeholder="sandbox_i..." />
          </div>
          <div className="pb-2">
            <Label className="text-xs">Private Key (зашифровується)</Label>
            <Input className="mt-1 font-mono text-xs" type="password" value={form.liqpayPrivateKey} onChange={e => set("liqpayPrivateKey", e.target.value)} placeholder="sandbox_..." />
          </div>

        </div>

        <DialogFooter className="shrink-0 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Скасувати</Button>
          <Button onClick={() => save.mutate(form)} disabled={save.isPending || !form.name}>
            {save.isPending ? "Збереження..." : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FbLegalEntitiesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LegalEntity | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["legal-entities"],
    queryFn: () => apiFetch("/legal-entities"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/legal-entities/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["legal-entities"] }); toast({ title: "Юр. особу видалено" }); },
  });

  const entities: LegalEntity[] = data?.legalEntities || [];

  function openNew() { setEditing(null); setDialogOpen(true); }
  function openEdit(e: LegalEntity) { setEditing(e); setDialogOpen(true); }

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Юридичні особи F&B
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              ФОП та ТОВ, які ведуть розрахунки в ресторані. Кожна юр. особа має власний ПРРО та LiqPay.
            </p>
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" />Додати юр. особу</Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Завантаження...</div>
        ) : entities.length === 0 ? (
          <div className="border border-dashed rounded-xl p-12 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium text-sm">Немає юридичних осіб</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Додайте ФОП або ТОВ, яке веде розрахунки в ресторані.</p>
            <Button size="sm" onClick={openNew}><Plus className="w-3.5 h-3.5 mr-1" />Додати першу</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {entities.map(entity => (
              <EntityCard key={entity.id} entity={entity} onEdit={() => openEdit(entity)} onDelete={() => remove.mutate(entity.id)} />
            ))}
          </div>
        )}

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
            <p className="font-semibold">Типові схеми оподаткування</p>
            <p><strong>ФОП 2-га група:</strong> єдиний податок ~1320 грн/міс, без ПДВ, ліміт обороту 5,587 млн грн/рік.</p>
            <p><strong>ФОП 3-тя група:</strong> 5% без ПДВ або 3% з ПДВ, ліміт 7,818 млн грн/рік.</p>
            <p><strong>ТОВ (загальна):</strong> податок на прибуток 18% + ПДВ 20%, акциз на алкоголь.</p>
          </div>
        </div>
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </AppLayout>
  );
}
