import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Receipt } from "lucide-react";

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

interface ReceiptCfg {
  auto_print?: boolean;
  print_number?: boolean;
  print_comment?: boolean;
  print_client_contacts?: boolean;
  print_tax_subtotals?: boolean;
  print_forecast?: boolean;
  print_wifi?: boolean;
  print_address?: boolean;
  receipt_language?: string;
  print_name_from?: string;
  wifi_name?: string;
  wifi_password?: string;
}

const LANGS = ["Українська","English","Polski","Deutsch"];
const PRINT_NAME_OPTS = ["Назва закладу","Назва компанії"];

export default function FbConfigReceipt() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<ReceiptCfg>({
    auto_print: false, print_number: true, print_comment: false, print_client_contacts: true,
    print_tax_subtotals: false, print_forecast: false, print_wifi: false, print_address: false,
    receipt_language: "Українська", print_name_from: "Назва закладу",
  });

  const { isLoading } = useQuery({
    queryKey: ["fb-config-receipt"],
    queryFn: () => apiFetch(`${API}/section/receipt`),
    onSuccess: (d) => { if (d.data && Object.keys(d.data).length > 0) setCfg(d.data); },
  });
  const set = <K extends keyof ReceiptCfg>(k: K, v: ReceiptCfg[K]) => setCfg(p => ({ ...p, [k]: v }));
  const save = useMutation({
    mutationFn: () => apiFetch(`${API}/section/receipt`, { method: "PUT", body: JSON.stringify({ data: cfg }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-config-receipt"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function Check({ id, label, desc, val, onChange, children }: {
    id: string; label: string; desc?: string; val: boolean; onChange: (v: boolean) => void; children?: React.ReactNode;
  }) {
    return (
      <div>
        <label className="flex items-start gap-2 cursor-pointer py-1.5">
          <input type="checkbox" id={id} checked={val} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 rounded" />
          <span>
            <span className="text-sm">{label}</span>
            {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
          </span>
        </label>
        {val && children && <div className="ml-6 mt-1">{children}</div>}
      </div>
    );
  }
  function Sel({ label, val, opts, onChange, hint }: { label: string; val: string; opts: string[]; onChange: (v: string) => void; hint?: string }) {
    return (
      <div className="grid grid-cols-[200px_1fr] gap-4 items-start py-2">
        <Label className="pt-2 text-sm">{label}</Label>
        <div>
          <select value={val} onChange={e => onChange(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background w-full max-w-xs">
            {opts.map(o => <option key={o}>{o}</option>)}
          </select>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
      </div>
    );
  }

  if (isLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">Налаштування чека</h1>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Зберегти
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-lg space-y-1">
            <Check id="ap" label="Автоматично друкувати чек під час закриття замовлення"
              val={cfg.auto_print??false} onChange={v => set("auto_print", v)} />
            <Check id="pn" label="Друкувати номер чека"
              val={cfg.print_number??true} onChange={v => set("print_number", v)} />
            <Check id="pc" label="Друкувати коментар до чека"
              desc="З ввімкненням налаштування на чеку буде друкуватися коментар, який залишають ваші працівники"
              val={cfg.print_comment??false} onChange={v => set("print_comment", v)} />
            <Check id="cc" label="Додавати номер телефону та адресу клієнта до чека"
              desc="Телефон та адреса з картки клієнта друкуються на чеку. Зручно для роботи кур'єрів."
              val={cfg.print_client_contacts??true} onChange={v => set("print_client_contacts", v)} />
            <Check id="ts" label="Друкувати підсумкові суми за податками"
              desc="З ввімкненням налаштування підсумкову суму чека буде розділено за податками. Наприклад, «Бар» та «Кухня»."
              val={cfg.print_tax_subtotals??false} onChange={v => set("print_tax_subtotals", v)} />
            <Check id="pf" label="Друкувати передбачення"
              val={cfg.print_forecast??false} onChange={v => set("print_forecast", v)} />
            <Check id="wf" label="Друкувати Wi-Fi"
              val={cfg.print_wifi??false} onChange={v => set("print_wifi", v)}>
              <div className="space-y-2">
                <input className="border rounded px-3 py-1.5 text-sm w-full max-w-xs" placeholder="Назва мережі Wi-Fi"
                  value={cfg.wifi_name||""} onChange={e => set("wifi_name", e.target.value)} />
                <input className="border rounded px-3 py-1.5 text-sm w-full max-w-xs" placeholder="Пароль Wi-Fi" type="password"
                  value={cfg.wifi_password||""} onChange={e => set("wifi_password", e.target.value)} />
              </div>
            </Check>
            <Check id="pa" label="Друкувати адресу"
              val={cfg.print_address??false} onChange={v => set("print_address", v)} />

            <div className="pt-4">
              <Sel label="Мова чека" val={cfg.receipt_language||"Українська"} opts={LANGS}
                onChange={v => set("receipt_language", v)} />
              <Sel label="Друкувати на чеку"
                val={cfg.print_name_from||"Назва закладу"} opts={PRINT_NAME_OPTS}
                hint="Друкуйте у шапці чека «Назву компанії» з вкладки Налаштування → Загальні, якщо усі заклади в акаунті називаються однаково. Якщо назви різні — «Назву закладу» з Доступ → Заклади."
                onChange={v => set("print_name_from", v)} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
