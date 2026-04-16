import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  QrCode, RefreshCw, Printer, ExternalLink, Clock,
  CheckCircle2, Loader2, ChevronDown,
  ChevronRight, Copy, Check, Table2, Eye, ShoppingBag,
  Plus, Pencil, Trash2, X, Save, LayoutGrid, Users,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_FB = BASE.replace("/maison-hd", "") + "/api/fb";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${API_FB}${path}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  open:       { label: "Відкрито",   color: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-400" },
  in_kitchen: { label: "На кухні",   color: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400 animate-pulse" },
  ready:      { label: "Готово",     color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
  served:     { label: "Подано",     color: "bg-gray-50 text-gray-600 border-gray-200",        dot: "bg-gray-300" },
  billed:     { label: "Сплачено",   color: "bg-purple-50 text-purple-700 border-purple-200",  dot: "bg-purple-400" },
  cancelled:  { label: "Скасовано",  color: "bg-red-50 text-red-600 border-red-200",           dot: "bg-red-400" },
};

const fmtTime  = (d: string) => new Date(d).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const fmtMoney = (n: any)    => parseFloat(n || 0).toLocaleString("uk-UA") + " ₴";

type Table = { id: number; number: string; location: string; capacity: number; status: string; isActive: boolean; currentOrderId?: number };

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

// ── Table Form Modal ──────────────────────────────────────────────────────────
function TableFormModal({ table, existingSections, onSave, onClose, isSaving }: {
  table?: Table; existingSections: string[];
  onSave: (data: { number: string; location: string; capacity: number }) => void;
  onClose: () => void;
  isSaving?: boolean;
}) {
  const [number,   setNumber]   = useState(table?.number   || "");
  const [location, setLocation] = useState(table?.location || "");
  const [capacity, setCapacity] = useState(String(table?.capacity || 2));
  const [customLoc, setCustomLoc] = useState(false);

  const sections = [...new Set(existingSections)].filter(Boolean).sort();
  const isEdit = !!table;

  const handleSave = () => {
    if (!number.trim() || !location.trim()) return;
    onSave({ number: number.trim(), location: location.trim(), capacity: parseInt(capacity) || 2 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{isEdit ? "Редагувати стіл" : "Новий стіл / кімната"}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Number/Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Номер / назва *</label>
            <input
              value={number} onChange={e => setNumber(e.target.value)}
              placeholder="напр. 1, VIP-2, Котедж А, Кімната 101..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200"
              autoFocus
            />
          </div>

          {/* Section / Zone */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Зал / зона / поверх *</label>
            {sections.length > 0 && !customLoc ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {sections.map(s => (
                    <button key={s} onClick={() => setLocation(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                        location === s
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-300"
                      }`}>
                      {s}
                    </button>
                  ))}
                  <button onClick={() => { setCustomLoc(true); setLocation(""); }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-400 hover:border-violet-400 hover:text-violet-500 transition-colors">
                    + Новий зал
                  </button>
                </div>
                {!location && (
                  <p className="text-xs text-gray-400">Виберіть або додайте новий зал</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="напр. Основний зал, VIP-зона, Тераса, 2-й поверх..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200"
                />
                {sections.length > 0 && (
                  <button onClick={() => setCustomLoc(false)}
                    className="px-2 py-2.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors whitespace-nowrap">
                    З лист.
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Місткість (кількість місць)</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setCapacity(c => String(Math.max(1, parseInt(c || "2") - 1)))}
                className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors">
                −
              </button>
              <span className="text-xl font-bold text-gray-900 w-10 text-center">{capacity || "2"}</span>
              <button onClick={() => setCapacity(c => String(Math.min(50, parseInt(c || "2") + 1)))}
                className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 transition-colors">
                +
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            Скасувати
          </button>
          <button onClick={handleSave} disabled={!number.trim() || !location.trim() || isSaving}
            className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? "Зберегти" : "Додати"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QrOrderingPage() {
  const qc = useQueryClient();
  const [expandedTable,    setExpandedTable]    = useState<number | null>(null);
  const [orgSlug,          setOrgSlug]          = useState<string>("");
  const [orderStatusFilter,setOrderStatusFilter]= useState("active");
  const [tableModal,       setTableModal]       = useState<"new" | Table | null>(null);
  const [deleteConfirm,    setDeleteConfirm]    = useState<number | null>(null);
  const [activeTab,        setActiveTab]        = useState<"qr" | "orders">("qr");

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ["fb-tables-qr"],
    queryFn: async () => {
      const r = await apiFetch("/tables");
      const d = await r.json();
      return (d.tables || []) as Table[];
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

  const slug   = meData?.organization?.slug || orgSlug || "dogoda";
  const tables: Table[] = tablesData || [];
  const orders: any[]   = ordersData || [];

  const sections = [...new Set(tables.map(t => t.location))].filter(Boolean).sort();

  const activeOrders  = orders.filter(o => ["open", "in_kitchen", "ready"].includes(o.status));
  const displayOrders = orderStatusFilter === "active"
    ? activeOrders
    : orders.filter(o => ["served", "billed"].includes(o.status)).slice(0, 30);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateOrderStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-orders-qr"] }),
  });

  const createTable = useMutation({
    mutationFn: (data: { number: string; location: string; capacity: number }) =>
      apiFetch("/tables", { method: "POST", body: JSON.stringify({ ...data, isActive: true }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tables-qr"] }); setTableModal(null); },
  });

  const updateTable = useMutation({
    mutationFn: ({ id, ...data }: { id: number; number: string; location: string; capacity: number }) =>
      apiFetch(`/tables/${id}`, { method: "PATCH", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tables-qr"] }); setTableModal(null); },
  });

  const deleteTable = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/tables/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tables-qr"] }); setDeleteConfirm(null); },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const guestMenuUrl = (tableId: number) => `${window.location.origin}${BASE}/qr-menu/${slug}/${tableId}`;

  const printQr = (tableId: number, tableNum: string) => {
    const url = guestMenuUrl(tableId);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>QR ${tableNum}</title><style>
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:20px;text-align:center}
      h1{font-size:2rem;font-weight:bold;margin-bottom:4px}
      p{color:#666;font-size:0.9rem;margin-bottom:20px}
      img{border:4px solid #e5e7eb;border-radius:16px;display:block;margin:0 auto}
      small{margin-top:16px;color:#999;word-break:break-all;max-width:320px;display:block;font-size:0.7rem}
    </style></head><body>
      <h1>${tableNum}</h1>
      <p>Скануйте QR для замовлення</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=300x300&bgcolor=ffffff&color=1e1b4b&margin=6" width="300" height="300"/>
      <small>${url}</small>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    w.document.close();
  };

  const handleSaveTable = useCallback((data: { number: string; location: string; capacity: number }) => {
    if (tableModal === "new") {
      createTable.mutate(data);
    } else if (tableModal && typeof tableModal === "object") {
      updateTable.mutate({ id: tableModal.id, ...data });
    }
  }, [tableModal, createTable, updateTable]);

  // ── Group tables by section ────────────────────────────────────────────────
  const tablesBySection = tables.reduce<Record<string, Table[]>>((acc, t) => {
    const key = t.location || "Без зони";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

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
          <div className="flex gap-2">
            <button onClick={() => setTableModal("new")}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Додати стіл
            </button>
            <button onClick={() => { qc.invalidateQueries({ queryKey: ["fb-tables-qr"] }); qc.invalidateQueries({ queryKey: ["fb-orders-qr"] }); }}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 bg-white rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Столів / кімнат", value: tables.length, color: "text-violet-700" },
            { label: "Активних замовлень", value: activeOrders.length, color: "text-orange-600" },
            { label: "На кухні", value: orders.filter(o => o.status === "in_kitchen").length, color: "text-amber-600" },
            { label: "Готово до видачі", value: orders.filter(o => o.status === "ready").length, color: "text-emerald-600" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([
            { key: "qr",     label: "Столи та QR-коди", icon: LayoutGrid },
            { key: "orders", label: `Замовлення${activeOrders.length > 0 ? ` (${activeOrders.length})` : ""}`, icon: ShoppingBag },
          ] as { key: "qr" | "orders"; label: string; icon: any }[]).map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key ? "bg-white text-violet-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB: QR Codes / Tables ── */}
        {activeTab === "qr" && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-violet-600" />
                <h2 className="font-semibold text-gray-900 text-sm">Столи, кімнати, котеджі</h2>
              </div>
              <span className="text-xs text-gray-400">
                URL: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/qr-menu/{slug}/ID</code>
              </span>
            </div>

            {tablesLoading ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : tables.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Table2 className="w-8 h-8 text-violet-300" />
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">Столів ще немає</p>
                <p className="text-xs text-gray-400 mb-4">Додайте столи, кімнати або будинки для генерації QR</p>
                <button onClick={() => setTableModal("new")}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
                  <Plus className="w-4 h-4" /> Додати перший стіл
                </button>
              </div>
            ) : (
              <div>
                {Object.entries(tablesBySection).map(([sectionName, sectionTables]) => (
                  <div key={sectionName}>
                    {/* Section header */}
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 border-y border-gray-100">
                      <LayoutGrid className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{sectionName}</span>
                      <span className="text-xs text-gray-400">· {sectionTables.length} місць</span>
                    </div>

                    {/* Tables in section */}
                    <div className="divide-y divide-gray-50">
                      {sectionTables.map(table => {
                        const url        = guestMenuUrl(table.id);
                        const isExpanded = expandedTable === table.id;
                        const tableOrders= orders.filter(o => o.tableId === table.id && ["open","in_kitchen","ready"].includes(o.status));
                        const isOccupied = tableOrders.length > 0 || table.status === "occupied";

                        return (
                          <div key={table.id}>
                            <div
                              className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? "bg-violet-50/40" : ""}`}
                              onClick={() => setExpandedTable(isExpanded ? null : table.id)}>

                              {/* Badge */}
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                isOccupied ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700"
                              }`}>
                                {String(table.number).length > 3 ? String(table.number).substring(0, 3) : table.number}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-800">Стіл {table.number}</p>
                                  {isOccupied && (
                                    <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">зайнятий</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {table.capacity} місць
                                  {tableOrders.length > 0 && (
                                    <span className="text-orange-500 ml-1">· {tableOrders.length} активне замовлення</span>
                                  )}
                                </p>
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                <button onClick={() => window.open(url, "_blank")}
                                  className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Відкрити меню">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => printQr(table.id, table.number)}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Друк QR">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <CopyButton text={url} />
                                <button onClick={() => setTableModal(table)}
                                  className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Редагувати">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setDeleteConfirm(table.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Видалити">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {isExpanded
                                ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            </div>

                            {/* Expanded: QR code + link */}
                            {isExpanded && (
                              <div className="px-5 py-4 bg-violet-50/40 border-t border-violet-100">
                                <div className="flex gap-6 flex-wrap">
                                  <div className="flex flex-col items-center">
                                    <QrImage url={url} size={140} />
                                    <p className="text-xs text-gray-500 mt-2 text-center">Стіл {table.number}</p>
                                  </div>
                                  <div className="flex-1 min-w-[200px] space-y-2">
                                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">QR-посилання для гостя</p>
                                    <div className="flex items-center gap-2 bg-white border border-violet-200 rounded-xl px-3 py-2">
                                      <code className="text-xs text-gray-600 flex-1 break-all">{url}</code>
                                      <CopyButton text={url} />
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => window.open(url, "_blank")}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-medium">
                                        <ExternalLink className="w-3.5 h-3.5" /> Відкрити меню
                                      </button>
                                      <button onClick={() => printQr(table.id, table.number)}
                                        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-xs font-medium">
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Orders ── */}
        {activeTab === "orders" && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-violet-600" />
                <h2 className="font-semibold text-gray-900 text-sm">Замовлення від гостей</h2>
                {activeOrders.length > 0 && (
                  <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">{activeOrders.length}</span>
                )}
              </div>
              <div className="flex gap-2">
                {(["active", "done"] as const).map(f => (
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
              <div className="py-16 text-center">
                <ShoppingBag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {orderStatusFilter === "active" ? "Немає активних замовлень" : "Немає завершених замовлень"}
                </p>
                <p className="text-xs text-gray-400 mt-1">Замовлення від гостей через QR з'являться тут в реальному часі</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {["№", "Стіл / Кімната", "Гість", "Час", "Сума", "Статус", "Дія"].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayOrders.map((order: any) => {
                      const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.open;
                      const tableInfo = tables.find(t => t.id === order.tableId);
                      return (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">#{order.id}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800 text-sm">
                              {tableInfo ? `Стіл ${tableInfo.number}` : order.roomNumber || "Без столу"}
                            </p>
                            <p className="text-xs text-gray-400">
                              {tableInfo?.location || (order.orderType === "dine_in" ? "В залі" : "Сервіс")}
                            </p>
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
                                <button onClick={() => updateOrderStatus.mutate({ id: order.id, status: "in_kitchen" })}
                                  className="text-xs px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg transition-colors">
                                  На кухню
                                </button>
                              )}
                              {order.status === "in_kitchen" && (
                                <button onClick={() => updateOrderStatus.mutate({ id: order.id, status: "ready" })}
                                  className="text-xs px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg transition-colors">
                                  Готово
                                </button>
                              )}
                              {order.status === "ready" && (
                                <button onClick={() => updateOrderStatus.mutate({ id: order.id, status: "served" })}
                                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                                  Подано
                                </button>
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
        )}

        {/* ── Info ── */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <QrCode className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-violet-700 space-y-1">
              <p className="font-medium">Як працює QR-замовлення?</p>
              <p>1. Додайте стіл / кімнату / будинок кнопкою «Додати стіл» вище</p>
              <p>2. Роздрукуйте або поділіться QR-кодом для кожного місця</p>
              <p>3. Гість сканує QR → бачить меню на смартфоні, обирає і замовляє</p>
              <p>4. Замовлення з'являється на вкладці «Замовлення» — офіціант переводить статус: Відкрито → На кухні → Готово → Подано</p>
              <p>5. Стіл також відображається у Станції офіціанта як зайнятий — там можна провести оплату</p>
            </div>
          </div>
        </div>

      </div>

      {/* ── Table Form Modal ── */}
      {tableModal !== null && (
        <TableFormModal
          table={tableModal === "new" ? undefined : tableModal}
          existingSections={sections}
          onSave={handleSaveTable}
          onClose={() => setTableModal(null)}
          isSaving={createTable.isPending || updateTable.isPending}
        />
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm !== null && (() => {
        const toDel = tables.find(t => t.id === deleteConfirm);
        return (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-center font-semibold text-gray-900 mb-1">Видалити стіл?</h3>
              <p className="text-center text-sm text-gray-500 mb-5">
                {toDel
                  ? `Стіл ${toDel.number} (${toDel.location}) буде деактивовано. Існуючі замовлення залишаться.`
                  : "Стіл буде деактивовано."}
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                  Скасувати
                </button>
                <button type="button"
                  onClick={() => { const id = deleteConfirm; if (id !== null) deleteTable.mutate(id); }}
                  disabled={deleteTable.isPending}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {deleteTable.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Видалити
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppLayout>
  );
}
