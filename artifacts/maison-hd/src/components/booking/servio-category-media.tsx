import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBookingServioCategoryMedia, useSaveBookingServioCategoryMedia, getGetBookingServioCategoryMediaQueryKey,
} from "@workspace/api-client-react";
import type { BookingServioCategoryMediaItem } from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowUp, Film, ImagePlus, Loader2, Lock, Plus, RefreshCw, Save, Star, Trash2, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  checkUploadFile, isAllowedPhoto, IMAGE_TYPES, MAX_PHOTOS, resolvePhotoUrl, uploadBookingMedia, VIDEO_TYPES, videoUrlError, type UnitMedia,
} from "@/lib/booking-media";
import { UnitGallery } from "./unit-gallery";
import { UnitVideo } from "./unit-video";

type Props = { organizationId: number | null; role?: string | null; dirty: boolean; accent: string; onUploadingChange?: (busy: boolean) => void };
type Draft = { baseRevision: number; base: UnitMedia; media: UnitMedia; conflict?: boolean };
type Msg = { key: string; ok: boolean; text: string };

const EDIT_ROLES = ["owner", "admin", "super_admin"];
const keyOf = (c: { hotelId: number; categoryId: number }) => `${c.hotelId}:${c.categoryId}`;
const same = (a: UnitMedia, b: UnitMedia) => JSON.stringify(a) === JSON.stringify(b);
const errText = (e: unknown) => {
  const d = (e as { data?: { error?: unknown } })?.data;
  return typeof d?.error === "string" ? d.error : (e as Error)?.message || "Не вдалося зберегти";
};

type TextKey = "displayName" | "occupancyText" | "bedsText" | "sofaText" | "areaText" | "tariffTitle" | "tariffDescription";
const DETAIL_LIMITS: [TextKey, number][] = [["displayName", 150], ["occupancyText", 200], ["bedsText", 300], ["sofaText", 200], ["areaText", 100], ["tariffTitle", 150], ["tariffDescription", 5000]];
const DETAIL_LABELS: Record<TextKey, string> = {
  displayName: "Назва для гостей", occupancyText: "Місткість", bedsText: "Ліжка", sofaText: "Диван", areaText: "Площа",
  tariffTitle: "Назва тарифу", tariffDescription: "Опис тарифу",
};
const DETAIL_PH: Record<TextKey, string> = {
  displayName: "Будинок з 1 спальнею", occupancyText: "до 4 гостей", bedsText: "2 односпальних або 1 двоспальне ліжко", sofaText: "1 диван", areaText: "42 м2",
  tariffTitle: "Безповоротний тариф", tariffDescription: "Тариф передбачає 100% передоплату без можливості повернення...",
};

function validate(m: UnitMedia): string | null {
  if (m.photos.length > MAX_PHOTOS) return `Максимум ${MAX_PHOTOS} фото`;
  if (m.photos.some((p) => p.length > 1000 || !isAllowedPhoto(p))) return "Є недопустиме посилання на фото (лише HTTPS або завантажені файли, до 1000 символів)";
  if (m.videoUrl.length > 1000) return "Посилання на відео довше 1000 символів";
  const v = videoUrlError(m.videoUrl); if (v) return v;
  if (m.description.length > 10000) return "Опис довший 10000 символів";
  const d = m.details ?? {};
  for (const [k, max] of DETAIL_LIMITS) if ((d[k] ?? "").length > max) return `Поле «${DETAIL_LABELS[k]}» довше ${max} символів`;
  if ((d.amenities ?? []).length > 30) return "Максимум 30 зручностей";
  if ((d.amenities ?? []).some((a) => a.length > 100)) return "Зручність довша 100 символів";
  return null;
}

