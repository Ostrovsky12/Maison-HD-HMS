import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { OutletPicker } from "@/components/outlet-picker";
import { ArrowLeft, Users, Loader2, UtensilsCrossed, ShoppingBag, MapPin } from "lucide-react";

type Point = { id: number; table_number: string; group_id: number | null; group_name: string | null; section: string | null; current_order_id: number | null };

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const params = useParams<{ tableId?: string }>();
  const routeTableId = params.tableId ? Number(params.tableId) : null;
  const qc = useQueryClient();

  const [mode, setMode] = useState<"point" | "takeaway">("point");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(routeTableId);
  const [guestCount, setGuestCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [outletId, setOutletId] = useState<number | null>(null);

  const { data: tablesData, isLoading, error, refetch } = useQuery({
    queryKey: ["waiter-tables"],
    queryFn: () => apiFetch("/fb/tables"),
    staleTime: 30_000,
  });
  const points: Point[] = useMemo(() => tablesData?.tables || [], [tablesData]);

  const groups = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of points) m.set(p.group_id == null ? "none" : String(p.group_id), p.group_name || "Без групи");
    return Array.from(m, ([key, name]) => ({ key, name }));
  }, [points]);

  const visible = points.filter(p => groupFilter === "all" || (p.group_id == null ? "none" : String(p.group_id)) === groupFilter);
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; items: Point[] }>();
    for (const p of visible) {
      const k = p.group_id == null ? "none" : String(p.group_id);
      if (!m.has(k)) m.set(k, { name: p.group_name || "Без групи", items: [] });
      m.get(k)!.items.push(p);
    }
    return Array.from(m.values());
  }, [visible]);

  const selected = points.find(p => p.id === selectedId) || null;
  const routeMissing = routeTableId != null && !isLoading && !error && !points.some(p => p.id === routeTableId);

  const openPoint = useMutation({
    mutationFn: (id: number) => apiFetch(`/fb/service-points/${id}/open`, { method: "POST", ...(outletId != null ? { body: JSON.stringify({ outletId }) } : {}) }) as Promise<{ orderId: number; created: boolean }>,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["waiter-tables"] });
      qc.invalidateQueries({ queryKey: ["waiter-open-orders"] });
      setLocation(`/menu/${d.orderId}`);
    },
  });

  const takeaway = useMutation({
    mutationFn: () => apiFetch("/fb/orders", {
      method: "POST",
      body: JSON.stringify({ tableId: null, orderType: "takeaway", guestName: "З собою", guestCount, notes: notes || undefined, outletId: outletId ?? null }),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["waiter-open-orders"] });
      setLocation(`/menu/${d.order.id}`);
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-blue-600 text-white px-4 pt-12 pb-5 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/tables")} data-testid="button-back" className="p-2 -ml-1 rounded-xl bg-white/20 active:bg-white/30">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Нове замовлення</h1>
            <p className="text-blue-200 text-sm">Оберіть точну точку обслуговування</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 bg-white/15 p-1 rounded-2xl">
          {(["point", "takeaway"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} data-testid={`tab-mode-${m}`}
              className={`py-2 rounded-xl text-sm font-semibold ${mode === m ? "bg-white text-blue-700" : "text-white"}`}>
              {m === "point" ? "Стіл / номер" : "З собою"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-5 space-y-5 overflow-y-auto pb-32">
        <OutletPicker value={outletId} onChange={setOutletId} note={mode === "point" ? "Для вже відкритого рахунку точка продажу не змінюється." : undefined} />
        {mode === "takeaway" ? (
          <>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Кількість гостей</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(n => (
                  <button key={n} onClick={() => setGuestCount(n)}
                    className={`py-3.5 rounded-2xl font-bold text-lg ${guestCount === n ? "bg-blue-600 text-white shadow-md" : "bg-muted text-foreground"}`}>{n}</button>
                ))}
              </div>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Примітки (опційно)" rows={2}
              className="w-full px-4 py-3 rounded-2xl border bg-card text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            <button onClick={() => takeaway.mutate()} disabled={takeaway.isPending} data-testid="button-create-takeaway"
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
              {takeaway.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Створення...</> : <><ShoppingBag className="w-5 h-5" /> Створити замовлення з собою</>}
            </button>
            {takeaway.isError && <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl px-4 py-3">{(takeaway.error as Error).message}</p>}
          </>
        ) : isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)}</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 p-4 text-sm text-red-700">
            Не вдалося завантажити точки. <button className="ml-2 underline" onClick={() => refetch()}>Повторити</button>
          </div>
        ) : points.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">Точки обслуговування не налаштовані</p>
        ) : (
          <>
            {routeMissing && <p className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3">Точку з посилання не знайдено. Оберіть вручну.</p>}
            {groups.length > 1 && (
              <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
                {[{ key: "all", name: "Усі" }, ...groups].map(g => (
                  <button key={g.key} onClick={() => setGroupFilter(g.key)} data-testid={`filter-group-${g.key}`}
                    className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold ${groupFilter === g.key ? "bg-blue-600 text-white" : "bg-muted text-foreground"}`}>{g.name}</button>
                ))}
              </div>
            )}
            {grouped.map(g => (
              <div key={g.name}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{g.name}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {g.items.map(p => (
                    <button key={p.id} onClick={() => setSelectedId(p.id)} data-testid={`button-point-${p.id}`}
                      className={`py-3 px-2 rounded-2xl border-2 text-center transition-colors ${selectedId === p.id ? "border-blue-600 bg-blue-50" : "border-border bg-card"}`}>
                      <div className="font-black text-lg">{p.table_number}</div>
                      {p.current_order_id != null && <div className="text-[11px] font-semibold text-amber-700">Відкрито</div>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {mode === "point" && selected && (
        <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border p-4 safe-bottom space-y-2">
          <div className="flex items-center gap-2 text-sm" data-testid="text-selected-point">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">{selected.group_name || "Без групи"}</span>
            <span className="text-muted-foreground">· №{selected.table_number}{selected.section ? ` · ${selected.section}` : ""}</span>
          </div>
          <button onClick={() => openPoint.mutate(selected.id)} disabled={openPoint.isPending} data-testid="button-open-point"
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {openPoint.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Відкриття...</>
              : <><UtensilsCrossed className="w-5 h-5" /> {selected.current_order_id != null ? "Додати до відкритого рахунку" : "Відкрити та перейти до меню"}</>}
          </button>
          {openPoint.isError && <p className="text-sm text-red-500 text-center">{(openPoint.error as Error).message}</p>}
        </div>
      )}
    </div>
  );
}
