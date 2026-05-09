import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  CreditCard, Loader2, UtensilsCrossed, CheckCircle2,
  Coffee, Smartphone, Banknote, Building2, ArrowLeft,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/room-concierge\/?$/, "") + "/api";

async function fetchPublicBill(orderId: string) {
  const r = await fetch(`${API_BASE}/fb/public/bill/${orderId}`);
  if (!r.ok) throw new Error("Рахунок не знайдено");
  return r.json();
}

export default function Pay() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-bill", orderId],
    queryFn: () => fetchPublicBill(orderId!),
    refetchInterval: 15000,
  });

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

  // Monobank QR link (standard deeplink, will open in app or browser)
  const monobankQrValue = `https://pay.monobank.ua/?amount=${Math.round(total * 100)}&ccy=980&t=Maison+HD+%D0%A1%D1%82%D1%96%D0%BB+%E2%84%96${order.table_number || orderId}`;

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
        ) : (
          <>
            {/* QR Pay block */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-semibold text-stone-800 text-sm mb-4 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-600" /> Scan QR для онлайн-оплати
              </h2>
              <div className="flex justify-center mb-3">
                <div className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm">
                  <QRCodeSVG value={monobankQrValue} size={180} level="M" />
                </div>
              </div>
              <p className="text-xs text-center text-stone-400">
                Відскануйте QR-код через ваш банківський додаток
              </p>
            </div>

            {/* Payment method buttons */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h2 className="font-semibold text-stone-800 text-sm">Або оберіть спосіб оплати</h2>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-stone-200 hover:bg-stone-50 active:scale-95 transition-transform">
                <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-stone-800 text-sm">Банківська картка</div>
                  <div className="text-xs text-stone-500">Термінал у офіціанта</div>
                </div>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-stone-200 hover:bg-stone-50 active:scale-95 transition-transform">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-stone-800 text-sm">Готівка</div>
                  <div className="text-xs text-stone-500">Попросіть офіціанта</div>
                </div>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-stone-200 hover:bg-stone-50 active:scale-95 transition-transform">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-stone-800 text-sm">Безготівкова оплата</div>
                  <div className="text-xs text-stone-500">Рахунок для юр. особи</div>
                </div>
              </button>
            </div>
          </>
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
