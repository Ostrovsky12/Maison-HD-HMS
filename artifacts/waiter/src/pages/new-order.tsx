import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Users, Loader2, UtensilsCrossed } from "lucide-react";

export default function NewOrder() {
  const { tableId } = useParams<{ tableId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [guestCount, setGuestCount] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: tablesData } = useQuery({
    queryKey: ["waiter-tables"],
    queryFn: () => apiFetch("/fb/tables"),
  });
  const table = tablesData?.tables?.find((t: any) => t.id === parseInt(tableId!));

  const create = useMutation({
    mutationFn: () => apiFetch("/fb/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: parseInt(tableId!),
        orderType: "dine_in",
        guestName: guestName || `Стіл ${table?.number || tableId}`,
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
      <div className="bg-blue-600 text-white px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/tables")} className="p-2 -ml-1 rounded-xl bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Нове замовлення</h1>
            <p className="text-blue-200 text-sm">Стіл №{table?.number || tableId}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-5">
        {/* Guest count */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3">Кількість гостей</label>
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
            placeholder={`Стіл ${table?.number || tableId}`}
            className="w-full px-4 py-3 rounded-xl border bg-card text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Примітки до замовлення</label>
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
          disabled={create.isPending}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
          {create.isPending
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Створення...</>
            : <><UtensilsCrossed className="w-5 h-5" /> Відкрити замовлення</>
          }
        </button>
      </div>
    </div>
  );
}
