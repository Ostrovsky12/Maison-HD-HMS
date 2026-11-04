import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBookingEngineSettings,
  useSaveBookingEngineSettings,
  useGetBookingEngineOverview,
  getGetBookingEngineSettingsQueryKey,
  getGetBookingEngineOverviewQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import type { BookingEngineInput } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, RefreshCw, Save, Building2, Code2, Inbox, ShieldAlert,
} from "lucide-react";

type Provider = "maison" | "servio";
type FormState = Omit<BookingEngineInput, "servioToken" | "clearServioToken" | "provider"> & { provider: Provider };

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function normalizeConfig(c: Record<string, unknown> | undefined) {
  const cfg = c ?? {};
  const form: FormState = {
    provider: cfg.provider === "servio" ? "servio" : "maison",
    published: cfg.published === true,
    displayName: str(cfg.displayName),
    description: str(cfg.description),
    accentColor: /^#[0-9a-fA-F]{6}$/.test(str(cfg.accentColor)) ? str(cfg.accentColor) : "#1f4e5f",
    logoUrl: str(cfg.logoUrl),
    phone: str(cfg.phone),
    email: str(cfg.email),
    checkInTime: str(cfg.checkInTime, "14:00"),
    checkOutTime: str(cfg.checkOutTime, "12:00"),
    terms: str(cfg.terms),
    privacy: str(cfg.privacy),
    servioBaseUrl: str(cfg.servioBaseUrl),
    servioHotelId: str(cfg.servioHotelId),
  };
  return { form, hasServioToken: cfg.hasServioToken === true, updatedAt: str(cfg.updatedAt) };
}

function errMessage(e: unknown): string {
  const d = (e as { data?: unknown })?.data as Record<string, unknown> | undefined;
  if (d) {
    const issues = Array.isArray(d.issues) ? (d.issues as unknown[]).map(String) : [];
    const base = str(d.error) || str(d.message);
    if (issues.length) return `${base ? base + ": " : ""}${issues.join("; ")}`;
    if (base) return base;
  }
  return (e as Error)?.message || "Невідома помилка";
}

const money = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n) + " грн";
const dateUk = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleDateString("uk-UA"); };

const STATUS: Record<string, string> = {
  pending: "Очікує підтвердження", confirmed: "Підтверджено", checked_in: "Заселено",
  checked_out: "Виїхав", cancelled: "Скасовано",
};
const PAY: Record<string, string> = { unpaid: "Не оплачено", partial: "Частково", paid: "Оплачено" };

