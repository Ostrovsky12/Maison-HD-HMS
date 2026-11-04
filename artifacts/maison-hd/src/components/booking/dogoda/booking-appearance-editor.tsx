import { Copy, ExternalLink, RotateCcw } from "lucide-react";
import { DogodaLogo } from "./dogoda-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOGODA_DEFAULTS, type BookingAppearanceValue } from "@/lib/booking-appearance";

type Props = {
  value: BookingAppearanceValue;
  onChange: (v: BookingAppearanceValue) => void;
  disabled: boolean;
  previewUrl: string;
  onCopy: (text: string) => void;
};

const COLORS: { key: "backgroundColor" | "surfaceColor" | "textColor" | "mutedColor" | "buttonColor"; label: string }[] = [
  { key: "backgroundColor", label: "Фон" },
  { key: "surfaceColor", label: "Картки" },
  { key: "textColor", label: "Текст" },
  { key: "mutedColor", label: "Другорядний" },
  { key: "buttonColor", label: "Кнопки" },
];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Controlled editor. Persists only through the studio's existing Save button. */
export function BookingAppearanceEditor({ value: v, onChange, disabled, previewUrl, onCopy }: Props) {
  const set = <K extends keyof BookingAppearanceValue>(k: K, x: BookingAppearanceValue[K]) => onChange({ ...v, [k]: x });
  const isDogoda = v.preset === "dogoda";

  return (
    <div className="space-y-5" data-testid="editor-appearance">
      {disabled && <p className="text-xs text-stone-500 rounded-lg bg-stone-100 px-3 py-2">Змінювати оформлення може власник або адміністратор.</p>}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Стиль сторінки">
        {(["standard", "dogoda"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={v.preset === p} disabled={disabled} data-testid={`button-preset-${p}`}
            onClick={() => set("preset", p)}
            className={`text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-60 ${v.preset === p ? "border-stone-900 bg-white" : "border-stone-200 hover:border-stone-400"}`}>
            <p className="text-sm font-medium">{p === "standard" ? "Стандартний" : "DOGODA"}</p>
            <p className="text-[11px] text-stone-500">{p === "standard" ? "Загальний шаблон Maison HD" : "Фірмовий стиль: одразу вибір дат"}</p>
          </button>
        ))}
      </div>

      <fieldset disabled={disabled || !isDogoda} className="space-y-5 disabled:opacity-60">
        <div className="grid sm:grid-cols-2 gap-3">
          {COLORS.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <Label htmlFor={`ap-${c.key}`} className="text-xs font-medium text-stone-600">{c.label}</Label>
              <div className="flex gap-2">
                <input type="color" aria-label={`${c.label}: палітра`} value={HEX.test(v[c.key]) ? v[c.key] : "#000000"} onChange={(e) => set(c.key, e.target.value.toUpperCase())}
                  className="h-9 w-12 rounded border border-stone-200 bg-transparent" data-testid={`input-ap-${c.key}-picker`} />
                <Input id={`ap-${c.key}`} value={v[c.key]} onChange={(e) => set(c.key, e.target.value)} className="font-mono" data-testid={`input-ap-${c.key}`}
                  aria-invalid={!HEX.test(v[c.key])} />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-stone-600">Шрифт</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Шрифт">
            {(["brand", "system"] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={v.font === f} onClick={() => set("font", f)} data-testid={`button-font-${f}`}
                className={`rounded-lg border px-3 py-1.5 text-sm ${v.font === f ? "border-stone-900 bg-white" : "border-stone-200"}`}>
                {f === "brand" ? "Фірмовий (Orchidea)" : "Системний"}
              </button>
            ))}
          </div>
        </div>

      </fieldset>

      <div className="rounded-xl overflow-hidden border border-stone-200" aria-label="Попередній перегляд кольорів" data-testid="preview-appearance"
        style={{ background: v.backgroundColor, color: v.textColor }}>
        <div className="p-4 space-y-3">
          {isDogoda && <DogodaLogo background={v.backgroundColor} className="w-40 h-auto" />}
          <p className="text-lg" style={{ fontFamily: v.font === "brand" ? '"DOGODA Orchidea", serif' : "system-ui, sans-serif" }}>Пора видихнути</p>
          <div className="rounded-lg p-3 text-xs" style={{ background: v.surfaceColor }}>
            <span style={{ color: v.mutedColor }}>Будиночок · до 4 гостей</span>
          </div>
          <div className="flex gap-1.5">{COLORS.map((c) => <span key={c.key} title={c.label} className="w-6 h-6 rounded-full border border-black/10" style={{ background: v[c.key] }} />)}</div>
          <div className="rounded-full py-2 text-center text-sm" style={{ background: v.buttonColor, color: v.surfaceColor }}>Знайти будиночок</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange({ ...DOGODA_DEFAULTS, heroPhotoUrl: v.heroPhotoUrl, showGallery: v.showGallery })} data-testid="button-ap-reset">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Фірмові кольори
        </Button>
        {previewUrl && !disabled && <>
          <Button type="button" size="sm" variant="outline" onClick={() => window.open(previewUrl, "_blank", "noopener")} data-testid="button-ap-preview">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Приватний перегляд
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onCopy(previewUrl)} data-testid="button-ap-copy-preview"><Copy className="w-3.5 h-3.5" /></Button>
        </>}
      </div>
      <p className="text-[11px] text-stone-400">Перегляд показує збережену версію, лише для власника й адміністратора. Збережіть зміни, щоб побачити їх.</p>
    </div>
  );
}
