import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, ShoppingCart, MoreHorizontal } from "lucide-react";

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

const PAYMENT_TYPES: Record<string,string> = {
  cash: "Готівка", cashless: "Безготівковий", other: "Інший",
};
const TYPE_COLORS: Record<string,string> = {
  cash: "bg-green-100 text-green-800", cashless: "bg-blue-100 text-blue-800", other: "bg-purple-100 text-purple-800",
};

export default function FbConfigOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addMethodOpen, setAddMethodOpen] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [newMethod, setNewMethod] = useState({ name: "", type: "cash", commission_pct: 0 });

  const { data: sourcesData, isLoading: srcLoading } = useQuery({
    queryKey: ["fb-order-sources"], queryFn: () => apiFetch(`${API}/order-sources`),
  });
  const { data: methodsData, isLoading: mtdLoading } = useQuery({
    queryKey: ["fb-payment-methods"], queryFn: () => apiFetch(`${API}/payment-methods`),
  });

  const sources: any[] = sourcesData?.sources || [];
  const methods: any[] = methodsData?.methods || [];

  const addSource = useMutation({
    mutationFn: () => apiFetch(`${API}/order-sources`, { method: "POST", body: JSON.stringify({ name: newSource }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-order-sources"] }); setAddSourceOpen(false); setNewSource(""); toast({ title: "Джерело додано" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const toggleSource = useMutation({
    mutationFn: ({ id, val }: { id: number; val: boolean }) =>
      apiFetch(`${API}/order-sources/${id}`, { method: "PATCH", body: JSON.stringify({ show_on_pos: val }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-order-sources"] }),
  });
  const deleteSource = useMutation({
    mutationFn: (id: number) => apiFetch(`${API}/order-sources/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-order-sources"] }),
  });
  const addMethod = useMutation({
    mutationFn: () => apiFetch(`${API}/payment-methods`, { method: "POST", body: JSON.stringify(newMethod) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-payment-methods"] }); setAddMethodOpen(false); setNewMethod({ name: "", type: "cash", commission_pct: 0 }); toast({ title: "Метод оплати додано" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });
  const toggleMethod = useMutation({
    mutationFn: ({ id, val }: { id: number; val: boolean }) =>
      apiFetch(`${API}/payment-methods/${id}`, { method: "PATCH", body: JSON.stringify({ show_on_pos: val }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-payment-methods"] }),
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">Замовлення</h1>
          </div>
        </div>

        <Tabs defaultValue="sources" className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-6 bg-background flex items-center justify-between">
            <TabsList className="h-9 gap-1 bg-transparent p-0">
              {[["sources","Джерела замовлень"],["methods","Методи оплати"]].map(([v,l]) => (
                <TabsTrigger key={v} value={v}
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-3 h-9 text-sm">
                  {l}
                  <span className="ml-1.5 text-[10px] bg-muted px-1.5 rounded-full">
                    {v === "sources" ? sources.length : methods.length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex gap-2">
              <TabsList className="hidden" />
            </div>
          </div>

          {/* Sources */}
          <TabsContent value="sources" className="flex-1 overflow-auto m-0">
            <div className="p-4 border-b flex gap-3 items-center">
              <div className="relative flex-1 max-w-xs">
                <Input placeholder="Швидкий пошук" className="h-8 text-sm pl-3" />
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs">Відображати на касі ▾</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs">+ Фільтр</Button>
              <Button size="sm" className="h-8 ml-auto" onClick={() => setAddSourceOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />Додати
              </Button>
            </div>
            <div className="border-b bg-muted/20 px-4 py-2 grid grid-cols-[1fr_200px_80px] text-xs text-muted-foreground font-medium">
              <span>Назва джерела ▲</span><span>Відображати на касі</span><span></span>
            </div>
            {srcLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
              <div className="divide-y">
                {sources.map((s: any) => (
                  <div key={s.id} className="grid grid-cols-[1fr_200px_80px] px-4 py-3 items-center hover:bg-muted/10">
                    <span className="text-sm font-medium">{s.name}</span>
                    <Switch checked={s.show_on_pos} onCheckedChange={v => toggleSource.mutate({ id: s.id, val: v })} />
                    <div className="flex justify-end gap-2">
                      <button className="text-xs text-primary hover:underline">Ред.</button>
                      <button onClick={() => deleteSource.mutate(s.id)} className="text-xs text-destructive hover:underline">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Methods */}
          <TabsContent value="methods" className="flex-1 overflow-auto m-0">
            <div className="p-4 border-b flex gap-3 items-center">
              <Input placeholder="Швидкий пошук" className="h-8 text-sm max-w-xs" />
              <Button size="sm" variant="outline" className="h-8 text-xs">Тип оплати ▾</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs">+ Фільтр</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs ml-auto">Стовпці ▾</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs">Експорт</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs">Друк</Button>
              <Button size="sm" onClick={() => setAddMethodOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />Додати
              </Button>
            </div>
            <div className="border-b bg-muted/20 px-4 py-2 grid grid-cols-[2fr_1fr_1fr_1fr_80px] text-xs text-muted-foreground font-medium">
              <span>Назва методу</span><span>Тип оплати</span><span>Відсоток комісії</span><span>Відображаються на касі ▼</span><span></span>
            </div>
            {mtdLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
              <div className="divide-y">
                {methods.map((m: any) => (
                  <div key={m.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] px-4 py-3 items-center hover:bg-muted/10">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-5 rounded" style={{ background: m.color || "#ddd" }} />
                      <span className="text-sm font-medium">{m.name}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${TYPE_COLORS[m.type]||"bg-gray-100 text-gray-700"}`}>
                      {PAYMENT_TYPES[m.type] || m.type}
                    </span>
                    <span className="text-sm font-mono">{parseFloat(m.commission_pct||0).toFixed(3)}%</span>
                    <Switch checked={m.show_on_pos} onCheckedChange={v => toggleMethod.mutate({ id: m.id, val: v })} />
                    <div className="flex justify-end gap-1">
                      <button className="text-xs text-primary hover:underline">Ред.</button>
                      <button className="p-1 text-muted-foreground hover:text-foreground"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add source dialog */}
      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Додати джерело замовлення</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Назва джерела</Label>
            <Input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder="Наприклад: Онлайн" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSourceOpen(false)}>Скасувати</Button>
            <Button onClick={() => addSource.mutate()} disabled={!newSource || addSource.isPending}>
              {addSource.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add payment method dialog */}
      <Dialog open={addMethodOpen} onOpenChange={setAddMethodOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Додати метод оплати</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Назва</Label><Input className="mt-1" value={newMethod.name} onChange={e => setNewMethod(p=>({...p,name:e.target.value}))} placeholder="Готівка" /></div>
            <div><Label>Тип оплати</Label>
              <select className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={newMethod.type} onChange={e => setNewMethod(p=>({...p,type:e.target.value}))}>
                <option value="cash">Готівка</option>
                <option value="cashless">Безготівковий</option>
                <option value="other">Інший</option>
              </select>
            </div>
            <div><Label>Відсоток комісії</Label><Input className="mt-1" type="number" step="0.001" min="0"
              value={newMethod.commission_pct} onChange={e => setNewMethod(p=>({...p,commission_pct:parseFloat(e.target.value)||0}))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMethodOpen(false)}>Скасувати</Button>
            <Button onClick={() => addMethod.mutate()} disabled={!newMethod.name || addMethod.isPending}>
              {addMethod.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