function Section({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-[#fbfaf7] p-5 md:p-6">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-mono text-[11px] text-stone-400 tracking-widest">{n}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
          {hint && <p className="text-xs text-stone-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-stone-600">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-stone-400">{hint}</p>}
    </div>
  );
}

export default function BookingStudioPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const me = useGetMe();
  const organizationId = me.data?.organizationId ?? null;
  const settingsKey = [...getGetBookingEngineSettingsQueryKey(), organizationId];
  const overviewKey = [...getGetBookingEngineOverviewQueryKey(), organizationId];
  const settings = useGetBookingEngineSettings({ query: { queryKey: settingsKey } });
  const overview = useGetBookingEngineOverview({
    query: { queryKey: overviewKey, refetchInterval: 60000 },
  });
  const save = useSaveBookingEngineSettings();

  const [form, setForm] = useState<FormState | null>(null);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialized = useRef<number | null>(null);

  useEffect(() => { document.title = "Студія онлайн-бронювання — Maison HD"; }, []);

  const view = settings.data;
  const norm = useMemo(() => normalizeConfig(view?.config as Record<string, unknown> | undefined), [view]);

  useEffect(() => {
    if (view && initialized.current !== view.organization.id) {
      initialized.current = view.organization.id;
      setForm(norm.form); setToken(""); setClearToken(false); setSaveError(null);
    }
  }, [view, norm]);

  const slug = view?.organization?.slug ?? "";
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const publicUrl = slug ? `${window.location.origin}${base}booking/${slug}` : "";
  const buttonHtml = publicUrl
    ? `<a href="${publicUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:10px;background:${form?.accentColor ?? "#1f4e5f"};color:#fff;font:600 15px/1 system-ui,sans-serif;text-decoration:none">Забронювати</a>`
    : "";

  const dirty = form ? JSON.stringify(form) !== JSON.stringify(norm.form) || token !== "" || clearToken : false;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${what} скопійовано` }); }
    catch { toast({ title: "Не вдалося скопіювати", description: "Скопіюйте вручну", variant: "destructive" }); }
  };

  const submit = (override?: Partial<FormState>) => {
    if (!form || save.isPending) return;
    const payload: BookingEngineInput = { ...form, ...override };
    if (token.trim()) payload.servioToken = token.trim();
    if (clearToken) payload.clearServioToken = true;
    setSaveError(null);
    save.mutate({ data: payload }, {
      onSuccess: (res) => {
        const next = normalizeConfig(res.config as Record<string, unknown>);
        setForm(next.form);
        setToken(""); setClearToken(false);
        qc.setQueryData(settingsKey, res);
        qc.invalidateQueries({ queryKey: settingsKey });
        qc.invalidateQueries({ queryKey: overviewKey });
        toast({ title: "Налаштування збережено" });
      },
      onError: (e) => { const m = errMessage(e); setSaveError(m); toast({ title: "Не збережено", description: m, variant: "destructive" }); },
    });
  };

  if (settings.isLoading || (!form && !settings.error)) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto p-6 space-y-4">
          <Skeleton className="h-10 w-80" /><Skeleton className="h-32 w-full" />
          <div className="grid md:grid-cols-2 gap-4"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
        </div>
      </AppLayout>
    );
  }

  if (settings.error || !form || !view) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto p-10 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
          <h1 className="text-lg font-semibold">Не вдалося завантажити налаштування</h1>
          <p className="text-sm text-stone-500">{errMessage(settings.error)}</p>
          <Button data-testid="button-retry-settings" onClick={() => settings.refetch()}><RefreshCw className="w-4 h-4 mr-2" />Повторити</Button>
        </div>
      </AppLayout>
    );
  }

  const readiness = view.readiness ?? { canPublish: false, issues: [], servioSupported: false };
  const properties = Array.isArray(view.properties) ? view.properties : [];
  const isServio = form.provider === "servio";
  const ov = overview.data as unknown as { stats?: Record<string, unknown>; bookings?: Record<string, unknown>[] } | undefined;
  const stats = ov?.stats ?? {};
  const rows = Array.isArray(ov?.bookings) ? ov!.bookings! : [];
  const accent = form.accentColor;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400">Maison HD Booking</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 mt-1">Студія прямих бронювань</h1>
            <p className="text-sm text-stone-500 mt-1 max-w-xl">Власна сторінка бронювання готелю. Наявність і ціни беруться з номерів та тарифів Maison HD.</p>
          </div>
          <div className="flex items-center gap-2">
            <span data-testid="status-published" className={`text-xs font-medium px-2.5 py-1 rounded-full border ${norm.form.published ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-stone-100 text-stone-600 border-stone-200"}`}>
              {norm.form.published ? "Опубліковано" : "Чернетка"}
            </span>
            <Button data-testid="button-save" onClick={() => submit()} disabled={!dirty || save.isPending}>
              <Save className="w-4 h-4 mr-2" />{save.isPending ? "Збереження..." : "Зберегти"}
            </Button>
          </div>
        </header>

        {saveError && (
          <div data-testid="text-save-error" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{saveError}</span>
          </div>
        )}

        {/* Readiness + publication strip */}
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
          <Section n="01" title="Готовність до публікації" hint="Перевіряється сервером після збереження">
            {readiness.canPublish && !isServio && !dirty ? (
              <div className="flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="w-4 h-4" />Усі умови виконано. Сторінку можна публікувати.</div>
            ) : (
              <ul className="space-y-1.5" data-testid="list-readiness-issues">
                {(isServio
                  ? ["Продажі Servio заблоковані до перевірки API та підтримуваного сценарію бронювання."]
                  : dirty
                    ? ["Збережіть зміни, щоб сервер повторно перевірив готовність до публікації."]
                    : readiness.issues.length ? readiness.issues : ["Сервер не повідомив про готовність"]).map((i, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-stone-700"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{i}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t border-stone-200 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-stone-800">Публікація</p>
                <p className="text-xs text-stone-500">Вимкнена сторінка повертає 404 для гостей</p>
              </div>
              <Switch data-testid="switch-published" checked={form.published} onCheckedChange={(v) => set("published", v)} disabled={isServio && !form.published} />
            </div>
            {form.published && !readiness.canPublish && (
              <p className="text-xs text-amber-700 mt-2">Сервер відхилить публікацію, доки не усунуто зауваження вище.</p>
            )}
          </Section>

          <Section n="02" title="PMS-джерело" hint="Звідки беруться наявність та ціни">
            <div className="grid grid-cols-2 gap-2">
              {(["maison", "servio"] as Provider[]).map((p) => (
                <button key={p} type="button" data-testid={`button-provider-${p}`}
                  onClick={() => { set("provider", p); if (p === "servio") set("published", false); }}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${form.provider === p ? "border-stone-900 bg-white" : "border-stone-200 hover:border-stone-400"}`}>
                  <p className="text-sm font-medium">{p === "maison" ? "Maison HD" : "Servio"}</p>
                  <p className="text-[11px] text-stone-500">{p === "maison" ? "Локальні номери і тарифи" : "Лише конфігурація"}</p>
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-stone-600">
              <p className="font-medium text-stone-700 mb-1">Об'єкти Maison HD ({properties.length})</p>
              {properties.length === 0 ? <p className="text-stone-400">Немає об'єктів. Додайте об'єкт і номери в розділі «Номери».</p> :
                <div className="flex flex-wrap gap-1.5">{properties.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100"><Building2 className="w-3 h-3" />{p.name}</span>
                ))}</div>}
            </div>
          </Section>
        </div>

        {isServio && (
          <Section n="02a" title="Servio — конфігурація" hint="Дані зберігаються, але запити до Servio не надсилаються">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2 mb-4" data-testid="text-servio-status">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>API не перевірено; продажі Servio недоступні. Публікація з цим джерелом заблокована.</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Базова адреса API"><Input data-testid="input-servio-url" value={form.servioBaseUrl} onChange={(e) => set("servioBaseUrl", e.target.value)} placeholder="https://..." /></Field>
              <Field label="ID готелю в Servio"><Input data-testid="input-servio-hotel" value={form.servioHotelId} onChange={(e) => set("servioHotelId", e.target.value)} /></Field>
              <Field label="Токен доступу" hint={norm.hasServioToken ? "Токен збережено. Порожнє поле залишає його без змін." : "Токен не збережено."}>
                <Input data-testid="input-servio-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} disabled={clearToken} placeholder={norm.hasServioToken ? "••••••••" : ""} />
              </Field>
              {norm.hasServioToken && (
                <label className="flex items-center gap-2 text-sm text-stone-700 self-end pb-2">
                  <input data-testid="checkbox-clear-token" type="checkbox" checked={clearToken} onChange={(e) => { setClearToken(e.target.checked); if (e.target.checked) setToken(""); }} />
                  Видалити збережений токен
                </label>
              )}
            </div>
          </Section>
        )}

        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          <div className="space-y-6">
            <Section n="03" title="Бренд і контакти">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Назва на сторінці"><Input data-testid="input-display-name" maxLength={120} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder={view.organization?.name} /></Field>
                <Field label="Акцентний колір">
                  <div className="flex gap-2">
                    <input data-testid="input-accent-picker" type="color" value={accent} onChange={(e) => set("accentColor", e.target.value)} className="h-9 w-12 rounded border border-stone-200 bg-transparent" />
                    <Input data-testid="input-accent" value={accent} onChange={(e) => set("accentColor", e.target.value)} className="font-mono" />
                  </div>
                </Field>
                <div className="md:col-span-2"><Field label="Опис"><Textarea data-testid="input-description" rows={3} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
                <div className="md:col-span-2"><Field label="URL логотипу"><Input data-testid="input-logo" value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://..." /></Field></div>
                <Field label="Телефон"><Input data-testid="input-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Email"><Input data-testid="input-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <Field label="Заїзд з"><Input data-testid="input-checkin-time" type="time" value={form.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} /></Field>
                <Field label="Виїзд до"><Input data-testid="input-checkout-time" type="time" value={form.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} /></Field>
              </div>
            </Section>

            <Section n="04" title="Правові тексти" hint="Гість погоджується з обома перед відправкою заявки">
              <div className="space-y-4">
                <Field label="Умови бронювання та скасування"><Textarea data-testid="input-terms" rows={5} value={form.terms} onChange={(e) => set("terms", e.target.value)} /></Field>
                <Field label="Політика конфіденційності"><Textarea data-testid="input-privacy" rows={5} value={form.privacy} onChange={(e) => set("privacy", e.target.value)} /></Field>
              </div>
            </Section>
          </div>

          <div className="space-y-6 lg:sticky lg:top-4">
            <Section n="05" title="Попередній перегляд">
              <div className="rounded-xl overflow-hidden border border-stone-200 bg-white">
                <div className="h-2" style={{ background: accent }} />
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-8 w-8 rounded object-cover" /> :
                      <div className="h-8 w-8 rounded flex items-center justify-center text-white text-sm font-semibold" style={{ background: accent }}>{(form.displayName || view.organization?.name || "M").slice(0, 1)}</div>}
                    <p className="font-semibold text-stone-900 truncate">{form.displayName || view.organization?.name}</p>
                  </div>
                  <p className="text-xs text-stone-500 mt-2 line-clamp-3">{form.description || "Опис не заповнено"}</p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-stone-500">
                    <span className="rounded border border-stone-200 px-2 py-1">Заїзд {form.checkInTime}</span>
                    <span className="rounded border border-stone-200 px-2 py-1">Виїзд {form.checkOutTime}</span>
                  </div>
                  <div className="mt-3 rounded-lg py-2 text-center text-sm font-medium text-white" style={{ background: accent }}>Знайти номер</div>
                </div>
              </div>
            </Section>

            <Section n="06" title="Встановлення на сайт">
              {!slug ? <p className="text-sm text-stone-500">Організація не має slug.</p> : (
                <div className="space-y-3">
                  <div className="rounded-lg bg-white border border-stone-200 px-3 py-2 font-mono text-[11px] break-all text-stone-700" data-testid="text-public-url">{publicUrl}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" data-testid="button-copy-link" onClick={() => copy(publicUrl, "Посилання")}><Copy className="w-3.5 h-3.5 mr-1.5" />Посилання</Button>
                    <Button size="sm" variant="outline" data-testid="button-open-public" onClick={() => window.open(publicUrl, "_blank", "noopener")}><ExternalLink className="w-3.5 h-3.5 mr-1.5" />Відкрити</Button>
                  </div>
                  <pre className="rounded-lg bg-stone-900 text-stone-100 p-3 text-[10px] leading-relaxed whitespace-pre-wrap break-all">{buttonHtml}</pre>
                  <Button size="sm" variant="outline" data-testid="button-copy-html" onClick={() => copy(buttonHtml, "HTML кнопки")}><Code2 className="w-3.5 h-3.5 mr-1.5" />Копіювати HTML</Button>
                  {!norm.form.published && <p className="text-[11px] text-amber-700">Сторінка не опублікована: гості побачать 404.</p>}
                </div>
              )}
            </Section>
          </div>
        </div>

        <Section n="07" title="Журнал прямих бронювань" hint="Усі бронювання з джерелом «direct» у Maison HD, не лише з цієї сторінки">
          <div className="flex justify-end -mt-12 mb-4">
            <Button size="sm" variant="ghost" data-testid="button-refresh-overview" onClick={() => overview.refetch()} disabled={overview.isFetching}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${overview.isFetching ? "animate-spin" : ""}`} />Оновити
            </Button>
          </div>
          {overview.isLoading ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div> :
            overview.error ? (
              <div className="text-sm text-red-700 flex items-center gap-3">{errMessage(overview.error)}<Button size="sm" variant="outline" onClick={() => overview.refetch()}>Повторити</Button></div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[["Бронювань", String(num(stats.bookings))], ["Сума", money(num(stats.totalAmount))], ["Оплачено", money(num(stats.paidAmount))]].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-white border border-stone-200 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wider text-stone-400">{l}</p>
                      <p className="text-lg font-semibold text-stone-900 font-mono" data-testid={`stat-${l}`}>{v}</p>
                    </div>
                  ))}
                </div>
                {rows.length === 0 ? (
                  <div className="py-10 text-center text-stone-400"><Inbox className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">Прямих бронювань ще немає</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wider text-stone-400 border-b border-stone-200">
                        <th className="py-2 pr-3">Номер</th><th className="pr-3">Гість</th><th className="pr-3">Юніт</th><th className="pr-3">Дати</th><th className="pr-3">Статус</th><th className="pr-3">Оплата</th><th className="text-right">Сума</th>
                      </tr></thead>
                      <tbody>{rows.map((b, i) => (
                        <tr key={String(b.id ?? i)} className="border-b border-stone-100" data-testid={`row-booking-${b.id}`}>
                          <td className="py-2.5 pr-3 font-mono text-xs">{str(b.bookingRef) || `#${b.id}`}</td>
                          <td className="pr-3">{str(b.guestName) || "—"}</td>
                          <td className="pr-3 text-stone-600">{str(b.unitName) || "—"}</td>
                          <td className="pr-3 text-stone-600 whitespace-nowrap">{dateUk(str(b.checkIn))} – {dateUk(str(b.checkOut))}</td>
                          <td className="pr-3">{STATUS[str(b.status)] ?? str(b.status)}</td>
                          <td className="pr-3">{PAY[str(b.paymentStatus)] ?? str(b.paymentStatus)}</td>
                          <td className="text-right font-mono">{money(num(b.totalAmount))}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
        </Section>
      </div>
    </AppLayout>
  );
}
