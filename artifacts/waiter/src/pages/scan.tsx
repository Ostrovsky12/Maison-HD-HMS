import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { apiFetch } from "@/lib/api";
import { OutletPicker } from "@/components/outlet-picker";
import { ArrowLeft, Camera, Loader2, Link2, MapPin, RotateCcw, UtensilsCrossed, Eye } from "lucide-react";

type Resolved = {
  point: { id: number; number: string; groupId: number | null; groupName: string | null; location: string | null };
  orderId: number | null;
};

export default function ScanPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const cameraRunRef = useRef(0);
  const busyRef = useRef(false);
  const [camState, setCamState] = useState<"starting" | "active" | "denied" | "off">("starting");
  const [camError, setCamError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState<Resolved | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [outletId, setOutletId] = useState<number | null>(null);

  const stopCamera = useCallback(() => {
    cameraRunRef.current += 1;
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    if (v) v.srcObject = null;
  }, []);

  const resolve = useCallback(async (qr: string) => {
    if (busyRef.current) return;
    const value = qr.trim();
    if (!value) return;
    busyRef.current = true;
    setResolving(true);
    setResolveError(null);
    try {
      const r: Resolved = await apiFetch("/fb/service-points/resolve", { method: "POST", body: JSON.stringify({ qr: value }) });
      stopCamera();
      setCamState("off");
      setResult(r);
    } catch (e) {
      setResolveError((e as Error).message || "Не вдалося розпізнати QR");
      busyRef.current = false;
    } finally {
      setResolving(false);
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const run = ++cameraRunRef.current;
    busyRef.current = false;
    setCamError(null);
    setCamState("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("denied");
      setCamError("Камера недоступна в цьому браузері. Вставте посилання нижче.");
      return;
    }
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
      const video = videoRef.current;
      if (!video) return;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        video,
        (res) => { if (res && !busyRef.current) resolve(res.getText()); },
      );
      if (run !== cameraRunRef.current) { controls.stop(); return; }
      controlsRef.current = controls;
      setCamState("active");
    } catch (e) {
      if (run !== cameraRunRef.current) return;
      const name = (e as { name?: string })?.name;
      setCamState("denied");
      setCamError(name === "NotAllowedError"
        ? "Доступ до камери заборонено. Дозвольте камеру в налаштуваннях Safari і повторіть."
        : "Не вдалося запустити камеру.");
    }
  }, [resolve, stopCamera]);

  useEffect(() => {
    if (!result) void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera, result]);

  const open = useMutation({
    mutationFn: (id: number) => apiFetch(`/fb/service-points/${id}/open`, { method: "POST", ...(outletId != null ? { body: JSON.stringify({ outletId }) } : {}) }) as Promise<{ orderId: number; created: boolean }>,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["waiter-open-orders"] });
      setLocation(`/menu/${d.orderId}`);
    },
  });

  function rescan() {
    setResult(null);
    setResolveError(null);
    setOutletId(null);
    open.reset();
  }

  function back() { stopCamera(); setLocation("/tables"); }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-blue-600 text-white px-4 pt-12 pb-5 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={back} data-testid="button-back" className="p-2 -ml-1 rounded-xl bg-white/20 active:bg-white/30">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Сканувати QR</h1>
            <p className="text-blue-200 text-sm">Наведіть камеру на QR гостя</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-5 overflow-y-auto">
        {result ? (
          <div className="space-y-4" data-testid="panel-scan-result">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Точка обслуговування</div>
              <div className="mt-2 flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-blue-700 font-black text-lg" data-testid="text-point-number">{result.point.number}</span>
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-lg" data-testid="text-point-group">{result.point.groupName || "Без групи"}</div>
                  <div className="text-sm text-muted-foreground">Точка №{result.point.number}</div>
                  {result.point.location && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{result.point.location}</div>
                  )}
                </div>
              </div>
              {result.orderId != null && (
                <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">Відкритий рахунок №{result.orderId} вже існує.</p>
              )}
            </div>

            {result.orderId == null && <OutletPicker value={outletId} onChange={setOutletId} />}
            <button onClick={() => open.mutate(result.point.id)} disabled={open.isPending} data-testid="button-open-point"
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
              {open.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Відкриття...</>
                : <><UtensilsCrossed className="w-5 h-5" /> {result.orderId != null ? "Додати страви" : "Відкрити рахунок і додати страви"}</>}
            </button>
            {result.orderId != null && (
              <button onClick={() => setLocation(`/order/${result.orderId}`)} data-testid="button-view-order"
                className="w-full py-3 rounded-2xl border-2 border-border bg-card font-semibold flex items-center justify-center gap-2">
                <Eye className="w-5 h-5" /> Переглянути замовлення
              </button>
            )}
            {open.isError && <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl px-4 py-3">{(open.error as Error).message}</p>}
            <button onClick={rescan} data-testid="button-rescan" className="w-full py-3 rounded-2xl text-muted-foreground font-medium flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Сканувати інший QR
            </button>
          </div>
        ) : (
          <>
            <div className="relative aspect-square w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-slate-900">
              <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" data-testid="video-scanner" />
              <div className="pointer-events-none absolute inset-8 border-2 border-white/70 rounded-2xl" />
              {(camState === "starting" || resolving) && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 text-white">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
              )}
              {camState === "denied" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                  <Camera className="w-9 h-9 opacity-60" />
                  <p className="text-sm">{camError}</p>
                  <button onClick={startCamera} data-testid="button-retry-camera" className="px-4 py-2 rounded-xl bg-white/20 active:bg-white/30 font-semibold flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Повторити
                  </button>
                </div>
              )}
            </div>

            {resolveError && (
              <div className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 flex items-center justify-between gap-2" data-testid="text-resolve-error">
                <span>{resolveError}</span>
                <button className="underline shrink-0" onClick={() => { setResolveError(null); busyRef.current = false; }}>Сканувати ще</button>
              </div>
            )}

            <form onSubmit={e => { e.preventDefault(); resolve(paste); }} className="space-y-2">
              <label className="block text-sm font-semibold text-foreground flex items-center gap-2"><Link2 className="w-4 h-4" /> Або вставте посилання з QR</label>
              <div className="flex gap-2">
                <input value={paste} onChange={e => setPaste(e.target.value)} placeholder="https://..." data-testid="input-qr-link"
                  className="flex-1 min-w-0 px-4 py-3 rounded-2xl border bg-card text-base focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button type="submit" disabled={!paste.trim() || resolving} data-testid="button-resolve-link"
                  className="px-4 rounded-2xl bg-blue-600 text-white font-bold disabled:opacity-40">Знайти</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
