import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBookingLiqpaySettings,
  useSaveBookingLiqpaySettings,
  useCheckBookingLiqpayConnection,
  getGetBookingLiqpaySettingsQueryKey,
} from "@workspace/api-client-react";
import type { BookingLiqpayVerification } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Loader2, Lock, PlugZap, RefreshCw, Save, ShieldAlert, XCircle } from "lucide-react";

const EDITORS = ["owner", "admin", "super_admin"];

function errMessage(e: unknown): string {
  const d = (e as { data?: unknown })?.data as Record<string, unknown> | undefined;
  if (d && typeof d.error === "string" && d.error) return d.error;
  return (e as Error)?.message || "Невідома помилка";
}

const dt = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" });
};

function StatusPill({ v, stale }: { v: BookingLiqpayVerification | undefined; stale: boolean }) {
  if (stale) return <span data-testid="status-liqpay" className="text-xs font-medium px-2.5 py-1 rounded-full border bg-stone-100 text-stone-600 border-stone-200">Результат застарів: збережіть зміни</span>;
  if (!v || v.status === "not_checked") return <span data-testid="status-liqpay" className="text-xs font-medium px-2.5 py-1 rounded-full border bg-stone-100 text-stone-600 border-stone-200">Не перевірено</span>;
  if (v.status === "failed") return <span data-testid="status-liqpay" className="text-xs font-medium px-2.5 py-1 rounded-full border bg-red-50 text-red-800 border-red-200">Перевірка не пройдена</span>;
  if (v.mode === "test") return <span data-testid="status-liqpay" className="text-xs font-medium px-2.5 py-1 rounded-full border bg-amber-50 text-amber-900 border-amber-300">Тестові ключі: реальні оплати не прийматимуться</span>;
  return <span data-testid="status-liqpay" className="text-xs font-medium px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">Підпис прийнято{v.mode === "live" ? " (бойовий режим)" : ""}</span>;
}

