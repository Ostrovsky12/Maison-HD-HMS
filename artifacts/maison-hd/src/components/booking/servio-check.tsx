import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBookingServioStatus, useCheckBookingServioConnection, getGetBookingServioStatusQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

export function ServioCheck({ organizationId, role, dirty, hasToken }: {
  organizationId: number | null; role: string | undefined; dirty: boolean; hasToken: boolean;
}) {
  const qc = useQueryClient();
  const queryKey = [...getGetBookingServioStatusQueryKey(), organizationId];
  const query = useGetBookingServioStatus({ query: {
    queryKey, enabled: organizationId !== null, staleTime: 0, refetchInterval: 60_000,
  } });
  const check = useCheckBookingServioConnection();
  const canEdit = !!role && ["super_admin", "owner", "admin"].includes(role);
  const result = query.data;
  const error = check.error ?? query.error;
  const errorData = (error as { data?: { error?: string } } | null)?.data;
  const run = () => check.mutate(undefined, { onSuccess: data => {
    qc.setQueryData(queryKey, data);
    qc.invalidateQueries({ queryKey });
  } });

  return (
    <div className="mt-4 space-y-3" data-testid="section-servio-check">
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm space-y-2" aria-live="polite">
        <p className="font-medium text-stone-900">Перевірка з’єднання Servio</p>
        {dirty ? <p className="text-amber-800">Є незбережені зміни. Спочатку збережіть налаштування; попередній результат не підтверджує нові дані.</p>
          : query.isLoading ? <p>Завантаження результату…</p>
          : result && <>
            <p data-testid="text-servio-check-result" className={result.status === "connected" ? "text-emerald-800" : result.status === "not_checked" ? "text-stone-600" : "text-amber-800"}>
              {result.message}
            </p>
            {result.checkedAt && <p className="text-xs text-stone-500">Остання перевірка: {new Date(result.checkedAt).toLocaleString("uk-UA")} · {result.code}</p>}
          </>}
        <p className="text-xs text-stone-500">Лише POST Ping і читання категорій для збереженого HotelID. Бронювання, рахунки та оплати не створюються. Успіх не вмикає продажі.</p>
      </div>
      {!dirty && result && result.categories.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <p className="px-3 py-2 text-xs font-medium">Категорії Servio: {result.categories.length}. Це не кількість вільних номерів.</p>
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs" data-testid="table-servio-categories">
              <thead><tr className="text-left border-t"><th className="p-2">ID категорії</th><th className="p-2">Назва</th><th className="p-2">HotelID</th></tr></thead>
              <tbody>{result.categories.map(category => (
                <tr key={category.id} className="border-t"><td className="p-2">{category.id}</td><td className="p-2 break-words">{category.name}</td><td className="p-2">{category.hotelId}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="px-3 py-2 text-xs text-stone-500">Категорії ще не прив’язані до медіа чи локальних номерів Maison HD.</p>
        </div>
      )}
      {error && !dirty && <p role="alert" className="text-sm text-red-700">{errorData?.error || "Не вдалося виконати запит. Спробуйте ще раз."}</p>}
      <div className="flex flex-wrap gap-2">
        {canEdit ? <Button type="button" variant="outline" data-testid="button-servio-check"
          disabled={dirty || !hasToken || check.isPending || query.isLoading} onClick={run}>
          {check.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {check.isPending ? "Перевіряємо Servio…" : "Перевірити з’єднання"}
        </Button> : <p className="text-xs text-stone-500">Запустити перевірку може лише власник або адміністратор.</p>}
        {query.error && <Button type="button" variant="outline" onClick={() => query.refetch()}>Оновити результат</Button>}
      </div>
    </div>
  );
}
