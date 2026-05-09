import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Receipt, CheckCircle2, Loader2, UtensilsCrossed, Coffee } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/room-concierge\/?$/, "") + "/api";

async function fetchPublicBill(orderId: string) {
  const r = await fetch(`${API_BASE}/fb/public/bill/${orderId}`);
  if (!r.ok) throw new Error("Рахунок не знайдено");
  return r.json();
}

const STATUS_LABEL: Record<string, string> = {
  open: "Відкрите", in_kitchen: "На кухні", ready: "Готово",
  billed: "Закрите", cancelled: "Скасоване",
};

export default function Bill() {
  const { orderId } = useParams<{ orderId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-bill", orderId],
    queryFn: () => fetchPublicBill(orderId!),
    refetchInterval: 20000,
  });

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F5F0] gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      <p className="text-stone-500 text-sm">Завантаження рахунку...</p>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F5F0] gap-3 p-6">
      <UtensilsCrossed className="w-12 h-12 text-stone-400" />
      <p className="font-semibold text-stone-700">Рахунок не знайдено</p>
      <p className="text-stone-500 text-sm text-center">Будь ласка, зверніться до офіціанта</p>
    </div>
  );

  const { order, items } = data;
  const total = parseFloat(order.total_amount || "0");
  const tax = parseFloat(order.tax_amount || "0");
  const subtotal = total - tax;

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-600 mb-2">
            <Coffee className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Maison HD</h1>
          <p className="text-stone-500 text-sm">Ваш рахунок</p>
        </div>

        {/* Table info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-sm">
            <div>
              <div className="font-semibold text-stone-800">
                Стіл {order.table_number ? `№${order.table_number}` : "—"}
              </div>
              {order.guest_name && (
                <div className="text-stone-500 text-xs mt-0.5">{order.guest_name}</div>
              )}
            </div>
            <div className="text-right">
              <div className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                order.status === "billed"
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {STATUS_LABEL[order.status] || order.status}
              </div>
              {order.created_at && (
                <div className="text-stone-400 text-xs mt-1">
                  {new Date(order.created_at).toLocaleDateString("uk-UA", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-stone-800 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-600" /> Позиції замовлення
            </h2>
          </div>
          <div className="divide-y">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="font-medium text-stone-800 text-sm">{item.name}</div>
                  {item.notes && (
                    <div className="text-xs text-stone-500 mt-0.5">{item.notes}</div>
                  )}
                  {item.category_name && (
                    <div className="text-xs text-stone-400 mt-0.5">{item.category_name}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-stone-500">×{item.quantity}</div>
                  <div className="font-semibold text-stone-800 text-sm">
                    {parseFloat(item.total_price || item.unit_price * item.quantity || 0).toFixed(2)} ₴
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t px-4 py-4 space-y-2">
            {tax > 0 && (
              <>
                <div className="flex justify-between text-sm text-stone-500">
                  <span>Підсумок</span>
                  <span>{subtotal.toFixed(2)} ₴</span>
                </div>
                <div className="flex justify-between text-sm text-stone-500">
                  <span>ПДВ</span>
                  <span>{tax.toFixed(2)} ₴</span>
                </div>
                <div className="border-t pt-2" />
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="font-bold text-stone-900">Загалом</span>
              <span className="text-2xl font-black text-amber-700">{total.toFixed(2)} ₴</span>
            </div>
          </div>
        </div>

        {/* Paid banner */}
        {order.status === "billed" && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
            <div>
              <div className="font-semibold text-green-800">Оплачено</div>
              <div className="text-green-600 text-sm">Дякуємо за ваш візит!</div>
            </div>
          </div>
        )}

        <p className="text-center text-stone-400 text-xs pb-4">Maison HD Hospitality OS</p>
      </div>
    </div>
  );
}
