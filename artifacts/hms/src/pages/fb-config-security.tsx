import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, ShieldAlert, Eye, EyeOff } from "lucide-react";

const API = "/api/fb/config";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers||{}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const NEVER_ALWAYS = ["Ніколи","Завжди","У випадках..."];
const PIN_ACTIONS = [
  "У разі видалення товару",
  "У разі додавання знижки",
  "У разі скасування акції",
  "У разі формування звіту про продажі",
  "У разі проведення фіскальної транзакції",
  "У разі зняття Х- та Z-звітів",
  "У разі розділення суми чека між гостями",
  "У разі закриття чека",
  "У разі додавання клієнта на касі",
  "У разі перегляду архіву чеків",
  "У разі додавання постачання на касі",
  "При перегляді пристроїв",
];
const KITCHEN_OPTS = ["Ніколи","Через 5 хвилин","Через 10 хвилин","Через 15 хвилин","Через 20 хвилин"];
const DISPATCH_OPTS = ["Завжди","Тільки зі своєї каси","Ніколи"];

interface SecurityCfg {
  admin_password?: string;
  no_reprint?: boolean;
  print_two_receipts?: boolean;
  require_mag_card?: boolean;
  block_shift_close?: boolean;
  sms_bonus_cancel?: boolean;
  auto_kitchen_tickets?: string;
  dispatch_from_any?: string;
  pin_actions?: Record<string,string>;
}

export default function FbConfigSecurity() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showPwd, setShowPwd] = useState(false);
  const [cfg, setCfg] = useState<SecurityCfg>({
    admin_password: "", no_reprint: false, print_two_receipts: false,
    require_mag_card: false, block_shift_close: false, sms_bonus_cancel: false,
    auto_kitchen_tickets: "Ніколи", dispatch_from_any: "Завжди",
    pin_actions: Object.fromEntries(PIN_ACTIONS.map(a => [a, "Ніколи"])),
  });

  const { isLoading } = useQuery({
    queryKey: ["fb-config-security"],
    queryFn: () => apiFetch(`${API}/section/security`),
    onSuccess: (d) => {
      if (d.data && Object.keys(d.data).length > 0) setCfg(prev => ({ ...prev, ...d.data }));
    },
  });

  const set = <K extends keyof SecurityCfg>(k: K, v: SecurityCfg[K]) => setCfg(p => ({ ...p, [k]: v }));
  const setPinAction = (action: string, val: string) => setCfg(p => ({
    ...p, pin_actions: { ...(p.pin_actions||{}), [action]: val },
  }));

  const save = useMutation({
    mutationFn: () => apiFetch(`${API}/section/security`, { method: "PUT", body: JSON.stringify({ data: cfg }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-config-security"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function Check({ id, label, desc, val, onChange }: { id: string; label: string; desc?: string; val: boolean; onChange: (v: boolean) => void }) {
    return (
      <label className="flex items-start gap-2 cursor-pointer py-1.5">
        <input type="checkbox" id={id} checked={val} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 rounded" />
        <span>
          <span className="text-sm">{label}</span>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </span>
      </label>
    );
  }
  function Sel({ val, opts, onChange }: { val: string; opts: string[]; onChange: (v: string) => void }) {
    return (
      <select value={val} onChange={e => onChange(e.target.value)}
        className="border rounded-md px-3 py-2 text-sm bg-background w-full max-w-xs">
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    );
  }

  if (isLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">Налаштування безпеки</h1>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Зберегти
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-xl space-y-6">
            {/* Admin password */}
            <div className="space-y-2">
              <Label>Пароль адміністратора</Label>
              <div className="relative max-w-xs">
                <Input type={showPwd ? "text" : "password"}
                  value={cfg.admin_password||""} onChange={e => set("admin_password", e.target.value)}
                  placeholder="••••••••" className="pr-10" />
                <button type="button" onClick={() => setShowPwd(p=>!p)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Poster використовує пароль адміністратора для підтвердження небезпечних дій</p>
            </div>

            <div className="space-y-1">
              <Check id="nr" label="Заборона друку пречека"
                desc="Прихований кнопку друку попереднього чека в застосунку"
                val={cfg.no_reprint??false} onChange={v => set("no_reprint", v)} />
              <Check id="tr" label="Друкувати два чеки під час закриття замовлення"
                val={cfg.print_two_receipts??false} onChange={v => set("print_two_receipts", v)} />
              <Check id="mc" label="Додавати клієнта до замовлення тільки після зчитування магнітної картки"
                val={cfg.require_mag_card??false} onChange={v => set("require_mag_card", v)} />
              <Check id="bc" label="Заборонити закривати касову зміну, якщо на касі є відкриті чеки"
                val={cfg.block_shift_close??false} onChange={v => set("block_shift_close", v)} />
              <Check id="sms" label="Надсилати SMS для підтвердження списання бонусів"
                desc="SMS оплачуються окремо, 1.26 грн. за одне повідомлення"
                val={cfg.sms_bonus_cancel??false} onChange={v => set("sms_bonus_cancel", v)} />
            </div>

            <div>
              <h2 className="font-semibold mb-3">Бігунки на кухню</h2>
              <div className="grid grid-cols-[220px_1fr] gap-4 items-center mb-3">
                <Label className="text-sm">Автоматично надсилати бігунки з неприготованими замовленнями</Label>
                <Sel val={cfg.auto_kitchen_tickets||"Ніколи"} opts={KITCHEN_OPTS} onChange={v => set("auto_kitchen_tickets", v)} />
              </div>
              <div className="grid grid-cols-[220px_1fr] gap-4 items-center">
                <Label className="text-sm">Дозволити відправку бігунків з будь-якої каси</Label>
                <Sel val={cfg.dispatch_from_any||"Завжди"} opts={DISPATCH_OPTS} onChange={v => set("dispatch_from_any", v)} />
              </div>
            </div>

            <div>
              <h2 className="font-semibold mb-3">Запитувати пароль адміністратора</h2>
              <div className="space-y-2">
                {PIN_ACTIONS.map(action => (
                  <div key={action} className="grid grid-cols-[1fr_160px] gap-4 items-center">
                    <Label className="text-sm text-muted-foreground">{action}</Label>
                    <Sel val={(cfg.pin_actions||{})[action]||"Ніколи"} opts={NEVER_ALWAYS}
                      onChange={v => setPinAction(action, v)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
