import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, API } from "@/lib/api";
import PosterOrderStatus from "@/components/poster-order-status";
import { useAuth } from "@/hooks/use-auth";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, Plus, Send, QrCode, CreditCard,
  ChefHat, CheckCircle2, Clock, X, Loader2, UtensilsCrossed,
  Receipt, ExternalLink, Trash2, Printer, ShieldCheck, AlertTriangle,
  Scissors, Layers,
} from "lucide-react";

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: "Не відправлено", color: "text-orange-600 bg-orange-50 border border-orange-200" },
  cooking:  { label: "На кухні",       color: "text-blue-600 bg-blue-50"   },
  ready:    { label: "Готово ✓",       color: "text-green-700 bg-green-50" },
  served:   { label: "Подано",         color: "text-gray-500 bg-gray-100"  },
  cancelled:{ label: "Скасовано",      color: "text-red-500 bg-red-50"     },
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  open: "Відкрите", in_kitchen: "На кухні", ready: "Готово", billed: "Закрите", cancelled: "Скасоване",
};

type QRMode = null | "bill" | "pay" | "fiscal";

export default function Order() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [qrMode, setQrMode] = useState<QRMode>(null);
  const [sending, setSending] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatchError, setDispatchError] = useState("");

  // Split state
  const [showSplit, setShowSplit] = useState(false);
  const [splitSelected, setSplitSelected] = useState<Set<number>>(new Set());
  const [splitting, setSplitting] = useState(false);

  // Merge state
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["waiter-order", orderId],
    queryFn: () => apiFetch(`/fb/orders/${orderId}`),
    refetchInterval: 10000,
  });

  // Open orders for merge list
  const { data: openOrdersData } = useQuery({
    queryKey: ["waiter-open-orders"],
    queryFn: () => apiFetch(`/fb/orders?open=true`),
    enabled: showMerge,
  });

  const order = data?.order;
  const items: any[] = data?.items || [];
  const activeItems = items.filter(i => i.status !== "cancelled");
  const needsConfirmation = (item: any) => !item.confirmed_at && (item.requires_confirmation === true || order?.status === "new_guest");
  const pendingGuestItems = activeItems.filter(needsConfirmation);
  const unsentItems = activeItems.filter(i => i.status === "pending" && !i.sent_at && !needsConfirmation(i));
  const splittableItems = activeItems.filter(i => i.status === "pending" && !i.sent_at && !needsConfirmation(i));

  // Open orders excluding current
  const openOrders: any[] = (openOrdersData?.orders || []).filter(
    (o: any) => String(o.id) !== String(orderId) && o.status !== "cancelled" && o.status !== "billed"
  );

  const removeItem = useMutation({
    mutationFn: (itemId: number) =>
      apiFetch(`/fb/order-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["waiter-order", orderId] }); },
  });
  const confirmGuest = useMutation({
    mutationFn: () => apiFetch(`/fb/orders/${orderId}/confirm-guest-items`, {
      method: "POST", body: JSON.stringify({ itemIds: pendingGuestItems.map(i => i.id) }),
    }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["waiter-order", orderId] }),
        qc.invalidateQueries({ queryKey: ["waiter-open-orders"] }),
        qc.invalidateQueries({ queryKey: ["poster-order-status", Number(orderId)] }),
      ]);
    },
  });

  async function printBill() {
    let cfg: any = {};
    try { const d = await apiFetch("/fb/config/section/receipt"); cfg = d.data || {}; } catch {}

    const waiterName = user?.name || "—";
    const now = new Date();
    const estName = cfg.establishment_name || "Maison HD";

    const fmtNum = (n: number) =>
      n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDateTime = (d: Date) =>
      d.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" }) + " " +
      d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

    const openedAt = order.openedAt ? fmtDateTime(new Date(order.openedAt)) : "—";
    const printedAt = fmtDateTime(now);

    const tableLabel = [
      order.tableNumber ? String(order.tableNumber) : "",
      order.tableLocation ? `(${order.tableLocation})` : "",
    ].filter(Boolean).join("") || "—";

    const receiptItems = activeItems;
    const total = receiptItems.reduce(
      (s: number, i: any) => s + parseFloat(i.total_price || i.totalPrice || "0"), 0
    );
    const vatTotal = receiptItems.reduce((s: number, i: any) => {
      const tp = parseFloat(i.total_price || i.totalPrice || "0");
      const rate = parseFloat(i.vat_rate || "0");
      return s + (rate > 0 ? tp - tp / (1 + rate / 100) : 0);
    }, 0);

    const logoHtml = cfg.logo_url
      ? `<div style="text-align:center;margin-bottom:5px"><img src="${cfg.logo_url}" style="max-height:60px;max-width:200px" onerror="this.remove()"/></div>`
      : "";

    const itemsHtml = receiptItems.map((it: any) => {
      const qty = parseFloat(it.quantity || 1);
      const tp  = parseFloat(it.total_price || it.totalPrice || "0");
      const unit = qty > 0 ? tp / qty : 0;
      const qtyLabel = qty % 1 !== 0 ? qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(qty);
      return `<tr>
        <td style="word-break:break-word;padding-right:6px;vertical-align:top">${it.name}</td>
        <td style="text-align:right;white-space:nowrap;vertical-align:top">${qtyLabel}</td>
        <td style="text-align:right;white-space:nowrap;vertical-align:top">${fmtNum(unit)}</td>
        <td style="text-align:right;white-space:nowrap;vertical-align:top">${fmtNum(tp)}</td>
      </tr>`;
    }).join("");

    const win = window.open("", "_blank", "width=420,height=820");
    if (!win) return;

    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Передрахунок</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:11px;padding:12px 14px;max-width:302px;margin:0 auto;color:#111}
  .c{text-align:center}
  hr{border:none;border-top:1px dashed #777;margin:7px 0}
  .m{display:flex;margin:2px 0;font-size:10px;line-height:1.4}
  .ml{color:#444;min-width:86px;flex-shrink:0}
  .mv{color:#111}
  table{width:100%;border-collapse:collapse}
  th{font-size:9px;padding:2px 2px 3px;color:#333;border-bottom:1px solid #888;font-weight:normal}
  th:first-child{text-align:left}
  th:not(:first-child){text-align:right}
  td{font-size:10px;padding:2.5px 2px;line-height:1.35}
  .tr{display:flex;align-items:flex-end;margin:3px 0;font-size:10px}
  .tl{flex-shrink:0}
  .td{flex:1;border-bottom:1px dotted #999;margin:0 3px;min-width:8px;height:9px}
  .tv{flex-shrink:0;font-weight:bold}
  .sm{font-size:9px;color:#555}
  @media print{body{padding:3px 5px}@page{margin:4mm}}
</style></head><body>
${logoHtml}
<div class="c" style="font-size:15px;font-weight:bold;letter-spacing:1px">${estName}</div>
<hr/>
${cfg.print_number !== false && order.receiptNumber ? `<div class="m"><span class="ml">Чек №</span><span class="mv">${order.receiptNumber}</span></div>` : ""}
${cfg.show_waiter !== false ? `<div class="m"><span class="ml">Офіціант</span><span class="mv">${waiterName}</span></div>` : ""}
<div class="m"><span class="ml">Відкрито</span><span class="mv">${openedAt}</span></div>
<div class="m"><span class="ml">Надруковано</span><span class="mv">${printedAt}</span></div>
<div class="m"><span class="ml">Стіл №</span><span class="mv">${tableLabel}</span></div>
<div class="m"><span class="ml">К-сть гостей</span><span class="mv">${order.guestCount || 1}</span></div>
${order.guestName ? `<div class="m"><span class="ml">Гість</span><span class="mv">${order.guestName}</span></div>` : ""}
<hr/>
<table>
  <thead><tr>
    <th>Найменування</th>
    <th>К-сть</th>
    <th>Ціна</th>
    <th>Загалом</th>
  </tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<hr/>
<div class="tr">
  <span class="tl" style="font-weight:bold">До оплати</span>
  <span class="td"></span>
  <span class="tv">${fmtNum(total)}&nbsp;грн</span>
</div>
<div class="tr">
  <span class="tl sm">в т.ч. ПДВ</span>
  <span class="td"></span>
  <span class="tv sm">${fmtNum(vatTotal)}&nbsp;грн</span>
</div>
${cfg.guest_message ? `<hr/><div class="c sm" style="font-style:italic;margin:3px 0">${cfg.guest_message}</div>` : ""}
${cfg.show_qr && cfg.qr_url ? `<hr/><div class="c"><img src="https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(cfg.qr_url)}" style="width:90px;height:90px"/><div class="sm" style="margin-top:2px">Відскануйте QR</div></div>` : ""}
${cfg.print_wifi && cfg.wifi_name ? `<hr/><div class="c sm">Wi-Fi: <b>${cfg.wifi_name}</b>${cfg.wifi_password ? `<br/>Пароль: ${cfg.wifi_password}` : ""}</div>` : ""}
${cfg.footer_text ? `<hr/><div class="c sm">${cfg.footer_text}</div>` : ""}
<hr/>
<div class="c sm">Дякуємо за відвідування!</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`);
    win.document.close();
  }

  async function sendToKitchen() {
    if (sending || !unsentItems.length) return;
    setSending(true);
    setDispatchMessage(""); setDispatchError("");
    try {
      const result = await apiFetch(`/fb/orders/${orderId}/dispatch-items`, {
        method: "POST", body: JSON.stringify({ itemIds: unsentItems.map(item => item.id) }),
      });
      setDispatchMessage(result.message);
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : "Відправлення не підтверджено. Перевірте статус.");
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["waiter-order", orderId] }),
        qc.invalidateQueries({ queryKey: ["waiter-open-orders"] }),
        qc.invalidateQueries({ queryKey: ["poster-order-status", Number(orderId)] }),
      ]);
      setSending(false);
    }
  }

  async function doSplit() {
    if (splitSelected.size === 0) return;
    setSplitting(true);
    try {
      const res = await apiFetch(`/fb/orders/${orderId}/split`, {
        method: "POST",
        body: JSON.stringify({ itemIds: Array.from(splitSelected) }),
      });
      qc.invalidateQueries({ queryKey: ["waiter-order", orderId] });
      qc.invalidateQueries({ queryKey: ["waiter-open-orders"] });
      setShowSplit(false);
      setSplitSelected(new Set());
      if (res?.newOrderId) {
        setLocation(`/order/${res.newOrderId}`);
      }
    } finally { setSplitting(false); }
  }

  async function doMerge() {
    if (!mergeTargetId) return;
    setMerging(true);
    try {
      await apiFetch(`/fb/orders/${orderId}/merge`, {
        method: "POST",
        body: JSON.stringify({ sourceOrderId: mergeTargetId }),
      });
      qc.invalidateQueries({ queryKey: ["waiter-order", orderId] });
      qc.invalidateQueries({ queryKey: ["waiter-open-orders"] });
      setShowMerge(false);
      setMergeTargetId(null);
    } finally { setMerging(false); }
  }

  function toggleSplitItem(id: number) {
    setSplitSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const conciergeBase = window.location.origin + import.meta.env.BASE_URL.replace(/\/waiter\/?/, "/room-concierge");
  const billUrl = `${conciergeBase}bill/${orderId}`;
  const payUrl  = `${conciergeBase}pay/${orderId}`;

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6">
      <UtensilsCrossed className="w-12 h-12 text-muted-foreground" />
      <p className="text-muted-foreground">Замовлення не знайдено</p>
      <button onClick={() => setLocation("/tables")} className="text-blue-600 font-medium">← Назад до столів</button>
    </div>
  );

  const hasFiscal = order.fiscalStatus === "done" && order.fiscalReceiptUrl;
  const fiscalError = order.fiscalStatus === "error";

  // QR Dialog overlay
  if (qrMode) {
    const isFiscalMode = qrMode === "fiscal";
    const isPayMode = qrMode === "pay";
    const url = isFiscalMode ? order.fiscalReceiptUrl : (isPayMode ? payUrl : billUrl);
    const title = isFiscalMode ? "Фіскальний чек" : (isPayMode ? "QR для оплати" : "QR рахунку");
    const subtitle = isFiscalMode
      ? "Офіційний чек ДПС — Checkbox"
      : (isPayMode ? "Гість сканує та оплачує" : "Гість сканує та бачить рахунок");
    const headerColor = isFiscalMode ? "bg-emerald-600" : (isPayMode ? "bg-green-600" : "bg-blue-600");

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className={`text-white px-4 pt-12 pb-4 safe-top ${headerColor}`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setQrMode(null)} className="p-2 -ml-1 rounded-xl bg-white/20">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold">{title}</h1>
              <p className="text-sm opacity-80">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="bg-white rounded-3xl p-6 shadow-xl">
            <QRCodeSVG value={url} size={220} level="M" includeMargin={false} />
          </div>

          <div className="text-center space-y-1">
            {isFiscalMode ? (
              <>
                <div className="flex items-center justify-center gap-1.5 text-emerald-600 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  Фіскалізовано · ДПС
                </div>
                {order.receiptNumber && (
                  <div className="text-sm text-muted-foreground">Чек {order.receiptNumber}</div>
                )}
              </>
            ) : (
              <>
                <div className="font-bold text-lg">Стіл №{order.tableNumber || "—"}</div>
                <div className="text-2xl font-black text-blue-700">{parseFloat(order.totalAmount || "0").toFixed(2)} ₴</div>
              </>
            )}
            <div className="text-xs text-muted-foreground break-all max-w-xs">{url}</div>
          </div>

          <a href={url} target="_blank" rel="noopener noreferrer"
            className={`flex items-center gap-2 font-medium text-sm ${isFiscalMode ? "text-emerald-600" : "text-blue-600"}`}>
            <ExternalLink className="w-4 h-4" />
            {isFiscalMode ? "Відкрити фіскальний чек" : "Відкрити сторінку"}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className={`text-white px-4 pt-12 pb-4 safe-top ${order.status === "billed" ? "bg-emerald-600" : "bg-blue-600"}`}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setLocation("/tables")} className="p-2 -ml-1 rounded-xl bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Стіл №{order.tableNumber || "—"}</h1>
            <p className="text-white/80 text-sm">{order.guestName} · {ORDER_STATUS_LABEL[order.status] || order.status}</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-black">{parseFloat(order.totalAmount || "0").toFixed(2)} ₴</div>
            <div className="text-xs text-white/70">{activeItems.length} позицій</div>
          </div>
        </div>
      </div>

      {/* Fiscal receipt banner */}
      {order.status === "billed" && (
        <div className={`mx-4 mt-4 rounded-2xl p-4 ${hasFiscal ? "bg-emerald-50 border border-emerald-200" : fiscalError ? "bg-amber-50 border border-amber-200" : "bg-gray-50 border border-gray-200"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${hasFiscal ? "bg-emerald-100" : fiscalError ? "bg-amber-100" : "bg-gray-100"}`}>
              {hasFiscal
                ? <ShieldCheck className="w-5 h-5 text-emerald-600" />
                : fiscalError
                  ? <AlertTriangle className="w-5 h-5 text-amber-600" />
                  : <Receipt className="w-5 h-5 text-gray-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              {hasFiscal ? (
                <>
                  <div className="text-sm font-semibold text-emerald-700">Фіскальний чек сформовано</div>
                  <div className="text-xs text-emerald-600 mt-0.5">Checkbox · ДПС України</div>
                </>
              ) : fiscalError ? (
                <>
                  <div className="text-sm font-semibold text-amber-700">Помилка фіскалізації</div>
                  <div className="text-xs text-amber-600 mt-0.5">Перевірте ПРРО в HMS</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-gray-600">Замовлення закрито</div>
                  <div className="text-xs text-gray-400 mt-0.5">Фіскалізація не підключена</div>
                </>
              )}
            </div>
            {hasFiscal && (
              <button
                onClick={() => setQrMode("fiscal")}
                className="shrink-0 bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
              >
                QR чек
              </button>
            )}
          </div>
          {hasFiscal && (
            <a
              href={order.fiscalReceiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-600 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Відкрити фіскальний чек на receipt.checkbox.ua
            </a>
          )}
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-safe">
        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <UtensilsCrossed className="w-8 h-8" />
            <p className="text-sm">Замовлення порожнє</p>
          </div>
        ) : activeItems.map(item => {
          const st = needsConfirmation(item)
            ? { label: "Чекає підтвердження", color: "text-amber-800 bg-amber-50 border border-amber-200" }
            : item.sent_at && item.status === "pending"
            ? { label: "Відправлення зареєстровано", color: "text-blue-700 bg-blue-50" }
            : ITEM_STATUS[item.status] || ITEM_STATUS.pending;
          const qty = parseFloat(item.quantity || 1);
          const qtyLabel = qty % 1 !== 0 ? qty.toFixed(2).replace(/\.?0+$/, "") : String(qty);
          return (
            <div key={item.id} className="bg-card border rounded-2xl p-3.5 flex items-start gap-3">
              <div className="flex-1">
                <div className="font-semibold text-sm leading-tight">{item.name}</div>
                {item.notes && <div className="text-xs text-muted-foreground mt-0.5">{item.notes}</div>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                  <span className="text-xs text-muted-foreground">×{qtyLabel}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-sm">{parseFloat(item.total_price || item.totalPrice || "0").toFixed(0)} ₴</div>
                {item.status === "pending" && !item.sent_at && (
                  <button onClick={() => removeItem.mutate(item.id)}
                    className="mt-1 p-1 text-red-400 hover:text-red-600 active:scale-90 transition-transform">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="px-4 pb-6 pt-3 space-y-3 border-t bg-background safe-bottom">
        <PosterOrderStatus orderId={Number(orderId)} />
        {(pendingGuestItems.length > 0 || confirmGuest.isError) && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3" data-testid="panel-qr-confirmation">
            <h3 className="font-semibold">Нові позиції від гостя: {pendingGuestItems.length}</h3>
            <p className="text-sm text-amber-900">Перевірте страви й кількість. До підтвердження ці позиції не передаються в Poster або на кухню.</p>
            {confirmGuest.isError && <p role="alert" className="text-sm text-red-700">{(confirmGuest.error as Error).message}</p>}
            {data?.posterManaged ? (
              <p className="text-sm text-amber-950" data-testid="text-qr-poster-acceptance">
                QR-замовлення має прийматися на касі Poster. Передавання QR на касу ще не підключене; підтвердження тут недоступне.
              </p>
            ) : <button type="button" data-testid="button-confirm-qr-order"
              disabled={confirmGuest.isPending || pendingGuestItems.length === 0}
              onClick={() => confirmGuest.mutate()}
              className="w-full rounded-xl bg-amber-800 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {confirmGuest.isPending ? "Підтвердження…" : "Підтвердити QR-замовлення"}
            </button>}
            <p className="text-xs text-amber-900">Підтвердження не означає друку: стан передавання в Poster показано окремо.</p>
          </section>
        )}

        {/* Add items */}
        {order.status !== "billed" && order.status !== "cancelled" && (
          <button onClick={() => setLocation(`/menu/${orderId}`)}
            className="w-full py-3.5 rounded-2xl border-2 border-blue-600 text-blue-600 font-bold text-base active:scale-95 transition-transform flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> Додати страви
          </button>
        )}

        {/* Send to kitchen */}
        {dispatchMessage && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{dispatchMessage}</p>}
        {dispatchError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{dispatchError}</p>}
        {unsentItems.length > 0 && (
          <button onClick={sendToKitchen} disabled={sending}
            className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-bold text-base active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
            {sending
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Відправка...</>
              : <><ChefHat className="w-5 h-5" /> Відправити встречку ({unsentItems.length})</>
            }
          </button>
        )}

        {/* Split / Merge / Print / QR */}
        {order.status !== "cancelled" && activeItems.length > 0 && order.status !== "billed" && (
          <>
            {/* Split & Merge row */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setSplitSelected(new Set()); setShowSplit(true); }}
                className="py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                <Scissors className="w-4 h-4" /> Розділити
              </button>
              <button
                onClick={() => setShowMerge(true)}
                className="py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                <Layers className="w-4 h-4" /> Об'єднати
              </button>
            </div>

            {/* Print / QR row */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={printBill}
                className="py-3 rounded-2xl bg-gray-50 border border-gray-200 text-gray-700 font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                <Printer className="w-4 h-4" /> Рахунок
              </button>
              <button onClick={() => setQrMode("bill")}
                className="py-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                <QrCode className="w-4 h-4" /> QR Рах.
              </button>
              <button onClick={() => setQrMode("pay")}
                className="py-3 rounded-2xl bg-green-50 border border-green-200 text-green-700 font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                <CreditCard className="w-4 h-4" /> QR Опл.
              </button>
            </div>
          </>
        )}

        {/* Back to tables when billed */}
        {order.status === "billed" && (
          <button onClick={() => setLocation("/tables")}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-base active:scale-95 transition-transform flex items-center justify-center gap-2">
            <ArrowLeft className="w-5 h-5" /> Назад до столів
          </button>
        )}
      </div>

      {/* ══ SPLIT BOTTOM SHEET ══════════════════════════════════ */}
      {showSplit && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSplit(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-5 border-b shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-base">Розділити рахунок</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Виберіть позиції для окремого рахунку</p>
                </div>
                <button onClick={() => setShowSplit(false)} className="p-2 rounded-xl bg-gray-100">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {splittableItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Scissors className="w-8 h-8 opacity-30" />
                <p className="text-sm">Немає позицій для розділення</p>
                <p className="text-xs text-center px-6">Лише незвідправлені позиції можна перенести</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {splittableItems.map((item: any) => {
                  const selected = splitSelected.has(item.id);
                  const qty = parseFloat(item.quantity || 1);
                  const qtyLabel = qty % 1 !== 0 ? qty.toFixed(2).replace(/\.?0+$/, "") : String(qty);
                  return (
                    <button key={item.id}
                      onClick={() => toggleSplitItem(item.id)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                        selected ? "border-amber-400 bg-amber-50" : "border-border bg-card"
                      }`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected ? "bg-amber-400 border-amber-400" : "border-gray-300"
                      }`}>
                        {selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="flex-1 text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">×{qtyLabel}</span>
                      <span className="text-sm font-bold text-gray-700">
                        {parseFloat(item.total_price || item.totalPrice || "0").toFixed(0)} ₴
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-4 border-t shrink-0 space-y-2">
              {splitSelected.size > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  Обрано {splitSelected.size} позицій — буде відкрито новий рахунок
                </p>
              )}
              <button
                onClick={doSplit}
                disabled={splitSelected.size === 0 || splitting}
                className="w-full py-4 rounded-2xl bg-amber-500 text-white font-bold text-base active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {splitting
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Розділяємо...</>
                  : <><Scissors className="w-5 h-5" /> Розділити ({splitSelected.size})</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MERGE BOTTOM SHEET ══════════════════════════════════ */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMerge(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-5 border-b shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-base">Об'єднати рахунки</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Позиції з обраного столу перейдуть до Столу №{order.tableNumber || "?"}
                  </p>
                </div>
                <button onClick={() => setShowMerge(false)} className="p-2 rounded-xl bg-gray-100">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {openOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Layers className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Немає інших відкритих замовлень</p>
                </div>
              ) : openOrders.map((o: any) => {
                const selected = mergeTargetId === o.id;
                return (
                  <button key={o.id}
                    onClick={() => setMergeTargetId(selected ? null : o.id)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                      selected ? "border-emerald-400 bg-emerald-50" : "border-border bg-card"
                    }`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selected ? "bg-emerald-500 border-emerald-500" : "border-gray-300"
                    }`}>
                      {selected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        Стіл №{o.tableNumber || o.table_number || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{o.guestName || o.guest_name || ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">{parseFloat(o.totalAmount || o.total_amount || "0").toFixed(0)} ₴</p>
                      <p className="text-xs text-muted-foreground">{ORDER_STATUS_LABEL[o.status] || o.status}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-4 border-t shrink-0 space-y-2">
              {mergeTargetId && (
                <p className="text-xs text-center text-muted-foreground">
                  Обраний рахунок буде закрито, позиції перейдуть сюди
                </p>
              )}
              <button
                onClick={doMerge}
                disabled={!mergeTargetId || merging}
                className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-base active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {merging
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Об'єднуємо...</>
                  : <><Layers className="w-5 h-5" /> Об'єднати</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
