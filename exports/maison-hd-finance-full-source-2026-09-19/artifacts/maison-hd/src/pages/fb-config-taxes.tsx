import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Percent, MoreHorizontal } from "lucide-react";

const API = "/api";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers||{}) },
  });
  return r.json();
}

const TAX_PROGRAMS: Record<string,string> = {
  A: "Програма «А»", B: "Програма «Б»", C: "Програма «В»", D: "Програма «Г»",
  E: "Програма «Д»", F: "Програма «Є»", G: "Програма «Ж»",
};

const DEFAULT_TAXES = [
  { id: -1, name: "ПДВ 20% + Акциз 5%", rate: 26, is_excise: true, fiscal_program: "C", type: "Додана вартість", is_fiscal: true },
  { id: -2, name: "ПДВ 20%", rate: 20, is_excise: false, fiscal_program: "B", type: "Додана вартість", is_fiscal: true },
  { id: -3, name: "ПДВ 0% + Акциз 5%", rate: 5, is_excise: true, fiscal_program: "A", type: "Додана вартість", is_fiscal: true },
  { id: -4, name: "ПДВ 0%", rate: 0, is_excise: false, fiscal_program: "D", type: "Додана вартість", is_fiscal: true },
  { id: -5, name: "Без податку", rate: 0, is_excise: false, fiscal_program: null, type: "Податок з обігу", is_fiscal: false },
  { id: -6, name: "Без ПДВ + Акциз 5%", rate: 5, is_excise: true, fiscal_program: "G", type: "Додана вартість", is_fiscal: true },
  { id: -7, name: "Без ПДВ", rate: 0, is_excise: false, fiscal_program: "F", type: "Додана вартість", is_fiscal: true },
];

export default function FbConfigTaxes() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newTax, setNewTax] = useState({ name: "", rate: 0, is_excise: false, fiscal_program: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["fb-tax-groups"],
    queryFn: () => apiFetch(`${API}/fb/tax-groups`),
  });

  const taxes: any[] = data?.taxGroups?.length ? data.taxGroups : DEFAULT_TAXES;
  const filtered = taxes.filter((t: any) =>
    (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
    (typeFilter === "all" || t.type === typeFilter)
  );

  const addTax = useMutation({
    mutationFn: () => apiFetch(`${API}/fb/tax-groups`, {
      method: "POST",
      body: JSON.stringify({
        name: newTax.name, code: newTax.name.toLowerCase().replace(/\s/g,"_"),
        rate: newTax.rate / 100, is_excise: newTax.is_excise,
        uktzed: newTax.fiscal_program || undefined,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tax-groups"] }); setAddOpen(false); toast({ title: "Податок додано" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Percent className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">Податки <span className="text-muted-foreground font-normal text-base">{filtered.length}</span></h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs">Стовпці ▾</Button>
            <Button variant="outline" size="sm" className="text-xs">Експорт</Button>
            <Button variant="outline" size="sm" className="text-xs">Друк</Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />Додати
            </Button>
          </div>
        </div>

        <div className="px-4 py-3 border-b flex gap-3 items-center bg-background">
          <div className="relative max-w-xs flex-1">
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Швидкий пошук" className="h-8 text-sm pl-3" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm bg-background h-8">
            <option value="all">Тип ▾</option>
            <option value="Додана вартість">Додана вартість</option>
            <option value="Податок з обігу">Податок з обігу</option>
          </select>
          <Button variant="outline" size="sm" className="h-8 text-xs">+ Фільтр</Button>
        </div>

        <div className="border-b bg-muted/20 px-4 py-2 grid grid-cols-[2fr_80px_1fr_80px_160px_80px] text-xs text-muted-foreground font-medium shrink-0">
          <span>Назва ▲</span><span>Відсоток</span><span>Тип</span><span>Фіскальний</span><span>Податкова програма</span><span></span>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Percent className="w-8 h-8 mb-2" />
              <p className="text-sm">Податки не знайдено</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((t: any) => (
                <div key={t.id} className="grid grid-cols-[2fr_80px_1fr_80px_160px_80px] px-4 py-3 items-center hover:bg-muted/10">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-sm font-mono">
                    {t.rate !== undefined ? (typeof t.rate === "number" && t.rate <= 1 ? (t.rate*100).toFixed(0) : t.rate) : 0}%
                  </span>
                  <span className="text-sm text-muted-foreground">{t.type || "Додана вартість"}</span>
                  <span>
                    {t.is_fiscal !== false ? (
                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">Так</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Ні</span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t.fiscal_program ? TAX_PROGRAMS[t.fiscal_program] || `Програма «${t.fiscal_program}»` : "Програму не вибрано"}
                  </span>
                  <div className="flex items-center gap-1 justify-end">
                    <button className="text-xs text-primary hover:underline">Ред.</button>
                    <button className="p-1 text-muted-foreground hover:text-foreground"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Додати податок</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Назва</Label><Input className="mt-1" value={newTax.name} onChange={e => setNewTax(p=>({...p,name:e.target.value}))} placeholder="ПДВ 20%" /></div>
            <div><Label>Відсоток</Label><Input className="mt-1" type="number" min="0" max="100"
              value={newTax.rate} onChange={e => setNewTax(p=>({...p,rate:parseFloat(e.target.value)||0}))} /></div>
            <div><Label>Податкова програма</Label>
              <select className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={newTax.fiscal_program} onChange={e => setNewTax(p=>({...p,fiscal_program:e.target.value}))}>
                <option value="">Програму не вибрано</option>
                {Object.entries(TAX_PROGRAMS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newTax.is_excise} onChange={e => setNewTax(p=>({...p,is_excise:e.target.checked}))} />
              <span className="text-sm">Акцизний податок</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Скасувати</Button>
            <Button onClick={() => addTax.mutate()} disabled={!newTax.name || addTax.isPending}>
              {addTax.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
