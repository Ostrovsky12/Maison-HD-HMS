import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle, Info, Loader2, RefreshCw, Save, Send } from "lucide-react";

type Config = {
  enabled: boolean; spotId: number; tabletId: number; waiterId: number;
  kitchenEnabled: boolean;
  tableMap: Record<string, number>; productMap: Record<string, number>;
};
type View = {
  config: Config;
  localTables: { id: number; name: string }[];
  localItems: { id: number; name: string; price: number }[];
  printSupported: boolean;
  kitchenTerminalReady?: boolean;
};
type Catalog = {
  spots: { spot_id: number; name: string }[];
  tablets: { tablet_id: number; spot_id: number; name: string }[];
  employees: { user_id: number; name: string }[];
  products: { product_id: number; product_name: string; price?: unknown }[];
  tables: { table_id: number; table_name: string; spot_id: number }[];
};

const EMPTY: Config = { enabled: false, kitchenEnabled: false, spotId: 0, tabletId: 0, waiterId: 0, tableMap: {}, productMap: {} };
const selCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function cleanMap(m: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) { const n = Number(v); if (Number.isInteger(n) && n > 0) out[k] = n; }
  return out;
}

export default function PosterOrderBridge({ request }: { request: (path: string, opts?: RequestInit) => Promise<any> }) {
  const [view, setView] = useState<View | null>(null);
  const [cfg, setCfg] = useState<Config>(EMPTY);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [catLoading, setCatLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const apply = (v: View) => {
    setView(v);
    setCfg({ ...EMPTY, ...v.config, tableMap: { ...(v.config?.tableMap || {}) }, productMap: { ...(v.config?.productMap || {}) } });
  };

  const load = async () => {
    setLoading(true); setError(null);
    try { apply(await request("/poster/order-bridge")); }
    catch (e: any) { setError(e.message || "Не вдалося завантажити налаштування передачі замовлень."); }
    setLoading(false);
  };

  const loadCatalog = async () => {
    setCatLoading(true); setCatError(null);
    try { setCatalog(await request("/poster/order-bridge/catalog")); }
    catch (e: any) { setCatError(e.message || "Не вдалося отримати довідники Poster. Можна ввести ID вручну."); }
    setCatLoading(false);
  };

  useEffect(() => { load(); loadCatalog(); }, []);

  const validate = (c: Config): string | null => {
    if (!c.enabled) return null;
    if (!(c.spotId > 0)) return "Вкажіть заклад Poster (spot_id).";
    if (!(c.tabletId > 0)) return "Вкажіть касу Poster (tablet_id).";
    if (!(c.waiterId > 0)) return "Вкажіть офіціанта Poster (user_id).";
    if (Object.keys(cleanMap(c.productMap)).length === 0) return "Зіставте принаймні одну позицію меню з товаром Poster.";
    return null;
  };

  const save = async (c: Config) => {
    const v = validate(c);
    if (v) { setError(v); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const body = { enabled: c.enabled, kitchenEnabled: c.enabled && c.kitchenEnabled, spotId: Number(c.spotId) || 0, tabletId: Number(c.tabletId) || 0, waiterId: Number(c.waiterId) || 0, tableMap: cleanMap(c.tableMap), productMap: cleanMap(c.productMap) };
      apply(await request("/poster/order-bridge", { method: "PUT", body: JSON.stringify(body) }));
      setNotice(c.enabled ? "Збережено. Передачу відкритих рахунків у Poster увімкнено." : "Збережено. Передача замовлень вимкнена.");
    } catch (e: any) { setError(e.message || "Не вдалося зберегти налаштування."); }
    setSaving(false);
  };

  const onSave = () => {
    if ((cfg.enabled && !view?.config?.enabled) || (cfg.kitchenEnabled && !view?.config?.kitchenEnabled)) {
      const v = validate(cfg);
      if (v) { setError(v); return; }
      setConfirmOpen(true);
    } else save(cfg);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!view) return (
    <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>
      <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={load} data-testid="button-retry-bridge"><RefreshCw className="w-3.5 h-3.5" />Повторити</Button>
    </div>
  );

  const tabletsForSpot = (catalog?.tablets || []).filter(t => !cfg.spotId || t.spot_id === cfg.spotId);
  const remoteTables = (catalog?.tables || []).filter(t => !cfg.spotId || t.spot_id === cfg.spotId);
  const products = catalog?.products || [];
  const num = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) && n > 0 ? n : 0; };

  const idField = (label: string, key: "spotId" | "tabletId" | "waiterId", options: { id: number; name: string }[]) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {options.length > 0 ? (
        <select className={selCls} value={cfg[key] || ""} data-testid={`select-${key}`}
          onChange={e => setCfg(c => ({ ...c, [key]: num(e.target.value) }))}>
          <option value="">Не вибрано</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.name} (ID {o.id})</option>)}
          {cfg[key] > 0 && !options.some(o => o.id === cfg[key]) && <option value={cfg[key]}>ID {cfg[key]} (немає в довіднику)</option>}
        </select>
      ) : (
        <Input type="number" min={1} inputMode="numeric" placeholder="ID у Poster" value={cfg[key] || ""} data-testid={`input-${key}`}
          onChange={e => setCfg(c => ({ ...c, [key]: num(e.target.value) }))} />
      )}
    </div>
  );

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Передача замовлень у Poster</CardTitle>
            <CardDescription>Замовлення з QR-меню та застосунку офіціанта відкриваються як рахунки в Poster</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="bridge-enabled" className="text-sm">{cfg.enabled ? "Увімкнено" : "Вимкнено"}</Label>
            <Switch id="bridge-enabled" checked={cfg.enabled} onCheckedChange={v => setCfg(c => ({ ...c, enabled: v, kitchenEnabled: v && c.kitchenEnabled }))} data-testid="switch-bridge-enabled" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-xs text-orange-800 space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-sm"><Info className="w-4 h-4" />Що робить ця функція</p>
          <p>Створює відкритий рахунок у Poster з позиціями замовлення. Оплата та фіскалізація тут не виконуються — рахунок закривається в Poster.</p>
          <p>Бігунки відправляє касовий модуль Poster за налаштуваннями принтерів і підрозділів у Poster. Вебкаса Poster не підтримує фізичний друк бігунків — потрібен встановлений застосунок каси.</p>
          <p>Позиції без зіставлення з товаром Poster не передаються — таке замовлення потрапить на ручну перевірку.</p>
          <p>Одночасне редагування одного рахунку тут і на касі поки не підтримується. Виявлені зміни на касі призупинять передавання. Модифікатори та розбіжності цін не ігноруються.</p>
          <p>Перед увімкненням потрібен узгоджений тест на вашій касі: використовується попередній API відкритих рахунків Poster, підтримку якого слід перевірити.</p>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="bridge-kitchen-enabled">Бігунки через касовий модуль Poster</Label>
            <Switch id="bridge-kitchen-enabled" checked={cfg.kitchenEnabled}
              disabled={!cfg.enabled || saving}
              onCheckedChange={v => setCfg(c => ({ ...c, kitchenEnabled: v }))}
              data-testid="switch-bridge-kitchen-enabled" />
          </div>
          <p className="text-xs text-muted-foreground">
            {view.kitchenTerminalReady ? "Оновлений касовий модуль на зв’язку." : "Оновлений касовий модуль ще не підтвердив готовність. Після оновлення каси оновіть стан."}
          </p>
          <p className="text-xs text-muted-foreground">Лише нові рахунки після ввімкнення. Відкрийте відповідний рахунок на касі: після точної звірки страв модуль надішле бігунки без додаткового підтвердження. Результат команди не є підтвердженням фізичного друку. Невідомий результат блокує повтор.</p>
          <Button variant="outline" size="sm" onClick={load} disabled={saving}>Оновити стан</Button>
        </div>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" data-testid="text-bridge-notice">{notice}</div>}

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Призначення в Poster</p>
          <Button size="sm" variant="outline" onClick={loadCatalog} disabled={catLoading} className="gap-1.5" data-testid="button-reload-catalog">
            {catLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Оновити довідники
          </Button>
        </div>
        {catError && <p className="text-xs text-amber-700">{catError}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {idField("Заклад (spot_id) *", "spotId", (catalog?.spots || []).map(s => ({ id: s.spot_id, name: s.name })))}
          {idField("Каса (tablet_id) *", "tabletId", tabletsForSpot.map(t => ({ id: t.tablet_id, name: t.name })))}
          {idField("Офіціант (user_id) *", "waiterId", (catalog?.employees || []).map(e => ({ id: e.user_id, name: e.name })))}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Столи та номери</p>
          {remoteTables.length === 0 && <p className="text-xs text-muted-foreground">Столи Poster не отримано — введіть table_id вручну або залиште порожнім.</p>}
          {view.localTables.length === 0 ? <p className="text-xs text-muted-foreground">Локальних столів немає.</p> : (
            <div className="divide-y rounded-lg border">
              {view.localTables.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-2">
                  <span className="flex-1 text-sm truncate">{t.name}</span>
                  <div className="w-56">
                    {remoteTables.length > 0 ? (
                      <select className={selCls} value={cfg.tableMap[t.id] || ""} data-testid={`select-table-${t.id}`}
                        onChange={e => setCfg(c => ({ ...c, tableMap: { ...c.tableMap, [t.id]: num(e.target.value) } }))}>
                        <option value="">Без столу</option>
                        {remoteTables.map(r => <option key={r.table_id} value={r.table_id}>{r.table_name} (ID {r.table_id})</option>)}
                      </select>
                    ) : (
                      <Input type="number" min={1} placeholder="table_id" value={cfg.tableMap[t.id] || ""} data-testid={`input-table-${t.id}`}
                        onChange={e => setCfg(c => ({ ...c, tableMap: { ...c.tableMap, [t.id]: num(e.target.value) } }))} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Позиції меню</p>
          <p className="text-xs text-muted-foreground">Ціну в Poster визначає сама каса; тут показано лише локальну ціну.</p>
          {view.localItems.length === 0 ? <p className="text-xs text-muted-foreground">Локальних позицій немає.</p> : (
            <div className="divide-y rounded-lg border max-h-96 overflow-y-auto">
              {view.localItems.map(it => (
                <div key={it.id} className="flex items-center gap-3 p-2">
                  <span className="flex-1 text-sm truncate">{it.name}</span>
                  <span className="text-xs text-muted-foreground w-16 text-right">{Number(it.price).toFixed(2)} ₴</span>
                  <div className="w-56">
                    {products.length > 0 ? (
                      <select className={selCls} value={cfg.productMap[it.id] || ""} data-testid={`select-product-${it.id}`}
                        onChange={e => setCfg(c => ({ ...c, productMap: { ...c.productMap, [it.id]: num(e.target.value) } }))}>
                        <option value="">Не зіставлено</option>
                        {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name} (ID {p.product_id})</option>)}
                      </select>
                    ) : (
                      <Input type="number" min={1} placeholder="product_id" value={cfg.productMap[it.id] || ""} data-testid={`input-product-${it.id}`}
                        onChange={e => setCfg(c => ({ ...c, productMap: { ...c.productMap, [it.id]: num(e.target.value) } }))} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={load} disabled={saving} data-testid="button-reset-bridge">Скасувати зміни</Button>
          <Button onClick={onSave} disabled={saving} className="gap-1.5" data-testid="button-save-bridge">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Зберегти
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Увімкнути передавання в Poster?</AlertDialogTitle>
            <AlertDialogDescription>
              Нові замовлення будуть створювати реальні відкриті рахунки в Poster (заклад {cfg.spotId}, каса {cfg.tabletId}).
              {cfg.kitchenEnabled ? " Для нових рахунків касовий модуль також відправлятиме бігунки після відкриття й звірки рахунку на касі. Це може запустити фізичні принтери." : " Друк бігунків вимкнено."}
              {" "}Оплата та фіскалізація тут не виконуються.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-enable">Скасувати</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-enable" onClick={() => { setConfirmOpen(false); save(cfg); }}>
              <Send className="w-3.5 h-3.5 mr-1.5" />Увімкнути
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
