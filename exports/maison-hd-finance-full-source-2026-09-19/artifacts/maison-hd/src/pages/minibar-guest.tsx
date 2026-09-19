import { useState, useEffect } from "react";
import { useParams } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";

type MinibarItem = {
  id: number; name: string; price: string; category: string; emoji: string; description?: string;
};

type ChargeItem = {
  id: number; itemName: string; itemPrice: string; quantity: number; totalAmount: string; chargedBy: string; chargedAt: string;
};

const CATEGORY_ORDER = ["alcohol", "drinks", "snacks", "personal_care", "other"];
const CATEGORY_LABELS: Record<string, string> = {
  alcohol: "🍷 Алкоголь",
  drinks: "🥤 Напої",
  snacks: "🍫 Снеки",
  personal_care: "🧴 Гігієна",
  other: "📦 Інше",
};

export default function MinibarGuestPage() {
  const params = useParams<{ unitId: string }>();
  const unitId = parseInt(params.unitId || "0");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitTotal, setSubmitTotal] = useState(0);

  useEffect(() => {
    fetch(`${API}/minibar/public/${unitId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => { setError("Помилка з'єднання. Спробуйте ще раз."); setLoading(false); });
  }, [unitId]);

  const handleQty = (itemId: number, delta: number) => {
    setQuantities(q => {
      const cur = q[itemId] || 0;
      const next = Math.max(0, Math.min(cur + delta, 10));
      return { ...q, [itemId]: next };
    });
  };

  const selectedCount = Object.values(quantities).filter(q => q > 0).length;
  const totalAmount = data?.items
    ? Object.entries(quantities).reduce((s, [id, qty]) => {
        const item = data.items.find((i: MinibarItem) => i.id === parseInt(id));
        return s + (item ? parseFloat(item.price) * qty : 0);
      }, 0)
    : 0;

  const handleSubmit = async () => {
    if (selectedCount === 0) return;
    setSubmitting(true);
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => ({ itemId: parseInt(id), quantity: q }));

    const r = await fetch(`${API}/minibar/public/${unitId}/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const d = await r.json();
    setSubmitting(false);
    if (r.ok) {
      setSubmitTotal(d.total || totalAmount);
      setSubmitted(true);
    } else {
      setError(d.error || "Помилка при збереженні");
    }
  };

  // Group items by category
  const grouped = data?.items
    ? CATEGORY_ORDER
        .map(cat => ({ cat, items: (data.items as MinibarItem[]).filter(i => i.category === cat) }))
        .filter(g => g.items.length > 0)
    : [];

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-stone-300 border-t-stone-700 rounded-full animate-spin mx-auto" />
          <p className="text-stone-500 text-sm">Завантаження...</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-xs w-full text-center space-y-4">
          <div className="text-5xl">😔</div>
          <h2 className="text-lg font-semibold text-stone-800">Щось пішло не так</h2>
          <p className="text-stone-500 text-sm">{error}</p>
          <p className="text-stone-400 text-xs">Зверніться на ресепшн — ми допоможемо</p>
        </div>
      </div>
    );
  }

  // ── No active booking ────────────────────────────────────────────
  if (!data?.booking) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-xs w-full text-center space-y-4">
          <div className="text-5xl">🏡</div>
          <h2 className="text-lg font-semibold text-stone-800">{data?.unit?.name}</h2>
          <p className="text-stone-500 text-sm">Наразі немає активного бронювання для цього будинку.</p>
          <p className="text-stone-400 text-xs">Якщо ви заселились — зверніться до адміністратора</p>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-xs w-full text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">✅</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-800">Дякуємо!</h2>
            <p className="text-stone-500 text-sm mt-1">Позиції додано до вашого рахунку</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <p className="text-sm text-stone-500">До сплати за мінібар</p>
            <p className="text-3xl font-bold text-stone-900 mt-1">₴{submitTotal.toFixed(0)}</p>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            Оплата відбудеться при виїзді разом із загальним рахунком
          </p>
          <button
            onClick={() => { setSubmitted(false); setQuantities({}); }}
            className="text-sm text-stone-500 underline underline-offset-2"
          >
            Додати ще позиції
          </button>
        </div>
      </div>
    );
  }

  // ── Main guest page ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-stone-900 text-lg">🍾 Мінібар</h1>
              <p className="text-xs text-stone-400">{data.unit?.name} · {data.property?.name}</p>
            </div>
            {data.booking && (
              <div className="text-right">
                <p className="text-xs text-stone-400">Гість</p>
                <p className="text-sm font-medium text-stone-700">{data.booking.guestName}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-36 pt-4 space-y-4">
        {/* Instruction */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-sm text-amber-800">
            👋 <strong>Позначте</strong> все, що ви взяли з мінібару, та натисніть "Підтвердити".
            Сума буде додана до вашого рахунку при виїзді.
          </p>
        </div>

        {/* Already charged items */}
        {data.charges?.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Вже зафіксовано раніше</p>
            <div className="space-y-2">
              {data.charges.map((c: ChargeItem) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">{c.itemName} × {c.quantity}</span>
                  <span className="font-medium text-stone-800">₴{parseFloat(c.totalAmount).toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-stone-100 mt-3 pt-3 flex justify-between text-sm font-semibold">
              <span className="text-stone-500">Всього раніше</span>
              <span className="text-stone-800">₴{data.charges.reduce((s: number, c: ChargeItem) => s + parseFloat(c.totalAmount), 0).toFixed(0)}</span>
            </div>
          </div>
        )}

        {/* Items grouped by category */}
        {grouped.map(({ cat, items: catItems }) => (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide px-1">{CATEGORY_LABELS[cat]}</p>
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
              {catItems.map((item: MinibarItem, idx: number) => {
                const qty = quantities[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-4 py-3.5 ${idx < catItems.length - 1 ? "border-b border-stone-50" : ""} ${qty > 0 ? "bg-emerald-50/60" : ""}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl flex-shrink-0">{item.emoji}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-stone-800 text-sm leading-tight">{item.name}</p>
                        {item.description && <p className="text-xs text-stone-400">{item.description}</p>}
                        <p className="text-sm font-semibold text-stone-600 mt-0.5">₴{parseFloat(item.price).toFixed(0)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      {qty > 0 ? (
                        <>
                          <button
                            onClick={() => handleQty(item.id, -1)}
                            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center font-bold text-stone-600 transition-colors"
                          >−</button>
                          <span className="w-6 text-center font-bold text-stone-800 tabular-nums">{qty}</span>
                          <button
                            onClick={() => handleQty(item.id, 1)}
                            className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center font-bold text-white transition-colors"
                          >+</button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleQty(item.id, 1)}
                          className="w-8 h-8 rounded-full bg-stone-100 hover:bg-emerald-100 flex items-center justify-center font-bold text-stone-500 hover:text-emerald-600 transition-colors"
                        >+</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky footer — confirm button */}
      {selectedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-100 p-4 shadow-xl">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-stone-400">Обрано позицій: {selectedCount}</p>
                <p className="font-bold text-stone-900 text-lg">₴{totalAmount.toFixed(0)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-400">До рахунку {data.booking?.guestName}</p>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-2xl py-4 text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Зберігаємо...</>
              ) : (
                <>✅ Підтвердити — ₴{totalAmount.toFixed(0)}</>
              )}
            </button>
            <p className="text-center text-xs text-stone-400 mt-2">Оплата при виїзді разом із загальним рахунком</p>
          </div>
        </div>
      )}
    </div>
  );
}
