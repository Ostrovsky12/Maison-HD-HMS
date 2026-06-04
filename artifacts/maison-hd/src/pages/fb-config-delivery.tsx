import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Truck } from "lucide-react";

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

interface DeliveryCfg {
  min_order_amount?: number;
  free_delivery_from?: number;
  default_delivery_time?: number;
  delivery_zones?: string;
  delivery_enabled?: boolean;
  pickup_enabled?: boolean;
  dine_in_enabled?: boolean;
  require_address?: boolean;
}

export default function FbConfigDelivery() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<DeliveryCfg>({
    delivery_enabled: true, pickup_enabled: true, dine_in_enabled: false,
    min_order_amount: 0, free_delivery_from: 0, default_delivery_time: 45, require_address: true,
  });

  const { isLoading } = useQuery({
    queryKey: ["fb-config-delivery"],
    queryFn: () => apiFetch(`${API}/section/delivery`),
    onSuccess: (d) => { if (d.data && Object.keys(d.data).length > 0) setCfg(d.data); },
  });
  const set = <K extends keyof DeliveryCfg>(k: K, v: DeliveryCfg[K]) => setCfg(p => ({ ...p, [k]: v }));
  const save = useMutation({
    mutationFn: () => apiFetch(`${API}/section/delivery`, { method: "PUT", body: JSON.stringify({ data: cfg }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-config-delivery"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">Доставлення</h1>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Зберегти
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-lg space-y-6">
            <div className="space-y-3">
              <h2 className="font-semibold">Типи замовлень</h2>
              {[
                { label: "Доставлення", key: "delivery_enabled" as keyof DeliveryCfg },
                { label: "Навинiс (самовивіз)", key: "pickup_enabled" as keyof DeliveryCfg },
                { label: "У закладi", key: "dine_in_enabled" as keyof DeliveryCfg },
              ].map(({ label, key }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <Switch checked={!!(cfg[key])} onCheckedChange={v => set(key, v as any)} />
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h2 className="font-semibold">Параметри доставлення</h2>
              <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                <Label className="text-sm">Мінімальна сума замовлення, ₴</Label>
                <Input type="number" min="0" value={cfg.min_order_amount||0}
                  onChange={e => set("min_order_amount", parseFloat(e.target.value)||0)} className="max-w-[120px]" />
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                <Label className="text-sm">Безкоштовна доставка від, ₴</Label>
                <Input type="number" min="0" value={cfg.free_delivery_from||0}
                  onChange={e => set("free_delivery_from", parseFloat(e.target.value)||0)} className="max-w-[120px]" />
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                <Label className="text-sm">Стандартний час доставки, хв.</Label>
                <Input type="number" min="0" value={cfg.default_delivery_time||45}
                  onChange={e => set("default_delivery_time", parseInt(e.target.value)||45)} className="max-w-[120px]" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Обов'язкова адреса при доставленні</Label>
                <Switch checked={cfg.require_address??true} onCheckedChange={v => set("require_address", v)} />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="font-semibold">Зони доставлення</h2>
              <p className="text-xs text-muted-foreground">Опишіть зони доставлення та їх вартість</p>
              <textarea value={cfg.delivery_zones||""} onChange={e => set("delivery_zones", e.target.value)}
                placeholder="Наприклад:&#10;Зона 1 (до 3 км) — 50 ₴&#10;Зона 2 (3-7 км) — 80 ₴&#10;Зона 3 (7-15 км) — 120 ₴"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background h-28 resize-none" />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
