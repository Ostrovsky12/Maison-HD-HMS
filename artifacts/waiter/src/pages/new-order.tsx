import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Users, Loader2, UtensilsCrossed } from "lucide-react";

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [tableNumber, setTableNumber] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [notes, setNotes] = useState("");

  // Silently fetch tables to resolve table number → table ID
  const { data: tablesData } = useQuery({
    queryKey: ["waiter-tables"],
    queryFn: () => apiFetch("/fb/tables"),
    staleTime: 60_000,
  });
  const allTables: any[] = tablesData?.tables || [];

  const create = useMutation({
    mutationFn: () => {
      // Find table by number (string match)
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
        }),
      });
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["waiter-tables"] });
      // Go directly to menu so waiter can start adding dishes immediately
      setLocation(`/menu/${d.order.id}`);
    },
  });

  const canSubmit = tableNumber.trim().length > 0 && !create.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-5 safe-top">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/tables")}
            className="p-2 -ml-1 rounded-xl bg-white/20 active:bg-white/30"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Нове замовлення</h1>
            <p className="text-blue-200 text-sm">
              {tableNumber ? `Стіл №${tableNumber}` : "Введіть номер столу"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-6 overflow-y-auto">

        {/* Table number input */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Номер столу
          </label>
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

        {/* Guest count */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Кількість гостей
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
              <button
                key={n}
                onClick={() => setGuestCount(n)}
                className={`py-3.5 rounded-2xl font-bold text-lg transition-colors ${
                  guestCount === n
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-muted text-foreground hover:bg-muted/70"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {/* Large group */}
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Або введіть:</span>
            <input
              type="number"
              min={1}
              max={50}
              value={guestCount}
              onChange={e => setGuestCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 px-3 py-2 rounded-xl border text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Примітки <span className="font-normal text-muted-foreground">(опційно)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Алергії, побажання..."
            rows={2}
            className="w-full px-4 py-3 rounded-2xl border bg-card text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => create.mutate()}
          disabled={!canSubmit}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
        >
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
