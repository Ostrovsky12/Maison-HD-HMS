import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Film, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  checkUploadFile, isAllowedPhoto, IMAGE_TYPES, MAX_PHOTOS, resolvePhotoUrl, uploadBookingMedia, VIDEO_TYPES, videoUrlError,
  type UnitMedia, type UnitMediaMap,
} from "@/lib/booking-media";
import { UnitGallery } from "./unit-gallery";
import { UnitVideo } from "./unit-video";

export type StudioUnit = { id: number; name: string; propertyId: number; propertyName: string; description: string };

type Updater = (prev: UnitMediaMap) => UnitMediaMap;
type Props = {
  units: StudioUnit[];
  value: UnitMediaMap;
  onChange: (fn: Updater) => void;
  accent: string;
  onUploadingChange?: (busy: boolean) => void;
};
type UploadState = { unitId: string; kind: "image" | "video"; label: string; done: number; total: number };

const EMPTY: UnitMedia = { photos: [], videoUrl: "", description: "" };

/** Applies a patch to one unit, identified by id captured at call time (never the current selection). */
function patchUnit(unitId: string, fn: (m: UnitMedia) => UnitMedia): Updater {
  return (prev) => {
    const next = fn(prev[unitId] ?? EMPTY);
    const copy = { ...prev };
    if (!next.photos.length && !next.videoUrl && !next.description) delete copy[unitId];
    else copy[unitId] = next;
    return copy;
  };
}

