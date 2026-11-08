import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Store } from "lucide-react";

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500", green: "bg-green-500", amber: "bg-amber-500",
  purple: "bg-purple-500", rose: "bg-rose-500", teal: "bg-teal-500",
  orange: "bg-orange-500", slate: "bg-slate-500",
};

/** Optional outlet selector. Renders nothing if no active outlets are configured. null = not chosen. */
export function OutletPicker({ value, onChange, note }: { value: number | null; onChange: (id: number | null) => void; note?: string }) {
  const { data } = useQuery({ queryKey: ["waiter-outlets"], queryFn: () => apiFetch("/fb/outlets"), staleTime: 60_000 });
  const outlets: any[] = (data?.outlets || []).filter((o: any) => o.is_active);
  if (outlets.length === 0) return null;
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
        <Store className="w-4 h-4" /> Точка продажу <span className="font-normal text-muted-foreground">(опційно)</span>
      </label>
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
        <button onClick={() => onChange(null)} data-testid="button-outlet-none"
          className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold ${value == null ? "bg-blue-600 text-white" : "bg-muted text-foreground"}`}>
          Не обрано
        </button>
        {outlets.map(o => (
          <button key={o.id} onClick={() => onChange(o.id)} data-testid={`button-outlet-${o.id}`}
            className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${value === o.id ? "bg-blue-600 text-white" : "bg-muted text-foreground"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${COLOR_MAP[o.color] || "bg-blue-500"}`} />{o.name}
          </button>
        ))}
      </div>
      {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
    </div>
  );
}
