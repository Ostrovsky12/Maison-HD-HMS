import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { parseVideo } from "@/lib/booking-media";

/** Click-to-load video. Nothing is fetched or played until the guest asks. */
export function UnitVideo({ url, title, unitId, initiallyOpen = false }: { url: string; title: string; unitId: number; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
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
