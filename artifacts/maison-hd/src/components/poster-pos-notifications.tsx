import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PosterPosChannel } from "@workspace/api-client-react";
import { requestPosterPos, readPosterPairingCode, type PosterPosRequest } from "@/lib/poster-pos-request";

export default function PosterPosNotifications({ request }: { request: PosterPosRequest }) {
  const [state, setState] = useState<PosterPosChannel | null>(null);
  const [spotId, setSpotId] = useState("");
  const [tabletId, setTabletId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"create" | "disable" | null>(null);
  const mutationPending = useRef(false);
  const readPending = useRef(false);
  const revision = useRef(0);
  const initialized = useRef(false);
  const load = async () => {
    if (mutationPending.current || readPending.current) return;
    readPending.current = true;
    const version = revision.current;
    setLoading(true);
    try {
      const result = await requestPosterPos(request);
      if (version !== revision.current) return;
      setState(result); setLoadError("");
      if (result.online) setCode("");
      if (!initialized.current) {
        setSpotId(String(result.spotId || "")); setTabletId(String(result.tabletId || ""));
        initialized.current = true;
      }
    } catch (e) {
      if (version !== revision.current) return;
      setState(previous => previous ? { ...previous, online: false } : previous);
      setLoadError((e as Error).message);
    } finally {
      readPending.current = false;
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => { clearInterval(timer); revision.current++; };
  }, []);
  const save = async (enabled: boolean) => {
    if (mutationPending.current) return;
    if (enabled && (!Number.isInteger(Number(spotId)) || Number(spotId) < 1 || !Number.isInteger(Number(tabletId)) || Number(tabletId) < 1)) {
      setError("Вкажіть числові ID закладу та каси Poster."); return;
    }
    mutationPending.current = true;
    revision.current++;
    setBusy(enabled ? "create" : "disable"); setError(""); setCode("");
    try {
      const result = await requestPosterPos(request, { method: "PUT",
        body: JSON.stringify({ enabled, spotId: Number(spotId) || state?.spotId || 1, tabletId: Number(tabletId) || state?.tabletId || 1 }) });
      const nextCode = enabled ? readPosterPairingCode(result) : "";
      setState(result); setCode(nextCode); setLoadError("");
    } catch (e) { setError((e as Error).message); }
    finally { mutationPending.current = false; setBusy(null); }
  };
  return <Card data-testid="poster-pos-notifications">
    <CardHeader><CardTitle>Запити на готівковий розрахунок у Poster</CardTitle>
      <CardDescription>Окремий касовий модуль. Не створює замовлень, не приймає оплат і не друкує чеків.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p role="status" className="text-sm">{!state ? "Стан каси ще не отримано."
        : state.online ? "Каса на зв’язку. Запити можна надсилати."
        : state.enabled ? "Очікуємо підключення касового модуля. Доставка ще не підтверджена."
        : "Сповіщення на касу вимкнені."}</p>
      {loadError && <p role="alert" className="text-sm text-red-700">{loadError}</p>}
      {(!state || loadError) && <Button type="button" variant="outline" disabled={loading || !!busy} onClick={() => void load()}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? "Завантажуємо стан каси…" : "Оновити стан каси"}
      </Button>}
      {state?.lastSeenAt && <p className="text-xs text-muted-foreground">Останній зв’язок: {new Date(state.lastSeenAt).toLocaleString("uk-UA")}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="pos-notice-spot">ID закладу Poster</Label><Input id="pos-notice-spot" type="number" min={1} disabled={!!busy} value={spotId} onChange={e => setSpotId(e.target.value)} /></div>
        <div><Label htmlFor="pos-notice-tablet">ID каси Poster</Label><Input id="pos-notice-tablet" type="number" min={1} disabled={!!busy} value={tabletId} onChange={e => setTabletId(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Візьміть ID із довідника кас Poster нижче або налаштувань каси. Після завантаження модуля відкрийте на касі Maison HD і введіть одноразовий код. Код дійсний 15 хвилин.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2" aria-busy={!!busy}>
        <Button type="button" disabled={!!busy || !state} onClick={() => void save(true)}>
          {busy === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy === "create" ? "Створюємо код…" : "Створити код підключення"}
        </Button>
        <Button type="button" variant="outline" disabled={!!busy || !state?.enabled} onClick={() => void save(false)}>
          {busy === "disable" ? "Вимикаємо сповіщення…" : "Вимкнути сповіщення"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Новий код відкликає попереднє підключення каси. Після оновлення сторінки код не відображатиметься.</p>
      {code && <div className="rounded-lg border p-3 space-y-2"><Label htmlFor="pos-pair-code">Одноразовий код — не надсилайте його в чат</Label>
        <Input id="pos-pair-code" readOnly type="password" value={code} onFocus={e => { e.currentTarget.type = "text"; e.currentTarget.select(); }} onBlur={e => { e.currentTarget.type = "password"; }} />
        <p className="text-xs">Введіть код у Maison HD на касі Poster. Це не API-токен і не Application Secret.</p></div>}
    </CardContent>
  </Card>;
}
