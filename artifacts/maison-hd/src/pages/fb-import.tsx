import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, CheckCircle2, AlertTriangle, Loader2,
  Download, Package, Tag, Image, RefreshCw, ChevronRight,
  FileDown, Utensils, FolderOpen, X, Check, Info,
  FlaskConical, Carrot, Wrench,
} from "lucide-react";

const BASE = "/api/fb/import/poster";
async function api(path: string, body: any) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PosterCategory { poster_id: string; name: string; parent_id: string | null; photo: string | null; sort_order: number; product_count: number; }
interface PosterItem { poster_id: string; name: string; category_id: string; category_name: string; price: number; photo_url: string | null; weight: string | null; }
interface PosterDish { poster_id: string; name: string; category_name: string; price: number; photo_url: string | null; yield: string | null; yield_unit: string; ingredient_count: number; }
interface PosterIngredient { poster_id: string; name: string; category: string; unit: string; cost: number; barcode: string | null; }
interface PosterWorkshop { poster_id: string; name: string; }

interface PreviewData {
  account: string;
  categories: PosterCategory[];
  items: PosterItem[];
  dishes: PosterDish[];
  ingredients: PosterIngredient[];
  workshops: PosterWorkshop[];
  ingredient_categories: string[];
  stats: {
    categories_count: number;
    items_count: number;
    dishes_count: number;
    dishes_with_recipes: number;
    ingredients_count: number;
    ingredient_categories_count: number;
    workshops_count: number;
    with_photo: number;
    with_price: number;
  };
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = ["Підключення", "Перегляд", "Налаштування", "Імпорт"];
  return (
    <div className="flex items-center gap-1 mb-8">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            i < current ? "bg-green-100 text-green-800" :
            i === current ? "bg-primary text-primary-foreground" :
            "bg-muted text-muted-foreground"
          }`}>
            {i < current ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center text-xs">{i + 1}</span>}
            {s}
          </div>
          {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Connect ──────────────────────────────────────────────────────────
function StepConnect({ onNext }: { onNext: (account: string, token: string, data: PreviewData) => void }) {
  const [account, setAccount] = useState("");
  const [token, setToken] = useState("");
  const [manual, setManual] = useState(false);
  const { toast } = useToast();

  const preview = useMutation({
    mutationFn: () => api("/preview", manual ? { account: account.trim(), token: token.trim() } : {}),
    onSuccess: (data) => onNext(manual ? account.trim() : "", manual ? token.trim() : "", data),
    onError: (e: any) => toast({ title: "Помилка підключення", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="border rounded-xl p-6 space-y-5 bg-card">
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">🧾</div>
          <div>
            <div className="font-semibold">Poster POS</div>
            <div className="text-xs text-muted-foreground">Повний імпорт: меню, тех. картки, інгредієнти</div>
          </div>
        </div>

        {!manual && (
          <div className="space-y-3" data-testid="poster-saved-import">
            <p className="text-sm text-muted-foreground">Використаємо збережене підключення Poster поточного закладу. Токен повторно вводити не потрібно.</p>
            <p className="text-sm">Спочатку відкриється попередній перегляд. Меню та ціни Maison HD зміняться лише після окремого запуску імпорту.</p>
          </div>
        )}
        {manual && <><div>
          <Label>Обліковий запис Poster</Label>
          <div className="flex items-center mt-1 rounded-md border overflow-hidden">
            <span className="px-3 text-sm text-muted-foreground bg-muted border-r h-9 flex items-center shrink-0">https://</span>
            <Input
              value={account}
              onChange={e => setAccount(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
              placeholder="myrestaurant"
              className="border-0 rounded-none focus-visible:ring-0"
            />
            <span className="px-3 text-sm text-muted-foreground bg-muted border-l h-9 flex items-center shrink-0">.joinposter.com</span>
          </div>
        </div>

        <div>
          <Label>API-токен</Label>
          <Input
            value={token}
            onChange={e => setToken(e.target.value.trim())}
            type="password"
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
            className="mt-1 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Poster: <span className="font-medium">Налаштування → Інтеграції → API → Скопіювати токен</span>
          </p>
        </div>

        </>}
        <Button className="w-full" data-testid="button-preview-poster-menu" onClick={() => preview.mutate()} disabled={(manual && (!account.trim() || !token.trim())) || preview.isPending}>
          {preview.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Підключення...</> : <><ArrowRight className="w-4 h-4 mr-2" /> Підключитись та переглянути</>}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setManual(v => !v)} disabled={preview.isPending}>
          {manual ? "Використати збережене підключення" : "Вказати інше підключення вручну"}
        </Button>
      </div>

      <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-2 text-sm text-blue-800">
        <div className="flex items-center gap-2 font-medium"><Info className="w-4 h-4" /> Що можна імпортувати з Poster</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-700">
          <div className="flex items-center gap-1.5"><FolderOpen className="w-3 h-3" /> Категорії меню</div>
          <div className="flex items-center gap-1.5"><Utensils className="w-3 h-3" /> Товари (страви)</div>
          <div className="flex items-center gap-1.5"><FlaskConical className="w-3 h-3" /> Тех. картки з рецептами</div>
          <div className="flex items-center gap-1.5"><Carrot className="w-3 h-3" /> Інгредієнти зі складу</div>
          <div className="flex items-center gap-1.5"><Wrench className="w-3 h-3" /> Цехи та станції</div>
          <div className="flex items-center gap-1.5"><Image className="w-3 h-3" /> Фото позицій</div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Preview ──────────────────────────────────────────────────────────
function StepPreview({ data, onNext, onBack }: { data: PreviewData; onNext: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<"cats" | "items" | "dishes" | "ingredients" | "workshops">("cats");
  const { stats } = data;

  const TABS = [
    { key: "cats", label: `Категорії (${data.categories.length})` },
    { key: "items", label: `Товари (${data.items.length})` },
    { key: "dishes", label: `Тех. картки (${data.dishes.length})` },
    { key: "ingredients", label: `Інгредієнти (${data.ingredients.length})` },
    { key: "workshops", label: `Цехи (${data.workshops.length})` },
  ] as const;

  const statCards = [
    { label: "Категорії", value: stats.categories_count, icon: FolderOpen, color: "text-blue-600" },
    { label: "Товари", value: stats.items_count, icon: Utensils, color: "text-primary" },
    { label: "Тех. картки", value: stats.dishes_count, icon: FlaskConical, color: "text-violet-600" },
    { label: "З рецептами", value: stats.dishes_with_recipes, icon: Check, color: "text-green-600" },
    { label: "Інгредієнти", value: stats.ingredients_count, icon: Carrot, color: "text-amber-600" },
    { label: "Кат. інгр.", value: stats.ingredient_categories_count, icon: Tag, color: "text-amber-500" },
    { label: "Цехи", value: stats.workshops_count, icon: Wrench, color: "text-slate-600" },
    { label: "З фото", value: stats.with_photo, icon: Image, color: "text-pink-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {statCards.map(s => (
          <div key={s.label} className="border rounded-lg p-3 text-center bg-card">
            <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <div className="text-lg font-bold">{s.value}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <div className="flex border-b overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 font-medium shrink-0 ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
        {tab === "cats" && (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0"><tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Категорія</th>
              <th className="text-right px-3 py-2 font-medium">Товарів</th>
              <th className="text-left px-3 py-2 font-medium">Підкат.</th>
            </tr></thead>
            <tbody className="divide-y">
              {data.categories.map(c => (
                <tr key={c.poster_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-right">{c.product_count}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.parent_id ? "так" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "items" && (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0"><tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Товар</th>
              <th className="text-left px-3 py-2 font-medium">Категорія</th>
              <th className="text-right px-3 py-2 font-medium">Ціна</th>
              <th className="text-center px-3 py-2 font-medium">Фото</th>
            </tr></thead>
            <tbody className="divide-y">
              {data.items.map(i => (
                <tr key={i.poster_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium max-w-[180px] truncate">{i.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">{i.category_name}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{i.price > 0 ? `${i.price.toFixed(2)} ₴` : <span className="text-amber-500">—</span>}</td>
                  <td className="px-3 py-2 text-center">{i.photo_url ? <CheckCircle2 className="w-3 h-3 text-green-600 mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "dishes" && (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0"><tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Тех. картка</th>
              <th className="text-left px-3 py-2 font-medium">Категорія</th>
              <th className="text-right px-3 py-2 font-medium">Ціна</th>
              <th className="text-right px-3 py-2 font-medium">Інгр.</th>
              <th className="text-right px-3 py-2 font-medium">Вихід</th>
            </tr></thead>
            <tbody className="divide-y">
              {data.dishes.map(d => (
                <tr key={d.poster_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium max-w-[160px] truncate">{d.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[100px]">{d.category_name}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{d.price > 0 ? `${d.price.toFixed(2)} ₴` : "—"}</td>
                  <td className="px-3 py-2 text-right text-xs">{d.ingredient_count > 0 ? <span className="text-green-600 font-medium">{d.ingredient_count}</span> : <span className="text-muted-foreground">0</span>}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{d.yield ? `${d.yield} ${d.yield_unit}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "ingredients" && (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0"><tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Інгредієнт</th>
              <th className="text-left px-3 py-2 font-medium">Категорія</th>
              <th className="text-center px-3 py-2 font-medium">Од.</th>
              <th className="text-right px-3 py-2 font-medium">Собівартість</th>
            </tr></thead>
            <tbody className="divide-y">
              {data.ingredients.map(i => (
                <tr key={i.poster_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium max-w-[180px] truncate">{i.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">{i.category || "—"}</td>
                  <td className="px-3 py-2 text-center text-xs">{i.unit}</td>
                  <td className="px-3 py-2 text-right text-xs font-mono">{i.cost > 0 ? `${i.cost.toFixed(2)} ₴` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "workshops" && (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0"><tr className="text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">ID</th>
              <th className="text-left px-3 py-2 font-medium">Назва цеху</th>
            </tr></thead>
            <tbody className="divide-y">
              {data.workshops.length === 0
                ? <tr><td colSpan={2} className="px-3 py-6 text-center text-muted-foreground text-xs">Цехи не знайдено</td></tr>
                : data.workshops.map(w => (
                  <tr key={w.poster_id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{w.poster_id}</td>
                    <td className="px-3 py-2 font-medium">{w.name}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onBack}>Назад</Button>
        <Button onClick={onNext}><ArrowRight className="w-4 h-4 mr-1" /> Налаштувати імпорт</Button>
      </div>
    </div>
  );
}

// ─── Step 3: Options ──────────────────────────────────────────────────────────
function StepOptions({ data, onNext, onBack }: { data: PreviewData; onNext: (opts: any) => void; onBack: () => void }) {
  const [overwrite, setOverwrite] = useState(false);
  const [skipNoPrice, setSkipNoPrice] = useState(false);
  const [importPhotos, setImportPhotos] = useState(true);
  const [importIngredients, setImportIngredients] = useState(false);
  const [importDishes, setImportDishes] = useState(data.stats.dishes_count > 0);
  const [importRecipes, setImportRecipes] = useState(false);

  const noPrice = data.items.filter(i => i.price === 0).length;

  const totalItems = data.stats.items_count + (importDishes ? data.stats.dishes_count : 0);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="border rounded-xl divide-y bg-card overflow-hidden">
        <div className="p-4">
          <h3 className="font-semibold mb-4">Що імпортувати</h3>
          <div className="space-y-4">

            {/* Always imported */}
            <div className="flex items-start gap-3 opacity-60">
              <div className="w-10 h-5 rounded-full bg-primary flex items-center justify-end pr-0.5 shrink-0 mt-0.5">
                <div className="w-4 h-4 rounded-full bg-white" />
              </div>
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  Категорії та товари
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">завжди</span>
                </div>
                <div className="text-xs text-muted-foreground">{data.stats.categories_count} категорій, {data.stats.items_count} товарів</div>
              </div>
            </div>

            {data.stats.ingredients_count > 0 && (
              <div className="flex items-start gap-3">
                <Switch checked={importIngredients} onCheckedChange={setImportIngredients} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Carrot className="w-3.5 h-3.5 text-amber-600" /> Інгредієнти
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">{data.stats.ingredients_count} шт</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{data.stats.ingredient_categories_count} категорій. Імпортуються до складу.</div>
                </div>
              </div>
            )}

            {data.stats.dishes_count > 0 && (
              <div className="flex items-start gap-3">
                <Switch checked={importDishes} onCheckedChange={v => { setImportDishes(v); if (!v) setImportRecipes(false); }} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <FlaskConical className="w-3.5 h-3.5 text-violet-600" /> Тех. картки
                    <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">{data.stats.dishes_count} шт</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Страви та напівфабрикати як позиції меню</div>
                </div>
              </div>
            )}

            {importDishes && data.stats.dishes_with_recipes > 0 && (
              <div className="flex items-start gap-3 ml-7 pl-2 border-l-2 border-muted">
                <Switch checked={importRecipes} onCheckedChange={setImportRecipes} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    Прив'язати рецепти до інгредієнтів
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{data.stats.dishes_with_recipes} з {data.stats.dishes_count}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {importIngredients ? "Складники тех. карток будуть пов'язані з імпортованими інгредієнтами" : "Потребує імпорту інгредієнтів"}
                  </div>
                  {importRecipes && !importIngredients && (
                    <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> Увімкніть імпорт інгредієнтів</div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Додаткові параметри</div>
              <div className="flex items-start gap-3">
                <Switch checked={overwrite} onCheckedChange={setOverwrite} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Оновити вже наявні позиції</div>
                  <div className="text-xs text-muted-foreground">Якщо в HMS вже є позиція з такою ж назвою — оновити ціну та фото.</div>
                  <div className="text-xs text-amber-700 mt-1">Для актуалізації старих цін увімкніть цю опцію. Перейменовані страви можуть додатися окремо; відсутні в Poster позиції автоматично не видаляються.</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Switch checked={importPhotos} onCheckedChange={setImportPhotos} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    Імпортувати фото
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{data.stats.with_photo} позицій</span>
                  </div>
                </div>
              </div>

              {noPrice > 0 && (
                <div className="flex items-start gap-3">
                  <Switch checked={skipNoPrice} onCheckedChange={setSkipNoPrice} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      Пропустити товари без ціни
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{noPrice} шт</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground mb-2">Буде імпортовано:</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Категорій</span><span className="font-medium">{data.stats.categories_count}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Товарів</span><span className="font-medium">{skipNoPrice ? data.stats.with_price : data.stats.items_count}</span></div>
            {importDishes && <div className="flex justify-between"><span className="text-muted-foreground">Тех. карток</span><span className="font-medium text-violet-700">{data.stats.dishes_count}</span></div>}
            {importIngredients && <div className="flex justify-between"><span className="text-muted-foreground">Інгредієнтів</span><span className="font-medium text-amber-700">{data.stats.ingredients_count}</span></div>}
            {importDishes && importRecipes && importIngredients && <div className="flex justify-between"><span className="text-muted-foreground">Рецептів</span><span className="font-medium text-green-700">{data.stats.dishes_with_recipes}</span></div>}
            {overwrite && <div className="flex items-center gap-1 text-amber-600 text-xs mt-1"><AlertTriangle className="w-3 h-3" /> Наявні позиції будуть оновлені</div>}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onBack}>Назад</Button>
        <Button onClick={() => onNext({
          overwrite_existing: overwrite,
          skip_no_price: skipNoPrice,
          import_photos: importPhotos,
          import_ingredients: importIngredients,
          import_dishes: importDishes,
          import_recipes: importRecipes && importIngredients,
        })}>
          <Download className="w-4 h-4 mr-1" /> Запустити імпорт
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Result ───────────────────────────────────────────────────────────
function StepResult({ result, onReset, onGoMenu }: { result: any; onReset: () => void; onGoMenu: () => void }) {
  const { stats } = result;
  const rows = [
    { label: "Категорій створено", value: stats.categories_created, icon: FolderOpen, color: "text-green-600" },
    { label: "Категорій перевикористано", value: stats.categories_reused, icon: Check, color: "text-muted-foreground" },
    { label: "Товарів додано", value: stats.items_created, icon: Utensils, color: "text-green-600" },
    { label: "Товарів оновлено", value: stats.items_updated, icon: RefreshCw, color: "text-blue-600" },
    { label: "Товарів пропущено", value: stats.items_skipped, icon: X, color: "text-muted-foreground" },
    ...(stats.dishes_created > 0 || stats.dishes_updated > 0 || stats.dishes_skipped > 0 ? [
      { label: "Тех. карток додано", value: stats.dishes_created, icon: FlaskConical, color: "text-violet-600" },
      { label: "Тех. карток оновлено", value: stats.dishes_updated, icon: RefreshCw, color: "text-blue-600" },
      { label: "Тех. карток пропущено", value: stats.dishes_skipped, icon: X, color: "text-muted-foreground" },
    ] : []),
    ...(stats.ingredients_created > 0 || stats.ingredients_updated > 0 || stats.ingredients_skipped > 0 ? [
      { label: "Інгредієнтів додано", value: stats.ingredients_created, icon: Carrot, color: "text-amber-600" },
      { label: "Інгредієнтів оновлено", value: stats.ingredients_updated, icon: RefreshCw, color: "text-blue-600" },
      { label: "Інгредієнтів пропущено", value: stats.ingredients_skipped, icon: X, color: "text-muted-foreground" },
    ] : []),
    ...(stats.recipes_linked > 0 ? [
      { label: "Рецептурних позицій пов'язано", value: stats.recipes_linked, icon: Check, color: "text-green-600" },
    ] : []),
  ].filter(r => r.value !== undefined);

  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Імпорт завершено!</h2>
        <p className="text-muted-foreground text-sm mt-1">Дані з Poster успішно перенесено до Maison HD</p>
      </div>
      <div className="border rounded-xl overflow-hidden divide-y bg-card text-left">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <row.icon className={`w-4 h-4 ${row.color}`} />
              <span>{row.label}</span>
            </div>
            <span className={`font-bold text-base ${row.value > 0 ? row.color : "text-muted-foreground"}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={onReset}><RefreshCw className="w-4 h-4 mr-1" /> Новий імпорт</Button>
        <Button onClick={onGoMenu}><Utensils className="w-4 h-4 mr-1" /> Перейти до меню</Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FbImport() {
  const { toast } = useToast();
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState("");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<any>(null);

  const execute = useMutation({
    mutationFn: (opts: any) => api("/execute", { account, token, options: opts, orgId: user?.organizationId ?? undefined }),
    onSuccess: (data) => { setResult(data); setStep(3); },
    onError: (e: any) => toast({ title: "Помилка імпорту", description: e.message, variant: "destructive" }),
  });

  function reset() { setStep(0); setPreview(null); setResult(null); setAccount(""); setToken(""); }

  return (
    <AppLayout>
      <div className="flex flex-col min-h-[calc(100vh-4rem)]">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-lg">🧾</div>
            <div>
              <h1 className="text-lg font-bold">Імпорт з Poster</h1>
              <p className="text-xs text-muted-foreground">Товари, тех. картки, інгредієнти, цехи — все одним кліком</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6">
          <Steps current={step} />

          {step === 0 && (
            <StepConnect onNext={(acc, tok, data) => { setAccount(acc); setToken(tok); setPreview(data); setStep(1); }} />
          )}
          {step === 1 && preview && (
            <StepPreview data={preview} onNext={() => setStep(2)} onBack={() => setStep(0)} />
          )}
          {step === 2 && preview && (
            <StepOptions data={preview} onNext={(opts) => execute.mutate(opts)} onBack={() => setStep(1)} />
          )}
          {execute.isPending && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-card border rounded-xl p-8 text-center space-y-4 shadow-xl max-w-xs w-full">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <div>
                  <div className="font-semibold">Імпортуємо дані з Poster...</div>
                  <div className="text-sm text-muted-foreground mt-1">Залежно від кількості даних це може зайняти до хвилини</div>
                </div>
              </div>
            </div>
          )}
          {step === 3 && result && <StepResult result={result} onReset={reset} onGoMenu={() => setLocation("/fb/menu")} />}
        </div>
      </div>
    </AppLayout>
  );
}
