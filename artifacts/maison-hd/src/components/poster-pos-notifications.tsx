import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PosterPosChannel } from "@workspace/api-client-react";

export default function PosterPosNotifications({ request }: { request: (path: string, opts?: RequestInit) => Promise<any> }) {
  const [state, setState] = useState<PosterPosChannel | null>(null);
  const [spotId, setSpotId] = useState("");
  const [tabletId, setTabletId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (initial = false) => {
    try {
      const result = await request("/poster/pos-notifications");
      setState(result); setError("");
      if (result.online) setCode("");
      if (initial) { setSpotId(String(result.spotId || "")); setTabletId(String(result.tabletId || "")); }
    } catch (e) { setState(previous => previous ? { ...previous, online: false } : previous); setError((e as Error).message); }
  };
  useEffect(() => { void load(true); const timer = setInterval(() => void load(), 10000); return () => clearInterval(timer); }, []);
  const save = async (enabled: boolean) => {
    if (enabled && (!Number.isInteger(Number(spotId)) || Number(spotId) < 1 || !Number.isInteger(Number(tabletId)) || Number(tabletId) < 1)) {
      setError("Вкажіть числові ID закладу та каси Poster."); return;
    }
    setBusy(true); setError(""); setCode("");
    try {
      const result = await request("/poster/pos-notifications", { method: "PUT",
        body: JSON.stringify({ enabled, spotId: Number(spotId) || state?.spotId || 1, tabletId: Number(tabletId) || state?.tabletId || 1 }) });
      setState(result); setCode(result.pairingCode || "");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Card data-testid="poster-pos-notifications">
    <CardHeader><CardTitle>Запити на готівковий розрахунок у Poster</CardTitle>
      <CardDescription>Окремий касовий модуль. Не створює замовлень, не приймає оплат і не друкує чеків.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p role="status" className="text-sm">{!state ? "Стан каси ще не отримано."
        : state.online ? "Каса на зв’язку. Запити можна надсилати."
        : state.enabled ? "Очікуємо підключення касового модуля. Доставка ще не підтверджена."
        : "Сповіщення на касу вимкнені."}</p>
      {state?.lastSeenAt && <p className="text-xs text-muted-foreground">Останній зв’язок: {new Date(state.lastSeenAt).toLocaleString("uk-UA")}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="pos-notice-spot">ID закладу Poster</Label><Input id="pos-notice-spot" type="number" min={1} value={spotId} onChange={e => setSpotId(e.target.value)} /></div>
        <div><Label htmlFor="pos-notice-tablet">ID каси Poster</Label><Input id="pos-notice-tablet" type="number" min={1} value={tabletId} onChange={e => setTabletId(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Візьміть ID із довідника кас Poster нижче або налаштувань каси. Після завантаження модуля відкрийте на касі Maison HD і введіть одноразовий код. Код дійсний 15 хвилин.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !state} onClick={() => void save(true)}>Створити код підключення</Button>
        <Button variant="outline" disabled={busy || !state?.enabled} onClick={() => void save(false)}>Вимкнути сповіщення</Button>
      </div>
      <p className="text-xs text-muted-foreground">Новий код відкликає попереднє підключення каси. Після оновлення сторінки код не відображатиметься.</p>
      {code && <div className="rounded-lg border p-3 space-y-2"><Label htmlFor="pos-pair-code">Одноразовий код — не надсилайте його в чат</Label>
        <Input id="pos-pair-code" readOnly type="password" value={code} onFocus={e => { e.currentTarget.type = "text"; e.currentTarget.select(); }} onBlur={e => { e.currentTarget.type = "password"; }} />
        <p className="text-xs">Введіть код у Maison HD на касі Poster. Це не API-токен і не Application Secret.</p></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </CardContent>
  </Card>;
}
