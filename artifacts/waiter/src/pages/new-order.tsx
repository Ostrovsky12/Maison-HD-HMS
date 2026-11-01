import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Users, Loader2, UtensilsCrossed, Store, ChevronRight } from "lucide-react";

const ICON_MAP: Record<string, string> = {
  utensils: "🍽", coffee: "☕", waves: "🌊", sun: "🌞", beer: "🍺", pizza: "🍕",
};
const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500", green: "bg-green-500", amber: "bg-amber-500",
  purple: "bg-purple-500", rose: "bg-rose-500", teal: "bg-teal-500",
  orange: "bg-orange-500", slate: "bg-slate-500",
};

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [step, setStep] = useState<"outlet" | "details">("outlet");
  const [selectedOutlet, setSelectedOutlet] = useState<any>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [notes, setNotes] = useState("");

  const { data: tablesData } = useQuery({
    queryKey: ["waiter-tables"],
    queryFn: () => apiFetch("/fb/tables"),
    staleTime: 60_000,
  });
  const allTables: any[] = tablesData?.tables || [];

  const { data: outletsData, isLoading: outletsLoading } = useQuery({
    queryKey: ["waiter-outlets"],
    queryFn: () => apiFetch("/fb/outlets"),
    staleTime: 60_000,
  });
  const outlets: any[] = (outletsData?.outlets || []).filter((o: any) => o.is_active);

  const create = useMutation({
    mutationFn: () => {
      const matchedTable = allTables.find(
        t => String(t.table_number).toLowerCase() === tableNumber.trim().toLowerCase()
      );
      return apiFetch("/fb/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: matchedTable?.id || null,
          orderType: "dine_in",
          guestName: `Стіл ${tableNumber.trim() || "?"}`,
          guestCount,
          notes: notes || undefined,
          outletId: selectedOutlet?.id || null,
        }),
      });
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["waiter-tables"] });
      qc.invalidateQueries({ queryKey: ["waiter-open-orders"] });
      setLocation(`/menu/${d.order.id}`);
    },
  });

  const canSubmit = tableNumber.trim().length > 0 && !create.isPending;

  // ── Step 1: Outlet selection ──────────────────────────────────────────────
  if (step === "outlet") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-blue-600 text-white px-4 pt-12 pb-5 safe-top">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/tables")}
              className="p-2 -ml-1 rounded-xl bg-white/20 active:bg-white/30">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold">Нове замовлення</h1>
              <p className="text-blue-200 text-sm">Оберіть точку продажу</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {outletsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : outlets.length === 0 ? (
            // No outlets configured — skip straight to details
            <div className="text-center py-8">
              <Store className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground mb-4">Точки продажу не налаштовані</p>
              <button
                onClick={() => { setSelectedOutlet(null); setStep("details"); }}
                className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                <UtensilsCrossed className="w-5 h-5" /> Продовжити без точки
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Обрана точка визначає яке меню бачить офіціант</p>
              <div className="space-y-3">
                {outlets.map(o => {
                  const emoji = ICON_MAP[o.icon] || "🍽";
                  const colorCls = COLOR_MAP[o.color] || "bg-blue-500";
                  return (
                    <button key={o.id} onClick={() => { setSelectedOutlet(o); setStep("details"); }}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-border hover:border-blue-400 active:scale-98 transition-all bg-card text-left">
                      <div className={`w-12 h-12 rounded-xl ${colorCls} flex items-center justify-center text-2xl shrink-0`}>
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-base">{o.name}</div>
                        {o.description && <div className="text-sm text-muted-foreground truncate">{o.description}</div>}
                        {o.address && <div className="text-xs text-muted-foreground">📍 {o.address}</div>}
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => { setSelectedOutlet(null); setStep("details"); }}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm font-medium">
                Без точки продажу
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: Order details ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-blue-600 text-white px-4 pt-12 pb-5 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("outlet")}
            className="p-2 -ml-1 rounded-xl bg-white/20 active:bg-white/30">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Нове замовлення</h1>
            <p className="text-blue-200 text-sm flex items-center gap-1">
              {selectedOutlet ? (
                <><span>{ICON_MAP[selectedOutlet.icon] || "🍽"}</span> {selectedOutlet.name}</>
              ) : (
                "Без точки продажу"
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-6 overflow-y-auto">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Номер столу</label>
          <input
            type="text"
            inputMode="numeric"
            value={tableNumber}
            onChange={e => setTableNumber(e.target.value)}
            placeholder="напр. 5"
            autoFocus
            className="w-full px-4 py-4 rounded-2xl border-2 border-border bg-card text-3xl font-black text-center focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Кількість гостей
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
              <button key={n} onClick={() => setGuestCount(n)}
                className={`py-3.5 rounded-2xl font-bold text-lg transition-colors ${
                  guestCount === n ? "bg-blue-600 text-white shadow-md" : "bg-muted text-foreground"
                }`}>
                {n}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Або введіть:</span>
            <input type="number" min={1} max={50} value={guestCount}
              onChange={e => setGuestCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 px-3 py-2 rounded-xl border text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Примітки <span className="font-normal text-muted-foreground">(опційно)</span>
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Алергії, побажання..."
            rows={2}
            className="w-full px-4 py-3 rounded-2xl border bg-card text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
        </div>

        <button onClick={() => create.mutate()} disabled={!canSubmit}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
          {create.isPending
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Створення...</>
            : <><UtensilsCrossed className="w-5 h-5" /> Відкрити та перейти до меню</>
          }
        </button>

        {create.isError && (
          <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl px-4 py-3">
            {(create.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