export function ServioCategoryMedia({ organizationId, role, dirty, accent, onUploadingChange }: Props) {
  const qc = useQueryClient();
  const queryKey = [...getGetBookingServioCategoryMediaQueryKey(), organizationId];
  const q = useGetBookingServioCategoryMedia({ query: { queryKey, enabled: organizationId != null, staleTime: 0, refetchInterval: 30000 } });
  const saveM = useSaveBookingServioCategoryMedia();
  const canEdit = EDIT_ROLES.includes(String(role ?? ""));
  const locked = !canEdit || dirty;

  const data = q.data;
  const sourceId = data?.sourceId ?? null;
  const scope = `${organizationId ?? "none"}|${sourceId ?? "none"}`;
  const items = useMemo(() => (data?.ready ? data.categories : []), [data]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState("");
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusyState] = useState<{ key: string; label: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const scopeRef = useRef(scope); const busyRef = useRef(false);
  const itemsRef = useRef(items); itemsRef.current = items;
  const photoInput = useRef<HTMLInputElement>(null); const videoInput = useRef<HTMLInputElement>(null);
  const uploadCb = useRef(onUploadingChange); uploadCb.current = onUploadingChange;

  // Tenant/source change: drop all scoped state; in-flight completions are ignored via scopeRef.
  useEffect(() => { scopeRef.current = scope; setDrafts({}); setMsg(null); setBulk(""); setSelected(""); }, [scope]);
  useEffect(() => { if (items.length && !items.some((c) => keyOf(c) === selected)) setSelected(keyOf(items[0])); }, [items, selected]);
  useEffect(() => () => uploadCb.current?.(false), []);

  const item = items.find((c) => keyOf(c) === selected);
  const draft = drafts[selected];
  const media: UnitMedia = draft?.media ?? item?.media ?? { photos: [], videoUrl: "", description: "" };
  const isDirty = (k: string) => { const d = drafts[k]; return !!d && !same(d.media, d.base); };
  const conflictOf = (c: BookingServioCategoryMediaItem) => { const d = drafts[keyOf(c)]; return !!d && isDirty(keyOf(c)) && (d.conflict || d.baseRevision !== c.revision); };
  const conflict = item ? conflictOf(item) : false;
  const dirtyCount = Object.keys(drafts).filter(isDirty).length;

  /** Edits one category by key captured at call time; seeds draft from that category's server copy. */
  const edit = (k: string, fn: (m: UnitMedia) => UnitMedia) => setDrafts((prev) => {
    const src = itemsRef.current.find((c) => keyOf(c) === k);
    const d = prev[k] ?? (src ? { baseRevision: src.revision, base: src.media, media: src.media } : null);
    return d ? { ...prev, [k]: { ...d, media: fn(d.media) } } : prev;
  });
  const patch = (p: Partial<UnitMedia>) => edit(selected, (m) => ({ ...m, ...p }));
  const move = (i: number, j: number) => edit(selected, (m) => {
    if (j < 0 || j >= m.photos.length) return m;
    const p = [...m.photos]; const [x] = p.splice(i, 1); p.splice(j, 0, x); return { ...m, photos: p };
  });
  const discard = (k: string) => setDrafts((p) => { const n = { ...p }; delete n[k]; return n; });
  const rebase = (c: BookingServioCategoryMediaItem) => setDrafts((p) => {
    const d = p[keyOf(c)]; return d ? { ...p, [keyOf(c)]: { ...d, base: c.media, baseRevision: c.revision, conflict: false } } : p;
  });

  const setBusy = (b: { key: string; label: string } | null) => { busyRef.current = !!b; setBusyState(b); uploadCb.current?.(!!b); };

  const addBulk = () => {
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    const bad = lines.filter((l) => l.length > 1000 || !isAllowedPhoto(l));
    if (bad.length) { setMsg({ key: selected, ok: false, text: `Відхилено ${bad.length}: лише HTTPS-посилання до 1000 символів або завантажені файли` }); return; }
    const fresh = lines.filter((l) => !media.photos.includes(l));
    if (media.photos.length + fresh.length > MAX_PHOTOS) { setMsg({ key: selected, ok: false, text: `Максимум ${MAX_PHOTOS} фото на категорію` }); return; }
    setBulk(""); setMsg(null);
    edit(selected, (m) => ({ ...m, photos: [...m.photos, ...fresh.filter((l) => !m.photos.includes(l))].slice(0, MAX_PHOTOS) }));
  };

  const upload = async (files: File[], kind: "image" | "video") => {
    if (busyRef.current || locked || !files.length) return;
    const k = selected; const sc = scope;
    const errs = files.map((f) => checkUploadFile(f, kind)).filter((e): e is string => !!e);
    if (errs.length) { setMsg({ key: k, ok: false, text: errs.join("; ") }); return; }
    if (kind === "image" && media.photos.length + files.length > MAX_PHOTOS) { setMsg({ key: k, ok: false, text: `Можна додати ще ${MAX_PHOTOS - media.photos.length} фото` }); return; }
    setMsg(null); const failed: string[] = []; let ok = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy({ key: k, label: `${kind === "image" ? `фото ${i + 1} з ${files.length}` : "відео"}: ${files[i].name}` });
      try {
        const ref = await uploadBookingMedia(files[i]);
        if (scopeRef.current !== sc) { setBusy(null); return; }
        edit(k, (m) => kind === "video" ? { ...m, videoUrl: ref } : m.photos.includes(ref) || m.photos.length >= MAX_PHOTOS ? m : { ...m, photos: [...m.photos, ref] });
        ok++;
      } catch (e) { failed.push(`${files[i].name}: ${(e as Error).message}`); }
    }
    setBusy(null);
    if (scopeRef.current !== sc) return;
    setMsg(failed.length ? { key: k, ok: false, text: `Завантажено ${ok} з ${files.length}. ${failed.join("; ")}` }
      : { key: k, ok: true, text: "Файл завантажено в чернетку. Натисніть «Зберегти категорію»." });
  };

  const submit = () => {
    if (!item || !sourceId || locked || busyRef.current || saving || conflict) return;
    const k = keyOf(item); const sc = scope; const d = drafts[k]; if (!d) return;
    const sent: UnitMedia = d.media.details ? { ...d.media, details: { ...d.media.details, amenities: (d.media.details.amenities ?? []).map((a) => a.trim()).filter(Boolean) } } : d.media;
    const bad = validate(sent);
    if (bad) { setMsg({ key: k, ok: false, text: bad }); return; }
    setSaving(k); setMsg(null);
    saveM.mutate({ data: { sourceId, hotelId: item.hotelId, categoryId: item.categoryId, expectedRevision: d.baseRevision, media: sent } }, {
      onSuccess: (res) => {
        if (scopeRef.current !== sc) return;
        setDrafts((p) => {
          const cur = p[k]; if (!cur) return p;
          const n = { ...p };
          if (same(cur.media, d.media)) delete n[k]; else n[k] = { ...cur, base: res.media, baseRevision: res.revision, conflict: false };
          return n;
        });
        setMsg({ key: k, ok: true, text: `Збережено, ревізія ${res.revision}` });
      },
      onError: (e) => {
        if (scopeRef.current !== sc) return;
        if ((e as { status?: number })?.status === 409) setDrafts((p) => (p[k] ? { ...p, [k]: { ...p[k], conflict: true } } : p));
        setMsg({ key: k, ok: false, text: (e as { status?: number })?.status === 409 ? "Конфлікт: категорію змінено іншим користувачем або джерело змінилося." : errText(e) });
      },
      onSettled: () => { setSaving(null); if (scopeRef.current === sc) void qc.invalidateQueries({ queryKey }); },
    });
  };

  const box = "rounded-xl border px-4 py-3 text-sm";
  if (organizationId == null || q.isLoading) return <div className="space-y-2" data-testid="servio-category-media"><Skeleton className="h-9 w-full" /><Skeleton className="h-40 w-full" /></div>;
  const refreshBtn = (
    <Button type="button" size="sm" variant="ghost" data-testid="button-refresh-servio-category-media" onClick={() => q.refetch()} disabled={q.isFetching}>
      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />Оновити
    </Button>
  );
  if (q.isError || !data) return <div data-testid="servio-category-media" className={`${box} border-red-200 bg-red-50 text-red-800 flex items-center justify-between gap-3`}><span>Не вдалося завантажити категорії Servio. {errText(q.error)}</span>{refreshBtn}</div>;
  if (!data.ready || !sourceId) return <div data-testid="servio-category-media" className={`${box} border-amber-200 bg-amber-50 text-amber-900 flex items-center justify-between gap-3`}><span>{data.message || "Підключення Servio не перевірене. Перевірте з'єднання, щоб редагувати контент категорій."}</span>{refreshBtn}</div>;
  if (!items.length) return <div data-testid="servio-category-media" className={`${box} border-stone-200 bg-stone-50 text-stone-600 flex items-center justify-between gap-3`}><span>Servio не повернув жодної категорії номерів. {data.message}</span>{refreshBtn}</div>;

  const vErr = videoUrlError(media.videoUrl);
  const vErrLen = media.videoUrl.length > 1000 ? "Посилання довше 1000 символів" : null;
  const curDirty = isDirty(selected);
  const ro = locked || conflict;
  const photos = media.photos.map(resolvePhotoUrl).filter((p): p is string => !!p);

  return (
    <div data-testid="servio-category-media" className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
      <div className="min-w-0 space-y-4">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="servio-media-cat" className="text-xs font-medium text-stone-600">Категорія Servio</Label>
            <select id="servio-media-cat" data-testid="select-servio-media-category" value={selected}
              onChange={(e) => { setSelected(e.target.value); setBulk(""); }} className="w-full h-9 rounded-md border border-stone-300 bg-white px-3 text-sm">
              {items.map((c) => <option key={keyOf(c)} value={keyOf(c)}>{c.name || "Без назви"} · готель {c.hotelId} / категорія {c.categoryId}{isDirty(keyOf(c)) ? " · чернетка" : ""}</option>)}
            </select>
          </div>
          {refreshBtn}
        </div>
        {item && <p className="text-[11px] text-stone-400 font-mono">Зовнішні ID Servio: hotelId {item.hotelId}, categoryId {item.categoryId}, ревізія {item.revision}. Не локальний номер Maison HD.{dirtyCount ? ` Незбережених чернеток: ${dirtyCount}.` : ""}</p>}

        {!canEdit && <div className={`${box} border-stone-200 bg-stone-50 text-stone-600 flex gap-2`}><Lock className="w-4 h-4 mt-0.5 shrink-0" />Лише перегляд. Редагувати можуть власник або адміністратор.</div>}
        {canEdit && dirty && <div className={`${box} border-amber-200 bg-amber-50 text-amber-900 flex gap-2`}><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Спочатку збережіть налаштування підключення вгорі сторінки. Редагування категорій тимчасово заблоковане.</div>}
        {conflict && item && (
          <div data-testid="servio-category-media-conflict" className={`${box} border-red-200 bg-red-50 text-red-900 space-y-2`}>
            <p className="font-medium flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Категорію змінено в іншому місці (ревізія {item.revision}). Ваша чернетка збережена локально.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" data-testid="button-servio-media-discard" onClick={() => discard(selected)}><Undo2 className="w-3.5 h-3.5 mr-1" />Відкинути й завантажити актуальне</Button>
              <Button type="button" size="sm" variant="outline" data-testid="button-servio-media-rebase" onClick={() => rebase(item)} disabled={!canEdit}>Залишити мою чернетку поверх ревізії {item.revision}</Button>
            </div>
          </div>
        )}
        {(busy || (msg && msg.key === selected)) && (
          <div aria-live="polite" data-testid="status-servio-media" className={`rounded-lg border px-3 py-2 text-xs ${busy ? "border-stone-200 bg-white text-stone-700" : msg?.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Завантаження {busy.label}</span> : msg?.text}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-stone-600">Фото ({media.photos.length}/{MAX_PHOTOS}) · перше фото є обкладинкою</Label>
          {media.photos.length > 0 ? (
            <ol className="min-w-0 space-y-1.5">
              {media.photos.map((p, i) => {
                const src = resolvePhotoUrl(p);
                return (
                  <li key={`${p}-${i}`} className="grid min-w-0 grid-cols-[1.25rem_3rem_minmax(0,1fr)] sm:grid-cols-[1.25rem_3rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-stone-200 bg-white p-1.5" data-testid={`row-servio-photo-${i}`}>
                    <span className="w-5 text-center font-mono text-[11px] text-stone-400">{i === 0 ? <Star className="w-3 h-3 mx-auto" style={{ color: accent }} aria-label="Обкладинка" /> : i + 1}</span>
                    {src ? <img src={src} alt="" className="w-12 h-9 rounded object-cover bg-stone-100" /> : <span className="w-12 h-9 rounded bg-red-50" />}
                    <span className="flex-1 min-w-0 truncate text-xs font-mono text-stone-600" title={p}>{p}</span>
                    {!ro && <div className="col-span-3 flex flex-wrap justify-end gap-1 sm:col-span-1">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={i === 0} onClick={() => move(i, 0)} data-testid={`button-servio-photo-cover-${i}`}>Обкладинка</Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Вище" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Нижче" disabled={i === media.photos.length - 1} onClick={() => move(i, i + 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-600" aria-label="Видалити фото" onClick={() => edit(selected, (m) => ({ ...m, photos: m.photos.filter((_, j) => j !== i) }))}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>}
                  </li>
                );
              })}
            </ol>
          ) : <p className="text-xs text-stone-400">Фото ще не додано.</p>}
          {!ro && <>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={photoInput} id="servio-photo-files" type="file" multiple accept={IMAGE_TYPES.join(",")} className="sr-only" aria-label="Файли фото для категорії Servio"
                onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void upload(f, "image"); }} />
              <Button type="button" size="sm" variant="outline" disabled={!!busy || media.photos.length >= MAX_PHOTOS} onClick={() => photoInput.current?.click()} data-testid="button-add-servio-category-photos">
                <ImagePlus className="w-3.5 h-3.5 mr-1" />Завантажити фото
              </Button>
              {media.photos.length > 0 && <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => patch({ photos: [] })} data-testid="button-servio-photos-clear">Видалити всі фото</Button>}
              <span className="text-[11px] text-stone-400">JPEG, PNG, WebP, GIF до 15 МБ</span>
            </div>
            <Textarea aria-label="Посилання на фото" data-testid="input-servio-category-photo-urls" rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Або вставте HTTPS-посилання, по одному в рядку"} className="font-mono text-xs" />
            <Button type="button" size="sm" variant="outline" onClick={addBulk} disabled={!bulk.trim()} data-testid="button-servio-add-photo-urls"><Plus className="w-3.5 h-3.5 mr-1" />Додати посилання</Button>
          </>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="servio-video" className="text-xs font-medium text-stone-600">Відео</Label>
          <div className="flex gap-2">
            <Input id="servio-video" data-testid="input-servio-category-video" value={media.videoUrl} readOnly={ro} maxLength={1000} onChange={(e) => patch({ videoUrl: e.target.value })} placeholder="YouTube, Vimeo або HTTPS .mp4/.webm" />
            {!ro && media.videoUrl && <Button type="button" size="icon" variant="ghost" aria-label="Прибрати відео" className="text-red-600 shrink-0" onClick={() => patch({ videoUrl: "" })} data-testid="button-servio-video-remove"><Trash2 className="w-4 h-4" /></Button>}
          </div>
          {!ro && <div className="flex items-center gap-2">
            <input ref={videoInput} type="file" accept={VIDEO_TYPES.join(",")} className="sr-only" aria-label="Файл відео для категорії Servio"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload([f], "video"); }} />
            <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => videoInput.current?.click()} data-testid="button-servio-upload-video"><Film className="w-3.5 h-3.5 mr-1" />Завантажити відео</Button>
            <span className="text-[11px] text-stone-400">MP4, WebM, MOV до 250 МБ</span>
          </div>}
          {(vErr || vErrLen) && <p className="text-xs text-red-700">{vErrLen ?? vErr}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="servio-desc" className="text-xs font-medium text-stone-600">Опис для гостей</Label>
          <Textarea id="servio-desc" data-testid="input-servio-category-description" rows={6} maxLength={10000} readOnly={ro} value={media.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Опис категорії не задано" />
          <div className="flex justify-between text-[11px] text-stone-400">
            {!ro && media.description ? <button type="button" className="text-red-600 hover:underline" onClick={() => patch({ description: "" })} data-testid="button-servio-desc-clear">Очистити опис</button> : <span />}
            <span>{media.description.length}/10000</span>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3" data-testid="panel-servio-category-details">
          <p className="text-xs font-medium text-stone-600">Характеристики для гостей · лише текст на сторінці, не змінює наявність, ціни чи місткість у Servio</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {DETAIL_LIMITS.map(([k, max]) => (
              <div key={k} className={`space-y-1 ${k === "tariffDescription" ? "sm:col-span-2" : ""}`}>
                <Label htmlFor={`servio-d-${k}`} className="text-[11px] text-stone-500">{DETAIL_LABELS[k]}</Label>
                {k === "tariffDescription"
                  ? <Textarea id={`servio-d-${k}`} data-testid={`input-servio-detail-${k}`} rows={3} maxLength={max} readOnly={ro} value={media.details?.[k] ?? ""} placeholder={DETAIL_PH[k]} onChange={(e) => patch({ details: { ...media.details, [k]: e.target.value } })} />
                  : <Input id={`servio-d-${k}`} data-testid={`input-servio-detail-${k}`} maxLength={max} readOnly={ro} value={media.details?.[k] ?? ""} placeholder={DETAIL_PH[k]} onChange={(e) => patch({ details: { ...media.details, [k]: e.target.value } })} />}
              </div>
            ))}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="servio-d-amenities" className="text-[11px] text-stone-500">Зручності, по одній у рядку (до 30)</Label>
              <Textarea id="servio-d-amenities" data-testid="input-servio-detail-amenities" rows={3} readOnly={ro} value={(media.details?.amenities ?? []).join("\n")}
                onChange={(e) => patch({ details: { ...media.details, amenities: e.target.value.split("\n").slice(0, 30) } })} placeholder={"Сауна\nКухня"} />
            </div>
          </div>
          {!ro && media.details && Object.keys(media.details).length > 0 && (
            <button type="button" className="text-[11px] text-red-600 hover:underline" onClick={() => patch({ details: {} })} data-testid="button-servio-details-clear">Очистити характеристики</button>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" data-testid="button-save-servio-category-media" onClick={submit} disabled={ro || !curDirty || !!busy || !!saving || !!validate(media)} style={{ background: accent }}>
              {saving === selected ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}Зберегти категорію
            </Button>
            {curDirty && !conflict && <Button type="button" variant="ghost" onClick={() => discard(selected)} disabled={!!saving} data-testid="button-servio-media-revert"><Undo2 className="w-4 h-4 mr-1.5" />Скасувати зміни</Button>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-stone-600">Як побачить гість{curDirty ? " (чернетка)" : ""}</p>
        <div className="rounded-2xl overflow-hidden border border-stone-200 bg-white" data-testid="servio-category-media-preview">
          <div className="h-48">
            {photos.length ? <UnitGallery key={selected} photos={photos} title={item?.name ?? ""} unitId={item?.categoryId ?? 0} accent={accent} />
              : <div className="h-full grid place-items-center bg-stone-100 text-xs text-stone-400">Немає фото</div>}
          </div>
          <div className="p-3 space-y-2">
            <p className="font-semibold text-sm">{item?.name || "Без назви"}</p>
            <p className="text-xs text-stone-500 whitespace-pre-line line-clamp-6">{media.description || "Опису немає."}</p>
            {media.videoUrl && !vErr && <UnitVideo key={media.videoUrl} url={media.videoUrl} title={item?.name ?? ""} unitId={item?.categoryId ?? 0} />}
          </div>
        </div>
      </div>
    </div>
  );
}
