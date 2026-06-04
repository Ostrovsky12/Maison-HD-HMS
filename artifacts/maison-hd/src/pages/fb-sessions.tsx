import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Monitor, Smartphone, Loader2, Wifi, WifiOff } from "lucide-react";
import { format, parseISO } from "date-fns";
import { uk } from "date-fns/locale";

const API = "/api/fb/access";
async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function parseDevice(device?: string) {
  if (!device) return { os: "—", isMobile: false };
  const isMobile = /ios|android|mobile/i.test(device);
  return { os: device, isMobile };
}

export default function FbSessions() {
  const { data, isLoading } = useQuery({
    queryKey: ["fb-sessions"],
    queryFn: () => apiFetch("/sessions"),
    refetchInterval: 30000,
  });

  const sessions: any[] = data?.sessions || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="w-6 h-6 text-slate-600" />
            <div>
              <h1 className="text-lg font-bold">Сесії користувачів</h1>
              <p className="text-xs text-muted-foreground">{sessions.length} записів</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Monitor className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">Сесій немає</p>
              <p className="text-sm text-muted-foreground mt-1">Журнал входів буде з'являтися тут</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b sticky top-0">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium w-4"></th>
                  <th className="text-left px-4 py-3 font-medium">Користувач</th>
                  <th className="text-left px-4 py-3 font-medium">Пристрій</th>
                  <th className="text-left px-4 py-3 font-medium">Браузер</th>
                  <th className="text-left px-4 py-3 font-medium">IP</th>
                  <th className="text-right px-4 py-3 font-medium">Час входу</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((s: any) => {
                  const { os, isMobile } = parseDevice(s.device);
                  const DevIcon = isMobile ? Smartphone : Monitor;
                  const dt = s.created_at ? parseISO(s.created_at) : null;
                  return (
                    <tr key={s.id} className="hover:bg-muted/20">
                      <td className="pl-4 py-3">
                        <div className={`w-2 h-2 rounded-full ${s.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                      </td>
                      <td className="px-4 py-3 font-medium">{s.staff_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <DevIcon className="w-3.5 h-3.5 shrink-0" />
                          {s.device || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.browser || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.ip_address || "—"}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {dt ? format(dt, "d MMMM, HH:mm", { locale: uk }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