export function UnitMediaEditor({ units, value, onChange, accent, onUploadingChange }: Props) {
  const [selected, setSelected] = useState<string>(units[0] ? String(units[0].id) : "");
  const [bulk, setBulk] = useState("");
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ unitId: string; ok: boolean; text: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const unit = units.find((u) => String(u.id) === selected);
  const media = value[selected] ?? EMPTY;

  const grouped = useMemo(() => {
    const m = new Map<string, StudioUnit[]>();
    units.forEach((u) => { const k = u.propertyName || "Без об'єкта"; m.set(k, [...(m.get(k) ?? []), u]); });
    return [...m.entries()];
  }, [units]);

  if (units.length === 0) {
    return <p className="text-sm text-stone-500">Немає номерів. Додайте номери в розділі «Номери», щоб налаштувати фото й опис.</p>;
  }

  const patch = (p: Partial<UnitMedia>) => onChange(patchUnit(selected, (m) => ({ ...m, ...p })));
  const move = (i: number, d: number) => onChange(patchUnit(selected, (m) => {
    const p = [...m.photos]; const j = i + d;
    if (j < 0 || j >= p.length) return m;
    [p[i], p[j]] = [p[j], p[i]];
    return { ...m, photos: p };
  }));

  const addBulk = () => {
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    const bad = lines.filter((l) => !isAllowedPhoto(l));
    if (bad.length) { setBulkErr(`Відхилено ${bad.length}: дозволено лише HTTPS-посилання або завантажені файли`); return; }
    const fresh = lines.filter((l) => !media.photos.includes(l));
    if (media.photos.length + fresh.length > MAX_PHOTOS) { setBulkErr(`Максимум ${MAX_PHOTOS} фото на номер`); return; }
    setBulkErr(null); setBulk("");
    onChange(patchUnit(selected, (m) => ({ ...m, photos: [...m.photos, ...fresh.filter((l) => !m.photos.includes(l))].slice(0, MAX_PHOTOS) })));
  };

  const setBusy = (b: boolean) => { busyRef.current = b; onUploadingChange?.(b); };

  const uploadPhotos = async (files: File[]) => {
    if (busyRef.current || !files.length) return;
    const unitId = selected; // captured: completion always writes to this unit
    const room = MAX_PHOTOS - (value[unitId]?.photos.length ?? 0);
    const errors = files.map((f) => checkUploadFile(f, "image")).filter((e): e is string => !!e);
    if (errors.length) { setUploadMsg({ unitId, ok: false, text: errors.join("; ") }); return; }
    if (files.length > room) { setUploadMsg({ unitId, ok: false, text: `Можна додати ще ${Math.max(0, room)} фото (максимум ${MAX_PHOTOS})` }); return; }
    setBusy(true); setUploadMsg(null);
    const failed: string[] = [];
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      setUpload({ unitId, kind: "image", label: files[i].name, done: i, total: files.length });
      try {
        const ref = await uploadBookingMedia(files[i]);
        // Append in selection order; never reorder existing photos.
        onChange(patchUnit(unitId, (m) => m.photos.length >= MAX_PHOTOS || m.photos.includes(ref) ? m : { ...m, photos: [...m.photos, ref] }));
        ok++;
      } catch (e) { failed.push(`${files[i].name}: ${(e as Error).message}`); }
    }
    setUpload(null); setBusy(false);
    setUploadMsg(failed.length
      ? { unitId, ok: false, text: `Завантажено ${ok} з ${files.length}. ${failed.join("; ")}` }
      : { unitId, ok: true, text: `Завантажено ${ok} фото. Натисніть «Зберегти», щоб опублікувати зміни.` });
  };

  const uploadVideo = async (file: File | undefined) => {
    if (busyRef.current || !file) return;
    const unitId = selected;
    const err = checkUploadFile(file, "video");
    if (err) { setUploadMsg({ unitId, ok: false, text: err }); return; }
    setBusy(true); setUploadMsg(null);
    setUpload({ unitId, kind: "video", label: file.name, done: 0, total: 1 });
    try {
      const ref = await uploadBookingMedia(file);
      onChange(patchUnit(unitId, (m) => ({ ...m, videoUrl: ref })));
      setUploadMsg({ unitId, ok: true, text: "Відео завантажено. Натисніть «Зберегти», щоб опублікувати зміни." });
    } catch (e) {
      setUploadMsg({ unitId, ok: false, text: `${file.name}: ${(e as Error).message}. Посилання не збережено.` });
    } finally { setUpload(null); setBusy(false); }
  };

  const vErr = videoUrlError(media.videoUrl);
  const configured = Object.keys(value).length;
  const busy = !!upload;
  const unitName = (id: string) => units.find((u) => String(u.id) === id)?.name ?? `#${id}`;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Номер / будинок</Label>
          <select data-testid="select-media-unit" value={selected} onChange={(e) => { setSelected(e.target.value); setBulk(""); setBulkErr(null); }}
            className="w-full h-9 rounded-md border border-stone-300 bg-white px-3 text-sm">
            {grouped.map(([prop, list]) => (
              <optgroup key={prop} label={prop}>
                {list.map((u) => <option key={u.id} value={u.id}>{u.name}{value[String(u.id)] ? " (налаштовано)" : ""}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="text-[11px] text-stone-400">Контент налаштовано для {configured} з {units.length}. Лише презентація: назва, категорія, місткість, тарифи й наявність не змінюються. Зміни діють після «Зберегти».</p>
        </div>

        {(upload || uploadMsg) && (
          <div data-testid="status-upload" aria-live="polite"
            className={`rounded-lg border px-3 py-2 text-xs ${upload ? "border-stone-200 bg-white text-stone-700" : uploadMsg?.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {upload ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />
                Завантаження {upload.kind === "image" ? `фото ${upload.done + 1} з ${upload.total}` : "відео"} для «{unitName(upload.unitId)}»: {upload.label}
              </span>
            ) : uploadMsg && <span>«{unitName(uploadMsg.unitId)}»: {uploadMsg.text}</span>}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Фото ({media.photos.length}/{MAX_PHOTOS})</Label>
          {media.photos.length > 0 && (
            <ol className="space-y-1.5">
              {media.photos.map((p, i) => {
                const src = resolvePhotoUrl(p);
                return (
                  <li key={`${p}-${i}`} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-1.5" data-testid={`row-photo-${i}`}>
                    <span className="w-5 text-center font-mono text-[11px] text-stone-400">{i + 1}</span>
                    {src ? <img src={src} alt="" className="w-12 h-9 rounded object-cover bg-stone-100" /> : <span className="w-12 h-9 rounded bg-red-50" />}
                    <span className="flex-1 min-w-0 truncate text-xs font-mono text-stone-600" title={p}>{p}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Вище" disabled={i === 0} onClick={() => move(i, -1)} data-testid={`button-photo-up-${i}`}><ArrowUp className="w-3.5 h-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Нижче" disabled={i === media.photos.length - 1} onClick={() => move(i, 1)} data-testid={`button-photo-down-${i}`}><ArrowDown className="w-3.5 h-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-600" aria-label="Видалити" onClick={() => onChange(patchUnit(selected, (m) => ({ ...m, photos: m.photos.filter((_, j) => j !== i) })))} data-testid={`button-photo-remove-${i}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={photoInput} type="file" multiple accept={IMAGE_TYPES.join(",")} className="hidden" data-testid="input-photo-files"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void uploadPhotos(f); }} />
            <Button type="button" size="sm" variant="outline" disabled={busy || media.photos.length >= MAX_PHOTOS} onClick={() => photoInput.current?.click()} data-testid="button-upload-photos">
              <ImagePlus className="w-3.5 h-3.5 mr-1" />Завантажити фото
            </Button>
            <span className="text-[11px] text-stone-400">JPEG, PNG, WebP, GIF до 15 МБ</span>
          </div>
          <Textarea data-testid="input-photo-urls" rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Або вставте посилання, по одному в рядку\nhttps://.../photo-1.jpg"} className="font-mono text-xs" />
          <Button type="button" size="sm" variant="outline" onClick={addBulk} disabled={!bulk.trim()} data-testid="button-add-photos"><Plus className="w-3.5 h-3.5 mr-1" />Додати посилання</Button>
          {bulkErr && <p className="text-xs text-red-700" data-testid="text-photo-error">{bulkErr}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Відео</Label>
          <div className="flex gap-2">
            <Input data-testid="input-video-url" value={media.videoUrl} onChange={(e) => patch({ videoUrl: e.target.value })} placeholder="YouTube, Vimeo або HTTPS .mp4/.webm" />
            {media.videoUrl && <Button type="button" size="icon" variant="ghost" aria-label="Прибрати відео" className="text-red-600 shrink-0" onClick={() => patch({ videoUrl: "" })} data-testid="button-video-remove"><Trash2 className="w-4 h-4" /></Button>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={videoInput} type="file" accept={VIDEO_TYPES.join(",")} className="hidden" data-testid="input-video-file"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void uploadVideo(f); }} />
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => videoInput.current?.click()} data-testid="button-upload-video">
              <Film className="w-3.5 h-3.5 mr-1" />Завантажити відео
            </Button>
            <span className="text-[11px] text-stone-400">MP4, WebM, MOV до 250 МБ. Без автозапуску.</span>
          </div>
          {vErr && <p className="text-xs text-red-700">{vErr}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Повний опис для гостей</Label>
          <Textarea data-testid="input-unit-description" rows={6} maxLength={10000} value={media.description} onChange={(e) => patch({ description: e.target.value })}
            placeholder={unit?.description ? "Порожнє поле: показується опис номера з Maison HD" : "Опис номера в Maison HD порожній"} />
          <p className="text-[11px] text-stone-400 text-right">{media.description.length}/10000</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-stone-600">Як побачить гість</p>
        <div className="rounded-2xl overflow-hidden border border-stone-200 bg-white">
          <div className="h-48">
            <UnitGallery key={selected} photos={media.photos.map(resolvePhotoUrl).filter((p): p is string => !!p)} title={unit?.name ?? ""} category={unit?.propertyName} unitId={unit?.id ?? 0} accent={accent} />
          </div>
          <div className="p-3 space-y-2">
            <p className="font-semibold text-sm">{unit?.name}</p>
            <p className="text-xs text-stone-500 whitespace-pre-line line-clamp-6">{media.description || unit?.description || "Опису немає."}</p>
            {media.videoUrl && !vErr && <UnitVideo key={media.videoUrl} url={media.videoUrl} title={unit?.name ?? ""} unitId={unit?.id ?? 0} />}
          </div>
        </div>
      </div>
    </div>
  );
}