export function LiqpaySettings({ organizationId, role }: { organizationId: number | null; role: string | null | undefined }) {
  const canEdit = !!role && EDITORS.includes(role);
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = useMemo(() => [...getGetBookingLiqpaySettingsQueryKey(), organizationId], [organizationId]);
  const q = useGetBookingLiqpaySettings({ query: { queryKey: key, enabled: organizationId != null } });
  const save = useSaveBookingLiqpaySettings();
  const check = useCheckBookingLiqpayConnection();

  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [legalEntityId, setLegalEntityId] = useState<number | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const initFor = useRef<string | null>(null);

  const data = q.data;
  const properties = data?.properties ?? [];
  const sellers = data?.legalEntities ?? [];

  // Reset all local state (including secret) on organization change and on unmount.
  useEffect(() => {
    initFor.current = null;
    setPropertyId(null); setLegalEntityId(null); setPublicKey(""); setSecretKey("");
    setDirty(false); setError(null); setCheckMsg(null);
    return () => { setSecretKey(""); };
  }, [organizationId]);

  // Initialise once per org; never overwrite dirty inputs on background refetch.
  useEffect(() => {
    if (!data || dirty) return;
    const k = String(organizationId);
    const pid = propertyId ?? data.properties[0]?.id ?? null;
    const prop = data.properties.find((p) => p.id === pid);
    const leId = prop?.legalEntityId ?? (initFor.current === k ? legalEntityId : null) ?? data.legalEntities[0]?.id ?? null;
    const le = data.legalEntities.find((l) => l.id === leId);
    initFor.current = k;
    setPropertyId(pid);
    setLegalEntityId(le ? le.id : null);
    setPublicKey(le?.publicKey ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dirty, organizationId]);

  const seller = sellers.find((l) => l.id === legalEntityId);
  const property = properties.find((p) => p.id === propertyId);
  const sharedWith = properties.filter((p) => p.legalEntityId === legalEntityId && p.id !== propertyId);
  const pkChanged = !!seller && publicKey.trim() !== seller.publicKey;
  const needsSecret = !seller?.hasSecretKey || pkChanged;
  const v = seller?.verification;
  const stale = dirty;

  const selectProperty = (id: number) => {
    const p = properties.find((x) => x.id === id);
    const le = sellers.find((l) => l.id === p?.legalEntityId) ?? sellers.find((l) => l.id === legalEntityId) ?? sellers[0];
    setPropertyId(id); setLegalEntityId(le?.id ?? null); setPublicKey(le?.publicKey ?? ""); setSecretKey("");
    setDirty(!!p && le?.id !== p.legalEntityId); setCheckMsg(null); setError(null);
  };
  const selectSeller = (id: number) => {
    const le = sellers.find((l) => l.id === id);
    setLegalEntityId(id); setPublicKey(le?.publicKey ?? ""); setSecretKey("");
    setDirty(property?.legalEntityId !== id); setCheckMsg(null); setError(null);
  };

  const canSave = canEdit && !!propertyId && !!legalEntityId && !!publicKey.trim() && (!needsSecret || !!secretKey.trim()) && !save.isPending
    && (dirty || !!secretKey.trim());

  const submit = () => {
    if (!canSave || !propertyId || !legalEntityId) return;
    setError(null); setCheckMsg(null);
    const body: { propertyId: number; legalEntityId: number; publicKey: string; secretKey?: string } = { propertyId, legalEntityId, publicKey: publicKey.trim() };
    if (secretKey.trim()) body.secretKey = secretKey.trim();
    save.mutate({ data: body }, {
      onSuccess: (res) => {
        setSecretKey(""); setDirty(false);
        qc.setQueryData(key, res);
        qc.invalidateQueries({ queryKey: key });
        toast({ title: "Налаштування LiqPay збережено" });
      },
      onError: (e) => { setSecretKey(""); const m = errMessage(e); setError(m); toast({ title: "Не збережено", description: m, variant: "destructive" }); },
    });
  };

  const runCheck = () => {
    if (!legalEntityId || stale || !canEdit) return;
    setError(null); setCheckMsg(null);
    check.mutate({ data: { legalEntityId } }, {
      onSuccess: (r) => {
        setCheckMsg({ ok: r.status === "connected", text: r.message });
        qc.invalidateQueries({ queryKey: key });
      },
      onError: (e) => setCheckMsg({ ok: false, text: errMessage(e) }),
    });
  };

  const shell = (children: React.ReactNode) => (
    <section data-testid="section-liqpay" className="rounded-2xl border border-stone-200 bg-[#fbfaf7] p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] text-stone-400 tracking-widest">02b</span>
          <div>
            <h2 className="text-[15px] font-semibold text-stone-900">Оплата LiqPay</h2>
            <p className="text-xs text-stone-500 mt-0.5">Ключі магазину LiqPay юридичної особи, яка продає проживання. Гроші надходять напряму продавцю.</p>
          </div>
        </div>
        {data && seller && <StatusPill v={v} stale={stale} />}
      </div>
      {children}
    </section>
  );

  if (organizationId == null || q.isLoading) return shell(<div className="space-y-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-20 w-full" /></div>);
  if (q.error || !data) return shell(
    <div className="text-sm text-red-700 flex items-center gap-3" data-testid="text-liqpay-load-error">
      {errMessage(q.error)}
      <Button size="sm" variant="outline" data-testid="button-liqpay-retry" onClick={() => q.refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Повторити</Button>
    </div>,
  );

  if (properties.length === 0 || sellers.length === 0) return shell(
    <div data-testid="text-liqpay-missing" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
      <p className="font-medium flex gap-2"><ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />{properties.length === 0 ? "Немає об'єктів для прийому оплати." : "Немає активних юридичних осіб-продавців."}</p>
      <p>Ключі LiqPay прив'язуються до реального продавця, який зазначений в об'єкті. Система не створює продавців автоматично.</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {sellers.length === 0 && <Link href="/fb/legal-entities" data-testid="link-liqpay-legal-entities" className="text-xs font-medium underline underline-offset-2">Додати юридичну особу</Link>}
        {properties.length === 0 && <Link href="/settings" data-testid="link-liqpay-properties" className="text-xs font-medium underline underline-offset-2">Налаштування об'єктів</Link>}
      </div>
    </div>,
  );

  const lastChecked = dt(v?.checkedAt);
  const sel = "w-full h-9 rounded-md border border-stone-300 bg-white px-3 text-sm disabled:opacity-60";

  return shell(
    <div className="space-y-4">
      {!canEdit && (
        <div data-testid="text-liqpay-readonly" className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 flex gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-stone-500" />
          <span>Перегляд. Змінювати ключі та запускати перевірку можуть лише власник або адміністратор, оскільки ключі дають доступ до платежів продавця.</span>
        </div>
      )}
      {!data.callbackConfigured && (
        <div data-testid="text-liqpay-callback-warning" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Публічна адреса для повернення та підтвердження оплати ще не налаштована на сервері. Онлайн-оплата заблокована до завершення цього налаштування, навіть якщо ключі правильні. Зверніться до адміністратора Maison HD.</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Об'єкт</Label>
          <select data-testid="select-liqpay-property" className={sel} disabled={!canEdit || save.isPending} value={propertyId ?? ""} onChange={(e) => selectProperty(Number(e.target.value))}>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="text-[11px] text-stone-400">Оплата бронювань цього об'єкта йде продавцю, вказаному нижче.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Продавець (юридична особа)</Label>
          <select data-testid="select-liqpay-legal-entity" className={sel} disabled={!canEdit || save.isPending} value={legalEntityId ?? ""} onChange={(e) => selectSeller(Number(e.target.value))}>
            {property && property.legalEntityId == null && <option value="" disabled>Не призначено</option>}
            {sellers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {property && property.legalEntityId == null && !dirty && <p className="text-[11px] text-amber-700">Об'єкту ще не призначено продавця. Збереження призначить обраного.</p>}
          {property && property.legalEntityId != null && property.legalEntityId !== legalEntityId && <p className="text-[11px] text-amber-700">Після збереження об'єкт буде переведено на іншого продавця.</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Public key</Label>
          <Input data-testid="input-liqpay-public-key" autoComplete="off" spellCheck={false} className="font-mono" disabled={!canEdit || save.isPending}
            value={publicKey} onChange={(e) => { setPublicKey(e.target.value); setDirty(true); setCheckMsg(null); }} placeholder="sandbox_i000... або i000..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Secret key</Label>
          <Input data-testid="input-liqpay-secret-key" type="password" autoComplete="new-password" spellCheck={false} className="font-mono" disabled={!canEdit || save.isPending}
            value={secretKey} onChange={(e) => { setSecretKey(e.target.value); setCheckMsg(null); }}
            placeholder={seller?.hasSecretKey && !pkChanged ? "Збережено. Порожнє поле залишає без змін" : "Обов'язково"} />
          <p className="text-[11px] text-stone-400">
            {pkChanged && seller?.hasSecretKey ? "Public key змінено: введіть відповідний новий secret key." : seller?.hasSecretKey ? "Секрет зберігається лише на сервері й ніколи не показується." : "Секрет ще не збережено."}
          </p>
        </div>
      </div>

      {sharedWith.length > 0 && (
        <p data-testid="text-liqpay-shared" className="text-xs text-stone-600 rounded-lg border border-stone-200 bg-white px-3 py-2">
          Ключі належать продавцю «{seller?.name}» і діють для всіх його об'єктів: також {sharedWith.map((p) => p.name).join(", ")}.
        </p>
      )}

      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs text-stone-600 space-y-1" data-testid="text-liqpay-last-check">
        <p className="text-stone-800 font-medium">Остання перевірка</p>
        {stale ? <p>Є незбережені зміни. Попередній результат не стосується нових даних; перевірка доступна після збереження.</p>
          : lastChecked ? <p>{lastChecked}{v?.mode ? `, режим: ${v.mode === "test" ? "тестовий (sandbox)" : "бойовий"}` : ""}{v?.code ? `, код: ${v.code}` : ""}</p>
          : <p>Ще не виконувалась.</p>}
        <p className="text-stone-400">Перевірка надсилає LiqPay лише запит на читання з підписом. Кошти не списуються, бронювання не створюється. Успіх означає, що LiqPay прийняв ключі, а не те, що магазин активовано банком чи повідомлення про оплату доходять.</p>
      </div>

      {checkMsg && !stale && (
        <div data-testid="text-liqpay-check-result" aria-live="polite" className={`rounded-lg border px-3 py-2 text-sm flex gap-2 ${checkMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {checkMsg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}<span>{checkMsg.text}</span>
        </div>
      )}
      {error && <div data-testid="text-liqpay-error" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button data-testid="button-liqpay-save" onClick={submit} disabled={!canSave}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{save.isPending ? "Збереження..." : "Зберегти ключі"}
          </Button>
          <Button data-testid="button-liqpay-check" variant="outline" onClick={runCheck} disabled={stale || !!secretKey || !seller?.hasSecretKey || check.isPending || save.isPending}>
            {check.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}{check.isPending ? "Перевірка..." : "Перевірити підключення"}
          </Button>
        </div>
      )}
    </div>,
  );
}
