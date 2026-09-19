import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Pencil, Trash2, ChefHat, Wine, CreditCard, Shield,
  Phone, Mail, Key, Eye, EyeOff, Check, AlertCircle, Store,
} from "lucide-react";

const API = "/api";
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  }).then(r => r.json());
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Permission = {
  can_take_orders: boolean;
  can_send_to_kitchen: boolean;
  can_apply_discounts: boolean;
  can_close_orders: boolean;
  can_cancel_items: boolean;
  can_view_all_tables: boolean;
  can_view_reports: boolean;
  can_manage_menu: boolean;
  can_open_shift: boolean;
};

type StaffMember = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  permissions: Permission;
  outlet_ids: number[];
  is_active: boolean;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES = [
  { value: "waiter",    label: "Офіціант",  icon: Users,    color: "bg-blue-100 text-blue-700" },
  { value: "bartender", label: "Бармен",    icon: Wine,     color: "bg-purple-100 text-purple-700" },
  { value: "cashier",   label: "Касир",     icon: CreditCard, color: "bg-green-100 text-green-700" },
  { value: "manager",   label: "Менеджер",  icon: Shield,   color: "bg-orange-100 text-orange-700" },
];

const PERMISSION_LABELS: Record<keyof Permission, string> = {
  can_take_orders:     "Приймати замовлення",
  can_send_to_kitchen: "Відправляти на кухню / бар",
  can_apply_discounts: "Застосовувати знижки",
  can_close_orders:    "Закривати (оплачувати) замовлення",
  can_cancel_items:    "Скасовувати позиції з відправленого замовлення",
  can_view_all_tables: "Бачити всі столи (не лише свої)",
  can_view_reports:    "Переглядати звіти зміни",
  can_manage_menu:     "Редагувати меню",
  can_open_shift:      "Відкривати / закривати касову зміну",
};

const DEFAULT_PERMS: Record<string, Partial<Permission>> = {
  waiter:    { can_take_orders: true, can_send_to_kitchen: true, can_view_all_tables: true },
  bartender: { can_take_orders: true, can_send_to_kitchen: true },
  cashier:   { can_close_orders: true, can_apply_discounts: true, can_cancel_items: true, can_open_shift: true, can_view_all_tables: true },
  manager:   { can_take_orders: true, can_send_to_kitchen: true, can_apply_discounts: true, can_close_orders: true, can_cancel_items: true, can_view_all_tables: true, can_view_reports: true, can_manage_menu: true, can_open_shift: true },
};

function emptyPerms(): Permission {
  return { can_take_orders: false, can_send_to_kitchen: false, can_apply_discounts: false, can_close_orders: false, can_cancel_items: false, can_view_all_tables: false, can_view_reports: false, can_manage_menu: false, can_open_shift: false };
}

function getRoleCfg(role: string) { return ROLES.find(r => r.value === role) || ROLES[0]; }

