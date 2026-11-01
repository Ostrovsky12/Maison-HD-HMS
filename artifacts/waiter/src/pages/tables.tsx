import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, RefreshCw, ChefHat, Plus, UtensilsCrossed, ArrowRight, Users, BedDouble, ShoppingBag } from "lucide-react";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:       { label: "Відкрите",   color: "text-blue-600 bg-blue-50"   },
  in_kitchen: { label: "На кухні",   color: "text-orange-600 bg-orange-50" },
  ready:      { label: "Готово",     color: "text-green-600 bg-green-50"  },
  new_guest:  { label: "Новий гість",color: "text-purple-600 bg-purple-50"},
  billed:     { label: "Закрите",    color: "text-gray-500 bg-gray-100"   },
};

export default function Tables() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["waiter-open-orders"],
    queryFn: () => apiFetch("/fb/orders?open=true"),
    refetchInterval: 15000,
  });

  const raw: any[] = Array.isArray(data) ? data : (data?.orders || []);
  const activeTables = raw.filter(o => o && o.id && o.status !== "billed" && o.status !== "closed" && o.status !== "cancelled");

  function describe(o: any) {
    if (o.tableNumber != null && o.tableNumber !== "") return { badge: `#${o.tableNumber}`, title: `Стіл №${o.tableNumber}${o.tableLocation ? ` · ${o.tableLocation}` : ""}`, icon: null };
    if (o.roomNumber) return { badge: String(o.roomNumber), title: `Номер ${o.roomNumber}`, icon: BedDouble };
    return { badge: "", title: o.orderType === "takeaway" ? "З собою" : `Замовлення №${o.id}`, icon: ShoppingBag };
  }

  function openOrder(orderId: number) {
    setLocation(`/order/${orderId}`);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-5 safe-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Maison HD</h1>
              <p className="text-blue-200 text-sm leading-tight">{user?.name || user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2.5 rounded-xl bg-white/20 active:bg-white/30"
            >
              <RefreshCw className={`w-4.5 h-4.5 w-[18px] h-[18px] ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button onClick={logout} className="p-2.5 rounded-xl bg-white/20 active:bg-white/30">
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Active orders list */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-28">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base text-foreground">
            Активні замовлення
            {activeTables.length > 0 && (
              <span className="ml-2 text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                {activeTables.length}
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <RefreshCw className="w-7 h-7 animate-spin" />
            <p className="text-sm">Завантаження...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 p-4 text-sm text-red-700">
            Не вдалося завантажити замовлення.
            <button className="ml-2 underline" onClick={() => refetch()}>Повторити</button>
          </div>
        ) : activeTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-4 text-center">
            <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center">
              <ChefHat className="w-10 h-10 text-blue-300" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Немає активних замовлень</p>
              <p className="text-sm text-muted-foreground mt-1">Натисніть «+» щоб відкрити новий стіл</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTables.map(t => {
              const st = STATUS_LABEL[t.status] || STATUS_LABEL.open;
              const d = describe(t);
              const Icon = d.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => openOrder(t.id)}
                  data-testid={`card-order-${t.id}`}
                  className="w-full bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-transform shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        {Icon ? <Icon className="w-6 h-6 text-blue-700" /> : <span className="text-blue-700 font-black text-base">{d.badge}</span>}
                      </div>
                      <div>
                        <div className="font-bold text-base">{d.title}</div>
                        {t.guestName && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Users className="w-3.5 h-3.5" />
                            {t.guestName}
                          </div>
                        )}
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.totalAmount != null && (
                        <span className="font-black text-lg text-foreground">
                          {Number(t.totalAmount).toFixed(0)} ₴
                        </span>
                      )}
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New order FAB */}
      <div className="fixed bottom-8 right-5">
        <button
          onClick={() => setLocation("/new-order")}
          className="w-16 h-16 rounded-full bg-blue-600 text-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
