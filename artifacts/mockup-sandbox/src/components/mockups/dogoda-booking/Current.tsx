// DEMO EXTRACTION of current production UnitCard + UnitGallery + UnitVideo (maison-hd/src/components/booking).
// Mock data below is explicitly demo; no main-app imports.
import "./_group.css";
import { useState } from "react";
import { BedDouble, Check, ChevronLeft, ChevronRight, Expand, Home, ImageOff, Maximize2, Mountain, PlayCircle, Users, Fence } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type VideoSource = { kind: "file"; src: string; mime: string } | { kind: "embed"; src: string; provider: "YouTube" | "Vimeo" };
function parseVideo(raw: string): VideoSource | null {
  const v = raw.trim(); if (!v) return null;
  let u: URL; try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") ?? "";
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? { kind: "embed", provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : null;
  }
  if (u.pathname.endsWith(".mp4")) return { kind: "file", src: u.toString(), mime: "video/mp4" };
  return null;
}
const VIEW_LABELS: Record<string, string> = { park: "Вид на парк", garden: "Вид на сад", mountain: "Вид на гори" };

type PublicUnit = { id: number; name: string; category: string; capacity: number; description: string; basePrice: number; totalPrice: number; propertyName: string; photos: string[]; videoUrl: string; squareMeters: number | null; hasBalcony: boolean | null; hasView: string | null; maxCapacity: number | null };
const money = (v: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " грн";
const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ніч" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "ночі" : "ночей");
type Props = { photos: string[]; title: string; category?: string; unitId: number; accent: string };

function UnitGallery({ photos, title, category, unitId, accent }: Props) {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const count = photos.length;
  const go = (d: number) => setIdx((i) => (i + d + count) % count);

  if (count === 0) {
    return (
      <div className="relative h-full min-h-[200px] flex flex-col items-center justify-center gap-2 text-white/90"
        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }} data-testid={`gallery-empty-${unitId}`}>
        <Home className="w-9 h-9 opacity-80" />
        <p className="text-sm font-medium">{category || "Розміщення"}</p>
        <p className="text-[11px] opacity-70">Фото ще не додано</p>
      </div>
    );
  }

  const current = photos[idx];
  return (
    <>
      <div className="relative h-full min-h-[220px] bg-stone-900 group" data-testid={`gallery-${unitId}`}>
        {broken[idx] ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 gap-1"><ImageOff className="w-7 h-7" /><span className="text-xs">Фото недоступне</span></div>
        ) : (
          <img src={current} alt={`${title}, фото ${idx + 1} з ${count}`} loading="lazy"
            onError={() => setBroken((b) => ({ ...b, [idx]: true }))}
            className="absolute inset-0 w-full h-full object-cover" />
        )}
        {category && <span className="absolute top-3 left-3 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-md font-medium">{category}</span>}
        <span className="absolute bottom-3 left-3 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-md font-mono" data-testid={`text-photo-count-${unitId}`}>{idx + 1} / {count}</span>
        <button type="button" aria-label="Відкрити на весь екран" data-testid={`button-gallery-expand-${unitId}`}
          onClick={() => setOpen(true)} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75">
          <Expand className="w-4 h-4" />
        </button>
        {count > 1 && (
          <>
            <button type="button" aria-label="Попереднє фото" data-testid={`button-gallery-prev-${unitId}`} onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 text-stone-900 flex items-center justify-center shadow hover:bg-white"><ChevronLeft className="w-5 h-5" /></button>
            <button type="button" aria-label="Наступне фото" data-testid={`button-gallery-next-${unitId}`} onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 text-stone-900 flex items-center justify-center shadow hover:bg-white"><ChevronRight className="w-5 h-5" /></button>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl w-[96vw] p-0 bg-stone-950 border-stone-800 text-white overflow-hidden"
          onKeyDown={(e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }}>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">Фото {idx + 1} з {count}. Стрілки вліво і вправо перемикають фото.</DialogDescription>
          <div className="relative aspect-[16/10] bg-black">
            {broken[idx] ? <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">Фото недоступне</div> :
              <img src={current} alt={`${title}, фото ${idx + 1} з ${count}`} className="absolute inset-0 w-full h-full object-contain" onError={() => setBroken((b) => ({ ...b, [idx]: true }))} />}
            {count > 1 && (
              <>
                <button type="button" aria-label="Попереднє фото" onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center"><ChevronLeft className="w-6 h-6" /></button>
                <button type="button" aria-label="Наступне фото" onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center"><ChevronRight className="w-6 h-6" /></button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 p-3 overflow-x-auto">
            <span className="text-xs text-stone-400 font-mono shrink-0 mr-1">{idx + 1}/{count}</span>
            {photos.map((p, i) => (
              <button key={i} type="button" aria-label={`Фото ${i + 1}`} aria-current={i === idx} onClick={() => setIdx(i)}
                className={`shrink-0 w-16 h-11 rounded overflow-hidden border-2 ${i === idx ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}>
                <img src={p} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function UnitVideo({ url, title, unitId }: { url: string; title: string; unitId: number }) {
  const [open, setOpen] = useState(false);
  const src = parseVideo(url);
  if (!src) return null;

  if (!open) {
    return (
      <button type="button" data-testid={`button-video-${unitId}`} onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-800 rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100">
        <PlayCircle className="w-4 h-4" />Відео{src.kind === "embed" ? ` (${src.provider})` : ""}
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-xl overflow-hidden bg-black aspect-video" data-testid={`video-${unitId}`}>
      {src.kind === "file" ? (
        src.mime ? (
          <video controls playsInline preload="metadata" className="w-full h-full">
            <source src={src.src} type={src.mime} />
            Ваш браузер не відтворює це відео.
          </video>
        ) : (
          <video controls playsInline preload="metadata" className="w-full h-full" src={src.src}>Ваш браузер не відтворює це відео.</video>
        )
      ) : (
        <iframe src={src.src} title={`${title}: відео`} className="w-full h-full" loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      )}
    </div>
  );
}
type CardProps = { unit: PublicUnit; nights: number; accent: string; active: boolean; disabled: boolean; onSelect: () => void; policyBadge?: string };

function UnitCard({ unit: u, nights, accent, active, disabled, onSelect, policyBadge }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const longDesc = u.description.length > 220 || u.description.split("\n").length > 3;
  const amenities: { icon: typeof Users; label: string }[] = [];
  amenities.push({ icon: Users, label: `до ${u.capacity} гостей` });
  if (u.maxCapacity && u.maxCapacity > u.capacity) amenities.push({ icon: BedDouble, label: `макс. ${u.maxCapacity} з дод. місцями` });
  if (u.squareMeters) amenities.push({ icon: Maximize2, label: `${u.squareMeters} м²` });
  if (u.hasBalcony) amenities.push({ icon: Fence, label: "Балкон" });
  if (u.hasView) amenities.push({ icon: Mountain, label: VIEW_LABELS[u.hasView] ?? "Гарний вид" });

  return (
    <article data-testid={`card-unit-${u.id}`}
      className={`rounded-3xl bg-white overflow-hidden grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] transition-shadow ${active ? "ring-2 shadow-lg" : "border border-stone-200 hover:shadow-md"}`}
      style={active ? { ["--tw-ring-color" as string]: accent } : undefined}>
      <div className="h-60 sm:h-72 md:h-auto md:min-h-[320px]">
        <UnitGallery photos={u.photos} title={u.name} category={u.category} unitId={u.id} accent={accent} />
      </div>
      <div className="p-5 md:p-6 flex flex-col">
        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{u.category}{u.propertyName ? ` · ${u.propertyName}` : ""}</p>
        <h3 className="text-xl md:text-2xl font-semibold tracking-tight mt-1">{u.name}</h3>
        <ul className="flex flex-wrap gap-1.5 mt-3">
          {amenities.map((a) => (
            <li key={a.label} className="inline-flex items-center gap-1 text-xs text-stone-700 bg-white border border-stone-200 rounded-full px-2.5 py-1"><a.icon className="w-3.5 h-3.5" />{a.label}</li>
          ))}
        </ul>
        {u.description && (
          <div className="mt-3">
            <p id={`desc-${u.id}`} className={`text-sm text-stone-600 whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>{u.description}</p>
            {longDesc && (
              <button type="button" data-testid={`button-desc-${u.id}`} aria-expanded={expanded} aria-controls={`desc-${u.id}`}
                onClick={() => setExpanded((e) => !e)} className="text-sm font-medium underline mt-1">{expanded ? "Згорнути опис" : "Повний опис"}</button>
            )}
          </div>
        )}
        {u.videoUrl && <div className="mt-3"><UnitVideo url={u.videoUrl} title={u.name} unitId={u.id} /></div>}
        <div className="mt-auto pt-5 flex items-end justify-between gap-3 border-t border-stone-200/80">
          <div>
            <p className="text-2xl font-semibold font-mono" data-testid={`text-total-${u.id}`}>{money(u.totalPrice)}</p>
            <p className="text-xs text-stone-500">за {nights} {nightsWord(nights)}, онлайн-тариф</p>
            {policyBadge && <p className="mt-1 inline-block text-[11px] font-semibold text-red-800 bg-red-50 border border-red-200 rounded-md px-2 py-0.5">{policyBadge}</p>}
          </div>
          <button type="button" data-testid={`button-select-unit-${u.id}`} disabled={disabled} onClick={onSelect}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5" style={{ background: accent }}>
            {active ? <><Check className="w-4 h-4" />Обрано</> : "Обрати"}
          </button>
        </div>
      </div>
    </article>
  );
}

// DEMO data only — not real DOGODA inventory or prices.
const DEMO: PublicUnit[] = [
  { id: 1, name: "Демо-будиночок A", category: "Демо-категорія", capacity: 2, description: "Демонстраційний опис. Реальний текст береться з налаштувань студії.", basePrice: 1, totalPrice: 1234.5, propertyName: "Демо-об'єкт", photos: [], videoUrl: "", squareMeters: null, hasBalcony: null, hasView: null, maxCapacity: null },
  { id: 2, name: "Демо-будиночок B", category: "Демо-категорія", capacity: 4, description: "Демонстраційний опис без фото, щоб показати поточний порожній стан галереї.", basePrice: 1, totalPrice: 2345.6, propertyName: "Демо-об'єкт", photos: [], videoUrl: "", squareMeters: 42, hasBalcony: true, hasView: "garden", maxCapacity: 5 },
];

export default function Current() {
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <div className="dg-current">
      <p className="dg-demo-note">Demo extraction · current UnitCard</p>
      <div className="max-w-5xl mx-auto space-y-6">
        {DEMO.map((u) => <UnitCard key={u.id} unit={u} nights={2} accent="#1f4e5f" active={chosen === u.id} disabled={false} onSelect={() => setChosen(u.id)} policyBadge="Неповоротний · 100% передоплата" />)}
      </div>
    </div>
  );
}