// ── Staff form ─────────────────────────────────────────────────────────────────
function StaffForm({ member, outlets, onClose }: { member?: StaffMember; outlets: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!member;

  const [name, setName] = useState(member?.name || "");
  const [email, setEmail] = useState(member?.email || "");
  const [phone, setPhone] = useState(member?.phone || "");
  const [role, setRole] = useState(member?.role || "waiter");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isActive, setIsActive] = useState(member?.is_active !== false);
  const [outletIds, setOutletIds] = useState<number[]>(member?.outlet_ids || []);
  const [perms, setPerms] = useState<Permission>(() => {
    if (member?.permissions) return { ...emptyPerms(), ...member.permissions };
    return { ...emptyPerms(), ...DEFAULT_PERMS.waiter };
  });

  function handleRoleChange(r: string) {
    setRole(r);
    setPerms({ ...emptyPerms(), ...(DEFAULT_PERMS[r] || {}) });
  }

  function togglePerm(k: keyof Permission) {
    setPerms(p => ({ ...p, [k]: !p[k] }));
  }

  function toggleOutlet(id: number) {
    setOutletIds(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  const save = useMutation({
    mutationFn: () => apiFetch(`/fb/staff${isEdit ? `/${member!.id}` : ""}`, {
      method: isEdit ? "PATCH" : "POST",
      body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined, role, pin: pin || undefined, permissions: perms, outlet_ids: outletIds, is_active: isActive }),
    }),
    onSuccess: (d) => {
      if (d.error) { toast({ title: "Помилка", description: d.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["fb-staff"] });
      toast({ title: isEdit ? "Збережено" : "Додано", description: `${name} — ${getRoleCfg(role).label}` });
      onClose();
    },
  });

  const roleCfg = getRoleCfg(role);
  const RoleIcon = roleCfg.icon;

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>ПІБ *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Іван Петренко" className="mt-1" />
        </div>
        <div>
          <Label>Email</Label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="ivan@cafe.com" className="pl-9" />
          </div>
        </div>
        <div>
          <Label>Телефон</Label>
          <div className="relative mt-1">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380..." className="pl-9" />
          </div>
        </div>
      </div>

      {/* Role */}
      <div>
        <Label>Роль</Label>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {ROLES.map(r => {
            const Icon = r.icon;
            return (
              <button key={r.value} onClick={() => handleRoleChange(r.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-medium ${
                  role === r.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}>
                <Icon className="w-5 h-5" />
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* PIN */}
      <div>
        <Label className="flex items-center gap-2">
          <Key className="w-4 h-4" /> PIN-код {isEdit && "(залиште порожнім щоб не змінювати)"}
        </Label>
        <div className="relative mt-1 max-w-48">
          <Input
            type={showPin ? "text" : "password"}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={isEdit ? "••••••" : "0000–9999"}
            className="pr-10 tracking-widest font-mono"
          />
          <button type="button" onClick={() => setShowPin(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Використовується для захищених дій (знижки, скасування тощо)</p>
      </div>

      {/* Outlets assignment */}
      {outlets.length > 0 && (
        <div>
          <Label className="flex items-center gap-2"><Store className="w-4 h-4" /> Точки продажу</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {outlets.map(o => (
              <button key={o.id} onClick={() => toggleOutlet(o.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                  outletIds.includes(o.id) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"
                }`}>
                {outletIds.includes(o.id) && <Check className="w-3.5 h-3.5" />}
                {o.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Якщо не вибрано — доступ до всіх точок</p>
        </div>
      )}

      {/* Permissions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label>Дозволи</Label>
          <button onClick={() => setPerms({ ...emptyPerms(), ...(DEFAULT_PERMS[role] || {}) })}
            className="text-xs text-primary hover:underline">
            Скинути до стандартних
          </button>
        </div>
        <div className="space-y-2 border rounded-xl p-3 bg-muted/30">
          {(Object.keys(PERMISSION_LABELS) as (keyof Permission)[]).map(k => (
            <div key={k} className="flex items-center justify-between py-1">
              <span className="text-sm">{PERMISSION_LABELS[k]}</span>
              <Switch checked={!!perms[k]} onCheckedChange={() => togglePerm(k)} />
            </div>
          ))}
        </div>
      </div>

      {/* Active */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Активний</div>
          <div className="text-xs text-muted-foreground">Неактивні не можуть входити в систему</div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Скасувати</Button>
        <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>
          {save.isPending ? "Збереження..." : isEdit ? "Зберегти" : "Додати"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function FbStaff() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<null | "add" | StaffMember>(null);
  const [filterRole, setFilterRole] = useState<string>("all");

  const { data: staffData, isLoading } = useQuery({
    queryKey: ["fb-staff"],
    queryFn: () => apiFetch("/fb/staff"),
  });
  const { data: outletData } = useQuery({
    queryKey: ["fb-outlets"],
    queryFn: () => apiFetch("/fb/outlets"),
  });

  const deleteMember = useMutation({
    mutationFn: (id: number) => apiFetch(`/fb/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-staff"] }); toast({ title: "Видалено" }); },
  });

  const staff: StaffMember[] = staffData?.staff || [];
  const outlets: any[] = outletData?.outlets || [];

  const filtered = filterRole === "all" ? staff : staff.filter(s => s.role === filterRole);
  const countByRole = (r: string) => staff.filter(s => s.role === r).length;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" /> Персонал F&B
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Керування персоналом — ролі, права доступу, PIN-коди
            </p>
          </div>
          <Button onClick={() => setDialog("add")} className="gap-2">
            <Plus className="w-4 h-4" /> Додати співробітника
          </Button>
        </div>

        {/* Role stats */}
        <div className="grid grid-cols-4 gap-3">
          {ROLES.map(r => {
            const Icon = r.icon;
            return (
              <button key={r.value}
                onClick={() => setFilterRole(filterRole === r.value ? "all" : r.value)}
                className={`border rounded-xl p-4 text-left transition-all hover:border-primary/50 ${filterRole === r.value ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`p-1.5 rounded-lg ${r.color}`}><Icon className="w-4 h-4" /></span>
                  <span className="font-semibold text-2xl">{countByRole(r.value)}</span>
                </div>
                <div className="text-sm text-muted-foreground">{r.label}ів</div>
              </button>
            );
          })}
        </div>

        {/* Staff table */}
        <div className="border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Немає співробітників{filterRole !== "all" ? ` з роллю "${getRoleCfg(filterRole).label}"` : ""}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Співробітник</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Роль</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Дозволи</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Точки</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(m => {
                  const rc = getRoleCfg(m.role);
                  const Icon = rc.icon;
                  const activePerms = Object.entries(m.permissions || {}).filter(([, v]) => v).length;
                  const memberOutlets = outlets.filter(o => (m.outlet_ids || []).includes(o.id));

                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{m.name}</div>
                        {(m.email || m.phone) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {m.email || m.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${rc.color}`}>
                          <Icon className="w-3.5 h-3.5" /> {rc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{activePerms} дозволів</span>
                      </td>
                      <td className="px-4 py-3">
                        {memberOutlets.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Всі</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {memberOutlets.map(o => (
                              <Badge key={o.id} variant="outline" className="text-xs">{o.name}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={m.is_active ? "default" : "secondary"}>
                          {m.is_active ? "Активний" : "Неактивний"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => setDialog(m)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            onClick={() => { if (confirm(`Видалити ${m.name}?`)) deleteMember.mutate(m.id); }}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Info box */}
        <div className="border rounded-xl p-4 bg-blue-50 border-blue-200 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>PIN-коди</strong> використовуються в мобільному додатку офіціанта для підтвердження захищених дій (знижки, скасування, відкриття зміни). Кожен співробітник входить через власний акаунт або PIN.
          </div>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialog !== null} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === "add" ? "Додати співробітника" : `Редагувати: ${(dialog as StaffMember)?.name}`}
            </DialogTitle>
          </DialogHeader>
          {dialog !== null && (
            <StaffForm
              member={dialog === "add" ? undefined : dialog as StaffMember}
              outlets={outlets}
              onClose={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
