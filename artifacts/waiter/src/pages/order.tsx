import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, API } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, Plus, Minus, Send, QrCode, CreditCard,
  ChefHat, CheckCircle2, Clock, X, Loader2, UtensilsCrossed,
  Receipt, ExternalLink, Trash2,
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

type QRMode = null | "bill" | "pay";

export default function Order() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [qrMode, setQrMode] = useState<QRMode>(null);
  const [sending, setSending] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["waiter-order", orderId],
    queryFn: () => apiFetch(`/fb/orders/${orderId}`),
    refetchInterval: 10000,
  });

  const order = data?.order;
  const items: any[] = data?.items || [];
  const activeItems = items.filter(i => i.status !== "cancelled");
  const unsentItems = activeItems.filter(i => i.status === "pending" && !i.sent_at);

  const removeItem = useMutation({
    mutationFn: (itemId: number) =>
      apiFetch(`/fb/order-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["waiter-order", orderId] }); },
  });

  async function sendToKitchen() {
    setSending(true);
    try {
      await apiFetch(`/fb/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "in_kitchen" }),
      });
      for (const item of unsentItems) {
        await apiFetch(`/fb/order-items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "cooking" }),
        });
      }
      qc.invalidateQueries({ queryKey: ["waiter-order", orderId] });
      qc.invalidateQueries({ queryKey: ["waiter-tables"] });
    } finally { setSending(false); }
  }

  // Build QR URLs
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

  // QR Dialog overlay
  if (qrMode) {
    const isPayMode = qrMode === "pay";
    const url = isPayMode ? payUrl : billUrl;
    const title = isPayMode ? "QR для оплати" : "QR рахунку";
    const subtitle = isPayMode
      ? "Гість сканує та оплачує"
      : "Гість сканує та бачить рахунок";

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className={`text-white px-4 pt-12 pb-4 safe-top ${isPayMode ? "bg-green-600" : "bg-blue-600"}`}>
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
            <div className="font-bold text-lg">Стіл №{order.tableNumber || "—"}</div>
            <div className="text-2xl font-black text-blue-700">{parseFloat(order.totalAmount || "0").toFixed(2)} ₴</div>
            <div className="text-xs text-muted-foreground break-all max-w-xs">{url}</div>
          </div>

          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 font-medium text-sm">
            <ExternalLink className="w-4 h-4" /> Відкрити сторінку
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-4 safe-top">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setLocation("/tables")} className="p-2 -ml-1 rounded-xl bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Стіл №{order.tableNumber || "—"}</h1>
            <p className="text-blue-200 text-sm">{order.guestName} · {ORDER_STATUS_LABEL[order.status] || order.status}</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-black">{parseFloat(order.totalAmount || "0").toFixed(2)} ₴</div>
            <div className="text-xs text-blue-200">{activeItems.length} позицій</div>
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-safe">
        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <UtensilsCrossed className="w-8 h-8" />
            <p className="text-sm">Замовлення порожнє</p>
          </div>
        ) : activeItems.map(item => {
          const st = ITEM_STATUS[item.status] || ITEM_STATUS.pending;
          return (
            <div key={item.id} className="bg-card border rounded-2xl p-3.5 flex items-start gap-3">
              <div className="flex-1">
                <div className="font-semibold text-sm leading-tight">{item.name}</div>
                {item.notes && <div className="text-xs text-muted-foreground mt-0.5">{item.notes}</div>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                  <span className="text-xs text-muted-foreground">×{item.quantity}</span>
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
        {/* Add items */}
        {order.status !== "billed" && order.status !== "cancelled" && (
          <button onClick={() => setLocation(`/menu/${orderId}`)}
            className="w-full py-3.5 rounded-2xl border-2 border-blue-600 text-blue-600 font-bold text-base active:scale-95 transition-transform flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> Додати страви
          </button>
        )}

        {/* Send to kitchen */}
        {unsentItems.length > 0 && (
          <button onClick={sendToKitchen} disabled={sending}
            className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-bold text-base active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
            {sending
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Відправка...</>
              : <><ChefHat className="w-5 h-5" /> Відправити на кухню ({unsentItems.length})</>
            }
          </button>
        )}

        {/* QR buttons */}
        {order.status !== "cancelled" && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setQrMode("bill")}
              className="py-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1.5">
              <QrCode className="w-4 h-4" /> QR Рахунок
            </button>
            <button onClick={() => setQrMode("pay")}
              className="py-3 rounded-2xl bg-green-50 border border-green-200 text-green-700 font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1.5">
              <CreditCard className="w-4 h-4" /> QR Оплата
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
