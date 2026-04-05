import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  QrCode, RefreshCw, Printer, ExternalLink, Clock, Users,
  CheckCircle2, Circle, AlertCircle, Loader2, ChevronDown,
  ChevronRight, Copy, Check, Table2, Eye, ShoppingBag,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_FB = BASE.replace("/maison-hd", "") + "/api/fb";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${API_FB}${path}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const BASE_URL = typeof window !== "undefined" ? window.location.origin + BASE.replace("/maison-hd", "") : "";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  open:       { label: "Відкрито",     color: "bg-blue-50 text-blue-700 border-blue-200",    dot: "bg-blue-400" },
  in_kitchen: { label: "На кухні",     color: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400 animate-pulse" },
  ready:      { label: "Готово",       color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
  served:     { label: "Подано",       color: "bg-gray-50 text-gray-600 border-gray-200",    dot: "bg-gray-300" },
  billed:     { label: "Сплачено",     color: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-400" },
  cancelled:  { label: "Скасовано",    color: "bg-red-50 text-red-600 border-red-200",       dot: "bg-red-400" },
};

const fmtTime = (d: string) => new Date(d).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const fmtMoney = (n: any) => parseFloat(n || 0).toLocaleString("uk-UA") + " ₴";

function QrImage({ url, size = 160 }: { url: string; size?: number }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=${size}x${size}&bgcolor=ffffff&color=1e1b4b&margin=4`;
  return <img src={qrUrl} alt="QR Code" width={size} height={size} className="rounded-xl" />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function QrOrderingPage() {
  const qc = useQueryClient();
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [orgSlug, setOrgSlug] = useState<string>("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("active");

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ["fb-tables-qr"],
    queryFn: async () => {
      const r = await apiFetch("/tables");
      const d = await r.json();
      return d.tables || [];
    },
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["fb-orders-qr"],
    queryFn: async () => {
      const r = await apiFetch("/orders?limit=100");
      const d = await r.json();
      return d.orders || [];
    },
    refetchInterval: 15000,
  });

  const { data: meData } = useQuery({
    queryKey: ["me-qr"],
    queryFn: async () => {
      const r = await fetch(BASE.replace("/maison-hd", "") + "/api/auth/me", { headers: { Authorization: `Bearer ${tok()}` } });
      return r.json();
    },
  });

  const slug = meData?.organization?.slug || orgSlug || "dogoda";
  const tables: any[] = tablesData || [];
  const orders: any[] = ordersData || [];

  const activeOrders = orders.filter(o => ["open", "in_kitchen", "ready"].includes(o.status));
  const displayOrders = orderStatusFilter === "active"
    ? activeOrders
    : orders.filter(o => ["served", "billed"].includes(o.status)).slice(0, 30);

  const updateOrderStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-orders-qr"] }),
  });

  const guestMenuUrl = (tableId: number) => `${window.location.origin}${BASE}/qr-menu/${slug}/${tableId}`;
  const printQr = (tableId: number, tableNum: string) => {
    const url = guestMenuUrl(tableId);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>QR Стіл ${tableNum}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:20px}h1{font-size:2rem;font-weight:bold;margin-bottom:8px}p{color:#666;font-size:0.9rem;margin-bottom:24px}img{border:4px solid #e5e7eb;border-radius:16px}small{margin-top:16px;color:#999;word-break:break-all;max-width:300px;text-align:center}</style></head><body>
      <h1>Стіл ${tableNum}</h1>
      <p>Скануйте QR для замовлення</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=300x300&bgcolor=ffffff&color=1e1b4b&margin=6" width="300" height="300"/>
      <small>${url}</small>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">QR-замовлення</h1>
            </div>
            <p className="text-sm text-gray-500">QR-коди для столів · гостьове меню · live замовлення</p>
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["fb-orders-qr"] })}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" /> Оновити
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Столів з QR</p>
            <p className="text-2xl font-bold text-gray-900">{tables.filter(t => t.isActive).length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Активних замовлень</p>
            <p className="text-2xl font-bold text-orange-600">{activeOrders.length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">На кухні</p>
            <p className="text-2xl font-bold text-amber-600">{orders.filter(o => o.status === "in_kitchen").length}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Готово до видачі</p>
            <p className="text-2xl font-bold text-emerald-600">{orders.filter(o => o.status === "ready").length}</p>
          </div>
        </div>

        {/* ── QR Codes ── */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-violet-600" />
              <h2 className="font-semibold text-gray-900 text-sm">QR-коди столів</h2>
            </div>
            <span className="text-xs text-gray-400">Гостьове посилання: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/qr-menu/{slug}/&lt;tableId&gt;</code></span>
          </div>

          {tablesLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : tables.length === 0 ? (
            <div className="py-12 text-center">
              <Table2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Столів ще немає</p>
              <p className="text-xs text-gray-400 mt-1">Додайте столи в розділі «Ресторан»</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {tables.filter(t => t.isActive).map(table => {
                const url = guestMenuUrl(table.id);
                const isExpanded = expandedTable === table.id;
                const tableOrders = orders.filter(o => o.tableId === table.id && ["open","in_kitchen","ready"].includes(o.status));
                return (
                  <div key={table.id}>
                    <div className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? "bg-violet-50/30" : ""}`}
                      onClick={() => setExpandedTable(isExpanded ? null : table.id)}>
                      {/* Table badge */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${tableOrders.length > 0 ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700"}`}>
                        {table.number}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">Стіл {table.number}</p>
                        <p className="text-xs text-gray-500">{table.location} · {table.capacity} місць</p>
                      </div>
                      {tableOrders.length > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                          {tableOrders.length} активне
                        </span>
                      )}
                      <div className="flex gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); window.open(url, "_blank"); }}
                          className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                          title="Відкрити меню"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); printQr(table.id, table.number); }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Друк QR"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <CopyButton text={url} />
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </div>
                    {isExpanded && (
                      <div className="px-5 py-4 bg-violet-50/30 border-t border-violet-100">
                        <div className="flex gap-6 flex-wrap">
                          <div className="flex flex-col items-center">
                            <QrImage url={url} size={140} />
                            <p className="text-xs text-gray-500 mt-2 text-center">Стіл {table.number}</p>
                          </div>
                          <div className="flex-1 min-w-[200px] space-y-2">
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Посилання</p>
                            <div className="flex items-center gap-2 bg-white border border-violet-200 rounded-xl px-3 py-2">
                              <code className="text-xs text-gray-600 flex-1 break-all">{url}</code>
                              <CopyButton text={url} />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => window.open(url, "_blank")}
                                className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-medium"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Відкрити меню
                              </button>
                              <button
                                onClick={() => printQr(table.id, table.number)}
                                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-medium"
                              >
                                <Printer className="w-3.5 h-3.5" /> Друкувати QR
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Live Orders ── */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-violet-600" />
              <h2 className="font-semibold text-gray-900 text-sm">Замовлення</h2>
              {activeOrders.length > 0 && (
                <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">{activeOrders.length}</span>
              )}
            </div>
            <div className="flex gap-2">
              {["active", "done"].map(f => (
                <button key={f} onClick={() => setOrderStatusFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${orderStatusFilter === f ? "bg-violet-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {f === "active" ? "Активні" : "Завершені"}
                </button>
              ))}
            </div>
          </div>

          {ordersLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : displayOrders.length === 0 ? (
            <div className="py-12 text-center">
              <ShoppingBag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-500">{orderStatusFilter === "active" ? "Немає активних замовлень" : "Немає завершених замовлень"}</p>
              <p className="text-xs text-gray-400 mt-1">Замовлення від гостей через QR з'являться тут в реальному часі</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">№</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Стіл / Кімната</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Гість</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Час</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Сума</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Статус</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Дія</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayOrders.map(order => {
                    const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.open;
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">#{order.id}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 text-sm">{order.roomNumber || `Стіл ${order.tableId || "—"}`}</p>
                          <p className="text-xs text-gray-400">{order.orderType === "dine_in" ? "В залі" : "Номер"}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-sm">{order.guestName || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />{fmtTime(order.openedAt || order.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{fmtMoney(order.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${st.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {order.status === "open" && (
                              <button
                                onClick={() => updateOrderStatus.mutate({ id: order.id, status: "in_kitchen" })}
                                className="text-xs px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg"
                              >На кухню</button>
                            )}
                            {order.status === "in_kitchen" && (
                              <button
                                onClick={() => updateOrderStatus.mutate({ id: order.id, status: "ready" })}
                                className="text-xs px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg"
                              >Готово</button>
                            )}
                            {order.status === "ready" && (
                              <button
                                onClick={() => updateOrderStatus.mutate({ id: order.id, status: "served" })}
                                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                              >Подано</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info ── */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <QrCode className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-violet-700 space-y-1">
              <p className="font-medium">Як працює QR-замовлення?</p>
              <p>1. Роздрукуйте QR-код для кожного столу кнопкою «Друкувати QR»</p>
              <p>2. Гість сканує QR-код → бачить ваше меню на смартфоні</p>
              <p>3. Гість обирає страви і натискає «Замовити» — замовлення одразу з'являється в цьому списку</p>
              <p>4. Персонал отримує замовлення і переводить статус: Відкрито → На кухні → Готово → Подано</p>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
