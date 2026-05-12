import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Users, Loader2, UtensilsCrossed, Table2 } from "lucide-react";

export default function NewOrder() {
  const { tableId } = useParams<{ tableId?: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [selectedTableId, setSelectedTableId] = useState<number | null>(
    tableId ? parseInt(tableId) : null
  );
  const [guestCount, setGuestCount] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ["waiter-tables"],
    queryFn: () => apiFetch("/fb/tables"),
  });

  const allTables: any[] = tablesData?.tables || [];
  const freeTables = allTables.filter(t => t.status === "free");
  const selectedTable = allTables.find((t: any) => t.id === selectedTableId);

  const create = useMutation({
    mutationFn: () => apiFetch("/fb/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: selectedTableId,
        orderType: "dine_in",
        guestName: guestName || `Стіл ${selectedTable?.table_number || selectedTableId}`,
        guestCount,
        notes,
      }),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["waiter-tables"] });
      setLocation(`/order/${d.order.id}`);
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/tables")} className="p-2 -ml-1 rounded-xl bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Нове замовлення</h1>
            <p className="text-blue-200 text-sm">
              {selectedTable ? `Стіл №${selectedTable.table_number}` : "Оберіть стіл"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-5 overflow-y-auto pb-safe">

        {/* Step 1: Table selection (only if not pre-selected) */}
        {!tableId && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Table2 className="w-4 h-4" /> Оберіть стіл
            </label>
            {tablesLoading ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : freeTables.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 border rounded-xl">
                Немає вільних столів
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {freeTables.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTableId(t.id)}
                    className={`py-3 rounded-xl font-bold text-lg border-2 transition-colors ${
                      selectedTableId === t.id
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-card text-foreground border-border hover:border-blue-400"
                    }`}
                  >
                    №{t.table_number}
                    <div className="text-xs font-normal opacity-70">{t.section || "Зал"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Guest count */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Кількість гостей
          </label>
          <div className="flex gap-2 flex-wrap">
            {[1,2,3,4,5,6,7,8].map(n => (
              <button key={n} onClick={() => setGuestCount(n)}
                className={`w-11 h-11 rounded-xl font-semibold text-base transition-colors ${
                  guestCount === n
                    ? "bg-blue-600 text-white"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Guest name */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Ім'я гостя (опційно)</label>
          <input
            type="text"
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            placeholder={selectedTable ? `Стіл ${selectedTable.table_number}` : "Ім'я гостя"}
            className="w-full px-4 py-3 rounded-xl border bg-card text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Примітки</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Алергії, побажання..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border bg-card text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !selectedTableId}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
          {create.isPending
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Створення...</>
            : <><UtensilsCrossed className="w-5 h-5" /> Відкрити замовлення</>
          }
        </button>

        {create.isError && (
          <p className="text-sm text-red-500 text-center">{(create.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
