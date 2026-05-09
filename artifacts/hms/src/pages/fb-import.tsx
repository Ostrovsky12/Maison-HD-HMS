import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/fb/import/poster";
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
interface PreviewData { account: string; categories: PosterCategory[]; items: PosterItem[]; stats: { categories_count: number; items_count: number; with_photo: number; with_price: number }; }

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
  const { toast } = useToast();

  const preview = useMutation({
    mutationFn: () => api("/preview", { account: account.trim(), token: token.trim() }),
    onSuccess: (data) => onNext(account.trim(), token.trim(), data),
    onError: (e: any) => toast({ title: "Помилка підключення", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="border rounded-xl p-6 space-y-5 bg-card">
        {/* Poster logo area */}
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">🧾</div>
          <div>
            <div className="font-semibold">Poster POS</div>
            <div className="text-xs text-muted-foreground">Імпорт меню, категорій та позицій</div>
          </div>
        </div>

        <div>
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
          <p className="text-xs text-muted-foreground mt-1">Введіть слаг вашого закладу в Poster</p>
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
            Знайти в Poster: <span className="font-medium">Налаштування → Інтеграції → API → Скопіювати токен</span>
          </p>
        </div>

        <Button
          className="w-full"
          onClick={() => preview.mutate()}
          disabled={!account.trim() || !token.trim() || preview.isPending}
        >
          {preview.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Підключення...</> : <><ArrowRight className="w-4 h-4 mr-2" /> Підключитись та переглянути</>}
        </Button>
      </div>

      {/* Info block */}
      <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-2 text-sm text-blue-800">
        <div className="flex items-center gap-2 font-medium"><Info className="w-4 h-4" /> Що буде імпортовано</div>
        <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
          <li>Всі категорії меню з Poster</li>
          <li>Позиції меню: назви, ціни, фото</li>
          <li>Наявні в HMS категорії з такою ж назвою — будуть пропущені</li>
          <li>Наявні страви з такою ж назвою — пропускаються (або оновлюються)</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Step 2: Preview ──────────────────────────────────────────────────────────
function StepPreview({ data, onNext, onBack }: { data: PreviewData; onNext: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<"cats" | "items">("cats");
  const { stats } = data;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Категорій", value: stats.categories_count, icon: FolderOpen },
          { label: "Страв", value: stats.items_count, icon: Utensils },
          { label: "З фото", value: stats.with_photo, icon: Image },
          { label: "З ціною", value: stats.with_price, icon: Tag },
        ].map(s => (
          <div key={s.label} className="border rounded-lg p-3 text-center bg-card">
            <s.icon className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table toggle */}
      <div className="flex border-b">
        <button onClick={() => setTab("cats")} className={`px-4 py-2 text-sm border-b-2 font-medium ${tab === "cats" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          Категорії ({data.categories.length})
        </button>
        <button onClick={() => setTab("items")} className={`px-4 py-2 text-sm border-b-2 font-medium ${tab === "items" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          Страви ({data.items.length})
        </button>
      </div>

      {/* Tables */}
      <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
        {tab === "cats" ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Категорія Poster</th>
                <th className="text-right px-3 py-2 font-medium">Страв</th>
                <th className="text-left px-3 py-2 font-medium">Підкатегорія</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.categories.map(c => (
                <tr key={c.poster_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-right">{c.product_count}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{c.parent_id ? "так" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Страва</th>
                <th className="text-left px-3 py-2 font-medium">Категорія</th>
                <th className="text-right px-3 py-2 font-medium">Ціна, ₴</th>
                <th className="text-center px-3 py-2 font-medium">Фото</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map(it => (
                <tr key={it.poster_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium max-w-[200px] truncate">{it.name}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[120px]">{it.category_name}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.price > 0 ? it.price.toFixed(2) : <span className="text-amber-600">—</span>}</td>
                  <td className="px-3 py-2 text-center">{it.photo_url ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</td>
                </tr>
              ))}
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
  const noPrice = data.items.filter(i => i.price === 0).length;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="border rounded-xl divide-y bg-card overflow-hidden">
        <div className="p-4">
          <h3 className="font-semibold mb-3">Налаштування імпорту</h3>
          <div className="space-y-4">

            <div className="flex items-start gap-3">
              <Switch checked={overwrite} onCheckedChange={setOverwrite} className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Оновити вже наявні позиції</div>
                <div className="text-xs text-muted-foreground">Якщо в HMS вже є страва з такою ж назвою — оновити ціну та фото. Якщо вимкнено — пропустити.</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Switch checked={importPhotos} onCheckedChange={setImportPhotos} className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Імпортувати фото</div>
                <div className="text-xs text-muted-foreground">Зберегти URL фото зі страниці Poster. Знайдено {data.stats.with_photo} з {data.stats.items_count} позицій.</div>
              </div>
            </div>

            {noPrice > 0 && (
              <div className="flex items-start gap-3">
                <Switch checked={skipNoPrice} onCheckedChange={setSkipNoPrice} className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    Пропустити позиції без ціни
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-normal">{noPrice} шт</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Позиції з ціною 0 ₴ не будуть імпортовані.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-muted/30">
          <div className="text-xs text-muted-foreground mb-2 font-medium">Очікуваний результат:</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Категорій буде додано / перевикористано:</span> <span className="font-medium">{data.stats.categories_count}</span></div>
            <div className="flex justify-between">
              <span>Страв буде імпортовано:</span>
              <span className="font-medium">{skipNoPrice ? data.stats.with_price : data.stats.items_count}</span>
            </div>
            {overwrite && <div className="flex items-center gap-1 text-amber-700 text-xs"><AlertTriangle className="w-3 h-3" /> Наявні позиції в HMS будуть оновлені</div>}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onBack}>Назад</Button>
        <Button onClick={() => onNext({ overwrite_existing: overwrite, skip_no_price: skipNoPrice, import_photos: importPhotos })}>
          <Download className="w-4 h-4 mr-1" /> Запустити імпорт
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Result ───────────────────────────────────────────────────────────
function StepResult({ result, onReset }: { result: any; onReset: () => void }) {
  const { stats } = result;
  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Імпорт завершено!</h2>
        <p className="text-muted-foreground text-sm mt-1">Дані з Poster успішно додані до вашого меню</p>
      </div>
      <div className="border rounded-xl overflow-hidden divide-y bg-card text-left">
        {[
          { label: "Категорій створено", value: stats.categories_created, icon: FolderOpen, color: "text-green-600" },
          { label: "Категорій перевикористано", value: stats.categories_reused, icon: Check, color: "text-muted-foreground" },
          { label: "Страв додано", value: stats.items_created, icon: Utensils, color: "text-green-600" },
          { label: "Страв оновлено", value: stats.items_updated, icon: RefreshCw, color: "text-blue-600" },
          { label: "Страв пропущено", value: stats.items_skipped, icon: X, color: "text-muted-foreground" },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <row.icon className={`w-4 h-4 ${row.color}`} />
              <span>{row.label}</span>
            </div>
            <span className={`font-bold text-lg ${row.value > 0 ? row.color : "text-muted-foreground"}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={onReset}><RefreshCw className="w-4 h-4 mr-1" /> Новий імпорт</Button>
        <Button onClick={() => window.location.href = (import.meta.env.BASE_URL + "fb/menu").replace("//", "/")}>
          <Utensils className="w-4 h-4 mr-1" /> Перейти до меню
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FbImport() {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState("");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<any>(null);

  const execute = useMutation({
    mutationFn: (opts: any) => api("/execute", { account, token, options: opts }),
    onSuccess: (data) => { setResult(data); setStep(3); },
    onError: (e: any) => toast({ title: "Помилка імпорту", description: e.message, variant: "destructive" }),
  });

  function reset() { setStep(0); setPreview(null); setResult(null); setAccount(""); setToken(""); }

  return (
    <AppLayout>
      <div className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-lg">🧾</div>
            <div>
              <h1 className="text-lg font-bold">Імпорт з Poster</h1>
              <p className="text-xs text-muted-foreground">Перенесіть меню з Poster POS до Maison HD одним кліком</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6">
          <Steps current={step} />

          {step === 0 && (
            <StepConnect onNext={(acc, tok, data) => {
              setAccount(acc); setToken(tok); setPreview(data); setStep(1);
            }} />
          )}
          {step === 1 && preview && (
            <StepPreview data={preview} onNext={() => setStep(2)} onBack={() => setStep(0)} />
          )}
          {step === 2 && preview && (
            <StepOptions
              data={preview}
              onNext={(opts) => execute.mutate(opts)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 2 && execute.isPending && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-card border rounded-xl p-8 text-center space-y-4 shadow-xl">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <div>
                  <div className="font-semibold">Імпортуємо дані...</div>
                  <div className="text-sm text-muted-foreground">Це може зайняти кілька секунд</div>
                </div>
              </div>
            </div>
          )}
          {step === 3 && result && <StepResult result={result} onReset={reset} />}
        </div>
      </div>
    </AppLayout>
  );
}
