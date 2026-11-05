import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Home, ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Props = { photos: string[]; title: string; category?: string; unitId: number; accent: string };

export function UnitGallery({ photos, title, category, unitId, accent }: Props) {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
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
        <button ref={expandButton} type="button" aria-label="Відкрити на весь екран" data-testid={`button-gallery-expand-${unitId}`}
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
          onCloseAutoFocus={(event) => { event.preventDefault(); expandButton.current?.focus({ preventScroll: true }); }}
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
