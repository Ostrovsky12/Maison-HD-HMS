import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard, Loader2, UtensilsCrossed, CheckCircle2,
  Banknote, ArrowLeft, Bell, Smartphone,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/room-concierge\/?$/, "") + "/api";

async function fetchPublicBill(orderId: string) {
  const r = await fetch(`${API_BASE}/fb/public/bill/${orderId}`);
  if (!r.ok) throw new Error("Рахунок не знайдено");
  return r.json();
}

async function requestPayment(tableId: number, method: "cash" | "terminal") {
  const r = await fetch(`${API_BASE}/fb/public/request-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId, method }),
  });
  if (!r.ok) throw new Error("Помилка сповіщення");
  return r.json();
}

export default function Pay() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();
  const [sent, setSent] = useState<"cash" | "terminal" | null>(null);
  const [sending, setSending] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-bill", orderId],
    queryFn: () => fetchPublicBill(orderId!),
    refetchInterval: 15000,
  });

  async function handlePayment(method: "cash" | "terminal") {
    if (!data?.order?.table_id || sending) return;
    setSending(true);
    try {
      await requestPayment(data.order.table_id, method);
      setSent(method);
    } catch {
      // silently ignore — notification might still arrive
      setSent(method);
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F5F0] gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F5F0] gap-3 p-6">
      <UtensilsCrossed className="w-12 h-12 text-stone-400" />
      <p className="font-semibold text-stone-700">Рахунок не знайдено</p>
    </div>
  );

  const { order } = data;
  const total = parseFloat(order.total_amount || "0");
  const isPaid = order.status === "billed";

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 mb-2">
            <CreditCard className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Оплата</h1>
          <p className="text-stone-500 text-sm">
            Стіл {order.table_number ? `№${order.table_number}` : "—"}
          </p>
        </div>

        {/* Total */}
        <div className="bg-white rounded-2xl px-5 py-5 shadow-sm text-center">
          <p className="text-stone-500 text-sm mb-1">До сплати</p>
          <p className="text-4xl font-black text-stone-900">{total.toFixed(2)} <span className="text-2xl">₴</span></p>
        </div>

        {/* Paid */}
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-6 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <div className="text-center">
              <div className="font-bold text-green-800 text-lg">Оплачено!</div>
              <div className="text-green-600 text-sm mt-1">Дякуємо за ваш візит у Maison HD</div>
            </div>
          </div>
        ) : sent ? (
          /* ── Confirmation after choosing payment method ── */
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Bell className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <div className="font-bold text-stone-900 text-lg">
                {sent === "terminal" ? "Офіціант несе термінал" : "Офіціант іде до вас"}
              </div>
              <div className="text-stone-500 text-sm mt-1">
                {sent === "terminal"
                  ? "Очікуйте — персонал вже отримав сповіщення про термінал"
                  : "Очікуйте — персонал вже отримав сповіщення про готівку"}
              </div>
            </div>
            <button
              onClick={() => setSent(null)}
              className="text-sm text-stone-400 underline underline-offset-2"
            >
              Змінити спосіб оплати
            </button>
          </div>
        ) : (
          /* ── Payment method selection ── */
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-stone-800 text-sm">Оберіть спосіб оплати</h2>

            {/* Terminal */}
            <button
              onClick={() => handlePayment("terminal")}
              disabled={sending}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-stone-200 hover:bg-stone-50 active:scale-95 transition-transform disabled:opacity-60"
            >
              <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-stone-800 text-sm">Банківська картка</div>
                <div className="text-xs text-stone-500">Офіціант принесе термінал</div>
              </div>
              {sending ? <Loader2 className="w-4 h-4 animate-spin text-stone-400 shrink-0" /> : <Bell className="w-4 h-4 text-stone-300 shrink-0" />}
            </button>

            {/* Cash */}
            <button
              onClick={() => handlePayment("cash")}
              disabled={sending}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-stone-200 hover:bg-stone-50 active:scale-95 transition-transform disabled:opacity-60"
            >
              <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-stone-800 text-sm">Готівка</div>
                <div className="text-xs text-stone-500">Офіціант принесе рахунок</div>
              </div>
              {sending ? <Loader2 className="w-4 h-4 animate-spin text-stone-400 shrink-0" /> : <Bell className="w-4 h-4 text-stone-300 shrink-0" />}
            </button>
          </div>
        )}

        <button onClick={() => setLocation(`/bill/${orderId}`)}
          className="w-full py-3 rounded-2xl border border-stone-300 text-stone-600 font-medium text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" /> Переглянути рахунок
        </button>

        <p className="text-center text-stone-400 text-xs pb-4">Maison HD Hospitality OS</p>
      </div>
    </div>
  );
}
