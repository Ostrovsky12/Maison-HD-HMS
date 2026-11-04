import { useState } from "react";
import { ChevronLeft, ChevronRight, Images, ImageOff, PlayCircle, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { UnitVideo } from "@/components/booking/unit-video";
import { parseVideo } from "@/lib/booking-media";
import type { CatalogItem } from "@/lib/booking-appearance";

/** Photo/video showcase of real saved accommodation content. IDs are content identifiers only. */
export function DogodaShowcase({ items }: { items: CatalogItem[] }) {
  const [open, setOpen] = useState<{ item: CatalogItem; idx: number } | null>(null);
  const [videoFor, setVideoFor] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const withMedia = items.filter((i) => i.photos.length > 0 || parseVideo(i.videoUrl));

  return (
    <section aria-labelledby="dg-showcase-title" className="max-w-6xl mx-auto px-5 pt-14 md:pt-20 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8 md:mb-10">
        <div>
          <p className="dg-hand text-2xl md:text-3xl" style={{ color: "var(--dg-button)" }}>take a look</p>
          <h2 id="dg-showcase-title" className="text-3xl md:text-5xl leading-[1.05] tracking-tight mt-1">Де ви будете відпочивати</h2>
        </div>
        <p className="dg-muted text-sm max-w-sm">Справжні фото й відео наших будиночків. Ціни та вільні дати побачите після пошуку нижче.</p>
      </div>

      {withMedia.length === 0 ? (
        <div className="dg-surface rounded-[28px] border dg-line p-10 md:p-14 text-center" data-testid="dogoda-gallery-empty">
          <Images className="w-8 h-8 mx-auto opacity-60" aria-hidden />
          <p className="text-xl mt-4">Фотографії скоро з'являться</p>
          <p className="dg-muted text-sm mt-2 max-w-md mx-auto">Ми ще не завантажили знімки будиночків. Ми не показуємо чужих чи згенерованих фото, тож краще зателефонуйте нам, і ми розповімо все самі.</p>
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-6 md:gap-8">
          {withMedia.map((it, i) => {
            const vid = parseVideo(it.videoUrl);
            const big = i === 0 && withMedia.length % 2 === 1;
            return (
              <li key={it.id} className={`dg-card dg-surface rounded-[28px] overflow-hidden border dg-line ${big ? "md:col-span-2" : ""}`} data-testid={`card-catalog-${i}`}>
                {it.photos.length > 0 ? (
                  <button type="button" onClick={() => setOpen({ item: it, idx: 0 })} aria-label={`Відкрити фото: ${it.name}, ${it.photos.length} шт.`}
                    className={`relative block w-full overflow-hidden ${big ? "aspect-[16/9] md:aspect-[21/9]" : "aspect-[4/3]"}`} data-testid={`button-catalog-photos-${i}`}>
                    <img src={it.photos[0]} alt="" loading="lazy" className="dg-card-img absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute bottom-3 right-3 rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1.5" style={{ background: "var(--dg-surface)", color: "var(--dg-text)" }}>
                      <Images className="w-3.5 h-3.5" aria-hidden />{it.photos.length} фото
                    </span>
                  </button>
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--dg-muted) 25%, var(--dg-bg))" }}>
                    <ImageOff className="w-7 h-7 opacity-50" aria-hidden /><span className="sr-only">Фото не додано</span>
                  </div>
                )}
                <div className="p-5 md:p-7">
                  {it.category && <p className="text-[11px] uppercase tracking-[0.2em] dg-muted">{it.category}</p>}
                  <h3 className="text-2xl md:text-[28px] leading-tight mt-1">{it.name}</h3>
                  {it.description && (
                    <div className="mt-3">
                      <p id={`catalog-description-${i}`} className={`dg-muted text-sm whitespace-pre-line ${expandedDescriptions[it.id] ? "" : "line-clamp-4"}`}>{it.description}</p>
                      {(it.description.length > 200 || it.description.split("\n").length > 4) && (
                        <button type="button" aria-expanded={!!expandedDescriptions[it.id]} aria-controls={`catalog-description-${i}`}
                          onClick={() => setExpandedDescriptions(current => ({ ...current, [it.id]: !current[it.id] }))}
                          className="mt-2 text-sm underline underline-offset-4">
                          {expandedDescriptions[it.id] ? "Згорнути опис" : "Повний опис"}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {it.photos.length > 1 && (
                      <button type="button" onClick={() => setOpen({ item: it, idx: 0 })} className="rounded-full border dg-line px-4 py-2 text-sm inline-flex items-center gap-1.5 hover:opacity-80">
                        <Images className="w-4 h-4" aria-hidden />Усі фото
                      </button>
                    )}
                    {vid && videoFor !== it.id && (
                      <button type="button" onClick={() => setVideoFor(it.id)} className="rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5 dg-btn" data-testid={`button-catalog-video-${i}`}>
                        <PlayCircle className="w-4 h-4" aria-hidden />Дивитися відео
                      </button>
                    )}
                  </div>
                  {vid && videoFor === it.id && <UnitVideo url={it.videoUrl} title={it.name} unitId={i} initiallyOpen />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && <Lightbox item={open.item} start={open.idx} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Lightbox({ item, start, onClose }: { item: CatalogItem; start: number; onClose: () => void }) {
  const [idx, setIdx] = useState(start);
  const count = item.photos.length;
  const go = (d: number) => setIdx((i) => (i + d + count) % count);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl w-[96vw] p-0 border-0 overflow-hidden [&>button]:hidden" style={{ background: "#1d1f06", color: "#FFF4E5" }}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }}>
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        <DialogDescription className="sr-only">Фото {idx + 1} з {count}. Стрілки вліво і вправо перемикають фото, Escape закриває.</DialogDescription>
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm truncate">{item.name} <span className="opacity-60 ml-2 tabular-nums">{idx + 1} / {count}</span></p>
          <DialogClose className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#DF7D3C]" aria-label="Закрити">
            <X className="w-5 h-5" />
          </DialogClose>
        </div>
        <div className="relative aspect-[3/2] max-h-[72dvh] w-full bg-black/40">
          <img src={item.photos[idx]} alt={`${item.name}, фото ${idx + 1} з ${count}`} className="absolute inset-0 w-full h-full object-contain" />
          {count > 1 && (<>
            <button type="button" aria-label="Попереднє фото" onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#FFF4E5]/15 hover:bg-[#FFF4E5]/30 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#DF7D3C]"><ChevronLeft className="w-6 h-6" /></button>
            <button type="button" aria-label="Наступне фото" onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[#FFF4E5]/15 hover:bg-[#FFF4E5]/30 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#DF7D3C]"><ChevronRight className="w-6 h-6" /></button>
          </>)}
        </div>
        {count > 1 && (
          <div className="flex gap-2 p-3 overflow-x-auto" role="list" aria-label="Мініатюри">
            {item.photos.map((p, i) => (
              <button key={i} type="button" role="listitem" aria-label={`Фото ${i + 1}`} aria-current={i === idx} onClick={() => setIdx(i)}
                className={`shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#DF7D3C] ${i === idx ? "border-[#DF7D3C]" : "border-transparent opacity-60 hover:opacity-100"}`}>
                <img src={p} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
