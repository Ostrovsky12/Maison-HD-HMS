import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Send } from "lucide-react";
import type { PosterDispatchResponse, PosterDispatchState } from "@workspace/api-client-react";

const META: Record<PosterDispatchState["status"], { label: string; color: string }> = {
  awaiting_confirmation: { label: "Чекає підтвердження офіціанта", color: "text-amber-800 bg-amber-50 border-amber-200" },
  disabled:      { label: "Передавання вимкнено",     color: "text-gray-600 bg-gray-100 border-gray-200" },
  pending:       { label: "Очікує передачі в Poster", color: "text-amber-700 bg-amber-50 border-amber-200" },
  synced:        { label: "Рахунок відкрито в Poster", color: "text-green-700 bg-green-50 border-green-200" },
  blocked:       { label: "Не передано в Poster",     color: "text-red-700 bg-red-50 border-red-200" },
  review:        { label: "Ручна перевірка",          color: "text-orange-700 bg-orange-50 border-orange-200" },
  closed_remote: { label: "Рахунок закрито в Poster", color: "text-gray-600 bg-gray-100 border-gray-200" },
};

export default function PosterOrderStatus({ orderId }: { orderId: number }) {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const key = ["poster-order-status", orderId];
  const { data, isLoading, error, refetch } = useQuery<PosterDispatchResponse>({
    queryKey: key,
    queryFn: () => apiFetch(`/poster/order-bridge/orders/${orderId}`),
    refetchInterval: 10000,
    enabled: !!orderId,
  });

  if (isLoading) return <div className="h-12 rounded-xl bg-muted animate-pulse" />;
  if (error) return (
    <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground flex items-center justify-between gap-2">
      <span>Статус Poster недоступний</span>
      <button onClick={() => refetch()} className="text-blue-600 font-medium" data-testid="button-retry-poster-status">Повторити</button>
    </div>
  );
  if (!data?.enabled && !data?.state) return null;

  const st = data.state;
  const meta = st ? META[st.status] : null;
  const canSend = data.enabled && (!st || st.status === "pending" || st.status === "blocked");

  async function send() {
    setSending(true); setSendError(null);
    try {
      await apiFetch(`/poster/order-bridge/orders/${orderId}/send`, { method: "POST", body: "{}" });
      await qc.invalidateQueries({ queryKey: key });
    } catch (e: any) { setSendError(e.message || "Не вдалося надіслати"); }
    setSending(false);
  }

  return (
    <div className={`rounded-xl border p-3 text-sm ${meta?.color || "border-border text-muted-foreground"}`} data-testid="status-poster-order">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          {st?.status === "synced" ? <CheckCircle2 className="w-4 h-4" /> : st?.status === "pending" || !st ? <Clock className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {meta?.label || "Ще не передано в Poster"}
        </div>
        {canSend && (
          <button onClick={send} disabled={sending} data-testid="button-send-poster"
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-60">
            {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {st ? "Надіслати ще раз" : "Надіслати"}
          </button>
        )}
      </div>
      {st?.remoteOrderId ? <p className="text-xs mt-1" data-testid="text-poster-bill-id">Рахунок Poster №{st.remoteOrderId}</p> : null}
      {st?.status === "review" && <p className="text-xs mt-1">Можливо, рахунок уже створено. Автоматичний повтор вимкнено, щоб уникнути дубля — зверніться до адміністратора.</p>}
      {st?.message && <p className="text-xs mt-1 opacity-90">{st.message}</p>}
      {!data.enabled && <p className="text-xs mt-1">Передавання вимкнено. Нижче збережений результат останньої спроби; оновлення статусу не надсилає замовлення.</p>}
      {st?.diagnostic && (
        <div className="mt-2 border-t border-current/15 pt-2 text-xs space-y-1" data-testid="poster-diagnostic">
          <p className="font-medium">Операція: {st.diagnostic.operation}</p>
          <p>
            {st.diagnostic.providerCode !== undefined ? `Код Poster: ${st.diagnostic.providerCode}. ` : "Poster не надав числового коду. "}
            {st.diagnostic.httpStatus !== undefined && `HTTP: ${st.diagnostic.httpStatus}. `}
            {st.diagnostic.outcome === "uncertain" ? "Результат не встановлено." : st.diagnostic.outcome === "rejected" ? "Запит відхилено." : "Відповідь не підтверджена."}
          </p>
          <p>{st.diagnostic.recommendation}</p>
        </div>
      )}
      {sendError && <p className="text-xs mt-1 text-red-700">{sendError}</p>}
      {!data.printSupported && st?.status === "synced" && <p className="text-xs mt-1 opacity-75">Друк і оплата виконуються на касі Poster.</p>}
    </div>
  );
}
