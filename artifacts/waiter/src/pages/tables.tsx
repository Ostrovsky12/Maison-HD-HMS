import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Users, LogOut, RefreshCw, ChefHat, Plus,
} from "lucide-react";

const STATUS_CONFIG = {
  free:     { label: "Вільний",    color: "bg-green-100 border-green-300 text-green-800",   dot: "bg-green-500" },
  occupied: { label: "Зайнятий",   color: "bg-orange-100 border-orange-300 text-orange-800", dot: "bg-orange-500" },
  reserved: { label: "Резерв",     color: "bg-purple-100 border-purple-300 text-purple-800", dot: "bg-purple-500" },
  cleaning: { label: "Прибирання", color: "bg-gray-100 border-gray-300 text-gray-600",       dot: "bg-gray-400" },
};

export default function Tables() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["waiter-tables"],
    queryFn: () => apiFetch("/fb/tables"),
    refetchInterval: 15000,
  });

  const allTables: any[] = data?.tables || [];

  // Only show tables with active orders opened by this waiter
  const myTables = allTables.filter(
    t => t.status === "occupied" && t.current_waiter_user_id === user?.id
  );

  // Free tables for picking when creating a new order
  const freeTables = allTables.filter(t => t.status === "free");

  function openTable(t: any) {
    if (t.current_order_id) {
      setLocation(`/order/${t.current_order_id}`);
    }
  }

  function newOrder() {
    setLocation("/new-order");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">Мої столи</h1>
            <p className="text-blue-200 text-sm">{user?.name || user?.email}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()} disabled={isFetching}
              className="p-2 rounded-xl bg-white/20 active:bg-white/30">
              <RefreshCw className={`w-5 h-5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button onClick={logout} className="p-2 rounded-xl bg-white/20 active:bg-white/30">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Stats */}
        <div className="flex gap-3">
          <div className="flex-1 bg-white/20 rounded-xl px-3 py-2 text-center">
            <div className="text-xl font-bold">{myTables.length}</div>
            <div className="text-xs text-blue-100">Мої столи</div>
          </div>
          <div className="flex-1 bg-white/20 rounded-xl px-3 py-2 text-center">
            <div className="text-xl font-bold">{freeTables.length}</div>
            <div className="text-xs text-blue-100">Вільних</div>
          </div>
        </div>
      </div>

      {/* My open tables */}
      <div className="flex-1 p-4 pb-safe overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : myTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <ChefHat className="w-12 h-12 opacity-20" />
            <p className="text-sm">У вас немає відкритих столів</p>
            <p className="text-xs opacity-60">Натисніть «+» щоб створити замовлення</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {myTables.map(t => {
              const cfg = STATUS_CONFIG[t.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.occupied;
              return (
                <button key={t.id} onClick={() => openTable(t)}
                  className={`relative border-2 rounded-2xl p-4 text-left active:scale-95 transition-transform ${cfg.color}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-2xl font-bold">№{t.table_number}</div>
                    <ChefHat className="w-4 h-4 text-orange-600 opacity-80 mt-1" />
                  </div>
                  <div className="text-xs font-medium opacity-70 mb-1">{t.section || "Зал"}</div>
                  <div className="flex items-center gap-1 text-xs opacity-70">
                    <Users className="w-3.5 h-3.5" />
                    <span>{t.capacity} місць</span>
                  </div>
                  {t.current_total && (
                    <div className="mt-2 text-sm font-bold">
                      ₴{Number(t.current_total).toFixed(0)}
                    </div>
                  )}
                  {t.current_guest && (
                    <div className="mt-1 text-xs opacity-60 truncate">{t.current_guest}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New order FAB */}
      <div className="fixed bottom-8 right-6">
        <button
          onClick={newOrder}
          className="w-16 h-16 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
