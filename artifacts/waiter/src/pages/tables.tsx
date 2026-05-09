import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Users, Clock, CheckCircle2, Circle, Coffee,
  LogOut, RefreshCw, ChefHat, Plus,
} from "lucide-react";

const STATUS_CONFIG = {
  free:     { label: "Вільний", color: "bg-green-100 border-green-300 text-green-800", dot: "bg-green-500" },
  occupied: { label: "Зайнятий", color: "bg-orange-100 border-orange-300 text-orange-800", dot: "bg-orange-500" },
  reserved: { label: "Резерв", color: "bg-purple-100 border-purple-300 text-purple-800", dot: "bg-purple-500" },
  cleaning: { label: "Прибирання", color: "bg-gray-100 border-gray-300 text-gray-600", dot: "bg-gray-400" },
};

export default function Tables() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["waiter-tables"],
    queryFn: () => apiFetch("/fb/tables"),
    refetchInterval: 15000,
  });

  const tables: any[] = data?.tables || [];
  const free = tables.filter(t => t.status === "free").length;
  const occupied = tables.filter(t => t.status === "occupied").length;

  function openTable(t: any) {
    if (t.status === "occupied" && t.currentOrderId) {
      setLocation(`/order/${t.currentOrderId}`);
    } else if (t.status === "free") {
      setLocation(`/new-order/${t.id}`);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">Столи</h1>
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
            <div className="text-xl font-bold">{free}</div>
            <div className="text-xs text-blue-100">Вільних</div>
          </div>
          <div className="flex-1 bg-white/20 rounded-xl px-3 py-2 text-center">
            <div className="text-xl font-bold">{occupied}</div>
            <div className="text-xs text-blue-100">Зайнятих</div>
          </div>
          <div className="flex-1 bg-white/20 rounded-xl px-3 py-2 text-center">
            <div className="text-xl font-bold">{tables.length}</div>
            <div className="text-xs text-blue-100">Всього</div>
          </div>
        </div>
      </div>

      {/* Tables grid */}
      <div className="flex-1 p-4 pb-safe overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {tables.map(t => {
              const cfg = STATUS_CONFIG[t.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.free;
              return (
                <button key={t.id} onClick={() => openTable(t)}
                  className={`relative border-2 rounded-2xl p-4 text-left active:scale-95 transition-transform ${cfg.color}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-2xl font-bold">№{t.number}</div>
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 ${cfg.dot}`} />
                  </div>
                  <div className="text-xs font-medium opacity-70 mb-1">{t.location || "Зал"}</div>
                  <div className="flex items-center gap-1 text-xs opacity-70">
                    <Users className="w-3.5 h-3.5" />
                    <span>{t.capacity} місць</span>
                  </div>
                  <div className="mt-2 text-xs font-semibold">{cfg.label}</div>
                  {t.status === "occupied" && t.currentOrderId && (
                    <div className="absolute top-2 right-2">
                      <ChefHat className="w-4 h-4 text-orange-600 opacity-80" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
