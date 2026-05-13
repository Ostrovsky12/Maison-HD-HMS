import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const API = "/api/fb";
async function apiFetch(path: string) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

const STATUS_LABEL: Record<string, string> = {
  open: "Відкрито", cooking: "Готується", billed: "Оплачено", closed: "Закрито", cancelled: "Скасовано",
};
const STATUS_COLOR: Record<string, string> = {
  open: "text-blue-600 bg-blue-50", cooking: "text-amber-600 bg-amber-50",
  billed: "text-emerald-600 bg-emerald-50", closed: "text-emerald-700 bg-emerald-50",
  cancelled: "text-red-500 bg-red-50",
};
const PAY_LABEL: Record<string, string> = {
  cash: "Готівка", card: "Картка", qr: "QR", invoice: "Рахунок", mixed: "Змішана",
};

const PRESETS = [
  { label: "Сьогодні", from: () => today(), to: () => today() },
  { label: "7 днів", from: () => daysAgo(6), to: () => today() },
  { label: "30 днів", from: () => daysAgo(29), to: () => today() },
];

export default function FbReportOrders() {
  const [preset, setPreset] = useState(0);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["fb-analytics-orders", from, to, status, payment, page],
    queryFn: () => apiFetch(`/analytics/orders?from=${from}&to=${to}&status=${status}&payment=${payment}&page=${page}&limit=${limit}`),
  });

  function applyPreset(i: number) {
    setPreset(i);
    setFrom(PRESETS[i].from());
    setTo(PRESETS[i].to());
    setPage(1);
  }

  const orders: any[] = data?.orders || [];
  const total: number = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const filtered = search
    ? orders.filter(o =>
        o.receipt_number?.includes(search) ||
        o.guest_name?.toLowerCase().includes(search.toLowerCase()) ||
        o.waiter_name?.toLowerCase().includes(search.toLowerCase()) ||
        o.table_number?.includes(search)
      )
    : orders;

  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Чеки</h1>
            <p className="text-sm text-muted-foreground">{total} замовлень за період</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          {/* Presets */}
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)}
                className={`px-3 py-1.5 transition-colors ${preset === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); setPage(1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); setPage(1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs" />

          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs">
            <option value="all">Всі статуси</option>
            <option value="billed">Оплачено</option>
            <option value="closed">Закрито</option>
            <option value="open">Відкрито</option>
            <option value="cancelled">Скасовано</option>
          </select>

          <select value={payment} onChange={e => { setPayment(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1.5 bg-background text-xs">
            <option value="all">Всі оплати</option>
            <option value="cash">Готівка</option>
            <option value="card">Картка</option>
            <option value="qr">QR</option>
            <option value="invoice">Рахунок</option>
          </select>

          <div className="flex items-center gap-1.5 border rounded px-2 py-1.5 bg-background text-xs ml-auto">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none w-32" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Стіл</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Гість</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Офіціант</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Відкрито</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Закрито</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Знижка</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Сума</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Оплата</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Статус</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">Завантаження...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">Замовлень не знайдено</td></tr>
                ) : (
                  filtered.map((o: any) => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {o.receipt_number || `#${o.id}`}
                      </td>
                      <td className="px-4 py-2.5">{o.table_number ? `Стіл ${o.table_number}` : "—"}</td>
                      <td className="px-4 py-2.5 max-w-[120px] truncate">{o.guest_name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{o.waiter_name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {o.created_at ? new Date(o.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {o.closed_at ? new Date(o.closed_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        {Number(o.discount_amount) > 0 ? <span className="text-red-500">-{fmt(Number(o.discount_amount))}</span> : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmt(Number(o.total_amount || 0))}</td>
                      <td className="px-4 py-2.5 text-xs">{PAY_LABEL[o.payment_method] || o.payment_method || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[o.status] || ""}`}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40">
                    <td colSpan={7} className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Разом: {filtered.length} чеків
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold">{fmt(totalRevenue)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground text-xs">{(page - 1) * limit + 1}–{Math.min(page * limit, total)} з {total}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 border rounded hover:bg-muted disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 border rounded bg-primary text-primary-foreground text-xs font-medium">{page}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 border rounded hover:bg-muted disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
