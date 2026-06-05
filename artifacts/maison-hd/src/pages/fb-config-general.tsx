import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Settings, ImageIcon, Upload, X } from "lucide-react";
import { useGetMyOrganization } from "@workspace/api-client-react";

const API = "/api/fb/config";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers||{}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const TIMEZONES = ["Europe/Kiev", "Europe/Berlin", "Europe/London", "Europe/Warsaw", "America/New_York"];
const SHIFT_TIMES = ["0:00","1:00","2:00","3:00","4:00","5:00","6:00","23:00","22:00"];
const CURRENCIES = ["Українська гривня, ₴","Euro, €","US Dollar, $","Polish złoty, zł"];
const LANGUAGES = ["Українська","English","Polski","Deutsch"];
const SERVICE_PCTS = ["0%","5%","10%","12%","15%","18%","20%"];
const NOTIFY_OPTIONS = ["Не сповіщати","Щодня","Щотижня"];

function toSlug(name: string) {
  return name.toLowerCase()
    .replace(/[іїєґ]/g, (c: string) => ({ "і": "i", "ї": "yi", "є": "ye", "ґ": "g" }[c] ?? c))
    .replace(/[а-яёa-z0-9]+/g, m => m)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadLogo(file: File): Promise<string> {
  const token = localStorage.getItem("hms_token");
  const r = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("Не вдалось отримати URL для завантаження");
  const { uploadURL, objectPath } = await r.json();
  const up = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!up.ok) throw new Error("Помилка завантаження файлу");
  return `/api/storage${objectPath}`;
}

interface GeneralConfig {
  company_name?: string;
  logo_url?: string;
  timezone?: string;
  shift_end_time?: string;
  currency?: string;
  language?: string;
  show_floor_plan?: boolean;
  select_guest_count?: boolean;
  fast_staff_switch?: boolean;
  allow_partial_portions?: boolean;
  service_pct?: string;
  service_tax?: string;
  apply_service_to_all?: boolean;
  use_tech_cards?: boolean;
  use_cash_shifts?: boolean;
  use_taxes?: boolean;
  use_fiscalization?: boolean;
  print_fiscal_by_default?: boolean;
  track_staff_hours?: boolean;
  show_cashier_on_fiscal?: boolean;
  stock_notifications?: string;
  online_orders_email?: string;
}

interface GuestBranding { logo_url?: string; primary_color?: string; accent_color?: string; service_card?: string; }

const ORG_API = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/maison-hd", "") + "/api/organizations";

function Section({ title }: { title: string }) {
  return <h2 className="text-base font-semibold mt-6 mb-4 pb-2 border-b">{title}</h2>;
}
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-start py-2">
      <Label className="pt-2 text-sm text-muted-foreground">{label}</Label>
      <div>{children}{hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}</div>
    </div>
  );
}
function Check({ id, label, desc, val, onChange }: { id: string; label: string; desc?: string; val: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer py-1">
      <input type="checkbox" id={id} checked={val} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 rounded" />
      <span>
        <span className="text-sm">{label}</span>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </span>
    </label>
  );
}
function Sel({ val, opts, onChange }: { val: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <select value={val} onChange={e => onChange(e.target.value)}
      className="border rounded-md px-3 py-2 text-sm bg-background w-full max-w-xs">
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

export default function FbConfigGeneral() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: orgData } = useGetMyOrganization();
  const orgId = (orgData as any)?.id;
  const [guideUrl, setGuideUrl] = useState("");
  const [cfg, setCfg] = useState<GeneralConfig>({
    timezone: "Europe/Kiev", shift_end_time: "0:00", currency: "Українська гривня, ₴",
    language: "Українська", show_floor_plan: true, select_guest_count: true,
    fast_staff_switch: false, allow_partial_portions: true, service_pct: "10%",
    use_tech_cards: true, use_cash_shifts: true, use_taxes: true,
    use_fiscalization: true, print_fiscal_by_default: true, track_staff_hours: false,
    show_cashier_on_fiscal: false, stock_notifications: "Не сповіщати",
  });

  const [branding, setBranding] = useState<GuestBranding>({ logo_url: "", primary_color: "#2C2416", accent_color: "#C9A96E" });
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [companyLogoUploading, setCompanyLogoUploading] = useState(false);
  const companyLogoInputRef = useRef<HTMLInputElement>(null);

  // Sync guideUrl from org data
  const orgGuideUrl = (orgData as any)?.guestGuideUrl || (orgData as any)?.guest_guide_url || "";
  useState(() => { if (orgGuideUrl) setGuideUrl(orgGuideUrl); });

  const { isLoading, data: generalData } = useQuery({
    queryKey: ["fb-config-general"],
    queryFn: () => apiFetch(`${API}/section/general`),
  });
  useEffect(() => {
    if (generalData?.data && Object.keys(generalData.data).length > 0) setCfg(generalData.data);
  }, [generalData]);

  const { data: brandingData } = useQuery({
    queryKey: ["fb-config-guest-branding"],
    queryFn: () => apiFetch(`${API}/section/guest_branding`),
  });
  useEffect(() => {
    if (brandingData?.data && Object.keys(brandingData.data).length > 0) setBranding(prev => ({ ...prev, ...brandingData.data }));
  }, [brandingData]);

  const saveGuideUrl = useMutation({
    mutationFn: async (url: string) => {
      const token = localStorage.getItem("hms_token");
      const r = await fetch(`${ORG_API}/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ guestGuideUrl: url }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["organization", "me"] }); toast({ title: "URL гіду збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const set = <K extends keyof GeneralConfig>(k: K, v: GeneralConfig[K]) => setCfg(p => ({ ...p, [k]: v }));
  const setBrand = <K extends keyof GuestBranding>(k: K, v: GuestBranding[K]) => setBranding(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => apiFetch(`${API}/section/general`, { method: "PUT", body: JSON.stringify({ data: cfg }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-config-general"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const saveBranding = useMutation({
    mutationFn: () => apiFetch(`${API}/section/guest_branding`, { method: "PUT", body: JSON.stringify({ data: branding }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-config-guest-branding"] }); toast({ title: "Брендинг збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-bold">Налаштування компанії</h1>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Зберегти
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl space-y-1">
            <Row label="Назва компанії"
              hint="Друкуватиметься на чеку. Якщо у вас різні назви закладів в одному акаунті, увімкніть друк назви закладу на чеках у налаштуваннях чека.">
              <Input value={cfg.company_name||""} onChange={e => set("company_name", e.target.value)}
                placeholder="Назва вашої компанії" className="max-w-xs" />
            </Row>
            <Row label="Гостьовий гід">
              {(() => {
                return (
                  <div className="max-w-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={guideUrl}
                        onChange={e => setGuideUrl(e.target.value)}
                        placeholder="https://yourdomain.com/guide/"
                        className="flex-1 h-9 text-sm font-mono"
                      />
                      <button
                        className="px-3 h-9 border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                        onClick={() => { if (guideUrl) navigator.clipboard.writeText(guideUrl); }}
                        title="Скопіювати посилання"
                      >
                        Копіювати
                      </button>
                      <Button size="sm" className="h-9 shrink-0" onClick={() => saveGuideUrl.mutate(guideUrl)} disabled={saveGuideUrl.isPending}>
                        {saveGuideUrl.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Пряме посилання на гостьовий гід вашого закладу.{" "}
                      {guideUrl && <a href={guideUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Відкрити →</a>}
                    </p>
                  </div>
                );
              })()}
            </Row>
            <Row label="Логотип" hint="Друкуватиметься у шапці чека.">
              <div className="space-y-2 max-w-sm">
                <input
                  ref={companyLogoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCompanyLogoUploading(true);
                    try {
                      const url = await uploadLogo(file);
                      set("logo_url", url);
                    } catch (err: any) {
                      toast({ title: "Помилка завантаження", description: err.message, variant: "destructive" });
                    } finally {
                      setCompanyLogoUploading(false);
                      if (companyLogoInputRef.current) companyLogoInputRef.current.value = "";
                    }
                  }}
                />
                {cfg.logo_url ? (
                  <div className="relative w-fit">
                    <div className="h-16 min-w-[120px] max-w-xs rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden px-3">
                      <img src={cfg.logo_url} alt="Логотип" className="max-h-12 max-w-full object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                    <button type="button" onClick={() => set("logo_url", "")}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/80">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                <Button type="button" variant="outline" size="sm"
                  disabled={companyLogoUploading}
                  onClick={() => companyLogoInputRef.current?.click()}>
                  {companyLogoUploading
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Завантаження...</>
                    : <><Upload className="w-3.5 h-3.5 mr-1.5" /> {cfg.logo_url ? "Замінити логотип" : "Завантажити логотип"}</>
                  }
                </Button>
              </div>
            </Row>

            <Section title="Загальні налаштування" />
            <Row label="Часовий пояс"><Sel val={cfg.timezone||"Europe/Kiev"} opts={TIMEZONES.map(t=>`(+03:00) — ${t}`)} onChange={v => set("timezone", v.split(" — ")[1]||v)} /></Row>
            <Row label="Час завершення зміни"
              hint="Якщо ваш заклад працює після 00:00, вкажіть максимальний час закінчення бізнес-дня.">
              <Sel val={cfg.shift_end_time||"0:00"} opts={SHIFT_TIMES} onChange={v => set("shift_end_time", v)} />
            </Row>
            <Row label="Грошова одиниця"><Sel val={cfg.currency||"Українська гривня, ₴"} opts={CURRENCIES} onChange={v => set("currency", v)} /></Row>
            <Row label="Мова"><Sel val={cfg.language||"Українська"} opts={LANGUAGES} onChange={v => set("language", v)} /></Row>

            <Section title="Налаштування каси" />
            <div className="space-y-1">
              <Check id="floor" label="Показувати план залу"
                desc="Вимкніть налаштування, якщо ви працюєте в режимі фастфуду. Після оплати замовлення автоматично відкриється нове."
                val={cfg.show_floor_plan??true} onChange={v => set("show_floor_plan", v)} />
              <Check id="guests" label="Вибирати кількість гостей за столом"
                desc="Вимкніть налаштування, щоб після вибору столу одразу додавати товари до замовлення"
                val={cfg.select_guest_count??true} onChange={v => set("select_guest_count", v)} />
              <Check id="staff" label="Прискорити переміщення між офіціантами на касі"
                desc="Працівники будуть переключатись між своїми замовленнями без повторного введення ПІН-коду"
                val={cfg.fast_staff_switch??false} onChange={v => set("fast_staff_switch", v)} />
              <Check id="partial" label="Дозволити замовляти частину порції"
                desc="Офіціанти зможуть додати в чеки гостей 0.5 піци чи 1.5 коктейлю — кількість інгредієнтів і ціна частини страви розраховуються пропорційно"
                val={cfg.allow_partial_portions??true} onChange={v => set("allow_partial_portions", v)} />
            </div>

            <div className="grid grid-cols-[180px_1fr] gap-4 items-start py-2 mt-2">
              <Label className="pt-2 text-sm text-muted-foreground">Відсоток за обслуговування</Label>
              <Sel val={cfg.service_pct||"10%"} opts={SERVICE_PCTS} onChange={v => set("service_pct", v)} />
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 items-start py-2">
              <Label className="pt-2 text-sm text-muted-foreground">Податок на відсоток за обслуговування</Label>
              <Sel val={cfg.service_tax||"Не використовувати"} opts={["Не використовувати","ПДВ 20%","ПДВ 0%"]} onChange={v => set("service_tax", v)} />
            </div>
            <Check id="svc_all" label="Застосовувати відсоток за обслуговування за замовчуванням"
              desc="З ввімкненням налаштування у кожне нове замовлення буде автоматично додано відсоток за обслуговування"
              val={cfg.apply_service_to_all??false} onChange={v => set("apply_service_to_all", v)} />

            <Section title="Налаштування адміністрування" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-0">
              <div className="space-y-1">
                <Check id="tc" label="Використовувати виробництво тех. карток та напівфабрикатів" val={cfg.use_tech_cards??true} onChange={v => set("use_tech_cards", v)} />
                <Check id="cs" label="Використовувати касові зміни" val={cfg.use_cash_shifts??true} onChange={v => set("use_cash_shifts", v)} />
                <Check id="tax" label="Враховувати податки" val={cfg.use_taxes??true} onChange={v => set("use_taxes", v)} />
                <Check id="fisc" label="Використовувати фіскалізацію" val={cfg.use_fiscalization??true} onChange={v => set("use_fiscalization", v)} />
                <Check id="fp" label="Друкувати фіскальні чеки за замовчуванням" val={cfg.print_fiscal_by_default??true} onChange={v => set("print_fiscal_by_default", v)} />
                <Check id="wh" label="Враховувати робочий час працівників" val={cfg.track_staff_hours??false} onChange={v => set("track_staff_hours", v)} />
                <Check id="cf" label="Відображати касира в фіскальному чеку" val={cfg.show_cashier_on_fiscal??false} onChange={v => set("show_cashier_on_fiscal", v)} />
              </div>
              <div className="flex flex-col gap-2 self-start">
                {[
                  { href: "#", label: "Що таке виробництво?" },
                  { href: "#", label: "Що таке касові зміни?" },
                  { href: "#", label: "Як вести облік податків?" },
                  { href: "#", label: "Як почати роботу з ПРРО?" },
                ].map(l => <a key={l.label} href={l.href} className="text-xs text-primary hover:underline">{l.label}</a>)}
              </div>
            </div>

            <div className="grid grid-cols-[180px_1fr] gap-4 items-start py-3 mt-2">
              <Label className="pt-2 text-sm text-muted-foreground">Сповіщення про залишки</Label>
              <div>
                <Sel val={cfg.stock_notifications||"Не сповіщати"} opts={NOTIFY_OPTIONS} onChange={v => set("stock_notifications", v)} />
                <p className="text-xs text-muted-foreground mt-1">На пошту надійде лист із залишками на складі, для яких зазначено «Ліміт» у вкладці Склад → Залишки</p>
              </div>
            </div>
            <div className="grid grid-cols-[180px_1fr] gap-4 items-start py-2">
              <Label className="pt-2 text-sm text-muted-foreground">Ел. пошта для онлайн-замовлень</Label>
              <Input value={cfg.online_orders_email||""} onChange={e => set("online_orders_email", e.target.value)}
                placeholder="email@example.com" className="max-w-xs" />
            </div>

            {/* Guest Menu Branding */}
            <div className="mt-8 pt-6 border-t border-dashed">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-500" />
                  <h2 className="text-base font-semibold">Брендинг гостьового меню (QR)</h2>
                </div>
                <Button onClick={() => saveBranding.mutate()} disabled={saveBranding.isPending} size="sm" variant="outline">
                  {saveBranding.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Зберегти
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Налаштування відображаються у гостьовому QR-меню. Логотип з'являється на головному екрані меню.</p>
              <div className="space-y-3">
                <Row label="Логотип" hint="З'являється на головному екрані QR-меню. Рекомендований розмір: 200×80 px, PNG або SVG.">
                  <div className="space-y-2 max-w-sm">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setLogoUploading(true);
                        try {
                          const url = await uploadLogo(file);
                          setBrand("logo_url", url);
                        } catch (err: any) {
                          toast({ title: "Помилка завантаження", description: err.message, variant: "destructive" });
                        } finally {
                          setLogoUploading(false);
                          if (logoInputRef.current) logoInputRef.current.value = "";
                        }
                      }}
                    />
                    {branding.logo_url ? (
                      <div className="relative w-fit">
                        <div className="h-16 min-w-[120px] max-w-xs rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden px-3">
                          <img src={branding.logo_url} alt="Логотип" className="max-h-12 max-w-full object-contain"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                        <button
                          type="button"
                          onClick={() => setBrand("logo_url", "")}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/80"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={logoUploading}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {logoUploading
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Завантаження...</>
                        : <><Upload className="w-3.5 h-3.5 mr-1.5" /> {branding.logo_url ? "Замінити логотип" : "Завантажити логотип"}</>
                      }
                    </Button>
                  </div>
                </Row>
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center py-2">
                  <Label className="text-sm text-muted-foreground">Основний колір</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={branding.primary_color||"#2C2416"}
                      onChange={e => setBrand("primary_color", e.target.value)}
                      className="w-10 h-10 rounded-lg border cursor-pointer" />
                    <Input value={branding.primary_color||"#2C2416"} onChange={e => setBrand("primary_color", e.target.value)}
                      className="max-w-[120px] font-mono text-sm" />
                    <span className="text-xs text-muted-foreground">(фон заголовка, кнопки)</span>
                  </div>
                </div>
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center py-2">
                  <Label className="text-sm text-muted-foreground">Акцентний колір</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={branding.accent_color||"#C9A96E"}
                      onChange={e => setBrand("accent_color", e.target.value)}
                      className="w-10 h-10 rounded-lg border cursor-pointer" />
                    <Input value={branding.accent_color||"#C9A96E"} onChange={e => setBrand("accent_color", e.target.value)}
                      className="max-w-[120px] font-mono text-sm" />
                    <span className="text-xs text-muted-foreground">(AI-кнопка, теги)</span>
                  </div>
                </div>
                <Row label="Карта для сервісу" hint="Номер картки офіціанта, яка відображатиметься гостю у QR-меню при виборі чайових. Наприклад: 5168 7573 1234 5678">
                  <Input
                    value={branding.service_card||""}
                    onChange={e => setBrand("service_card", e.target.value)}
                    placeholder="5168 7573 XXXX XXXX"
                    className="max-w-xs font-mono"
                  />
                </Row>
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
