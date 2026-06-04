import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Bot, Save, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

const API_APPS = "/api/fb/apps";
const API_FB = "/api/fb";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export default function FbDeliveryBot() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-delivery-bot"],
    queryFn: () => apiFetch(`${API_APPS}/delivery-bot`),
  });
  const { data: catData } = useQuery({
    queryKey: ["fb-categories"],
    queryFn: () => apiFetch(`${API_FB}/categories`),
  });

  const [botToken, setBotToken] = useState("");
  const [delivery, setDelivery] = useState(true);
  const [pickup, setPickup] = useState(true);
  const [dineIn, setDineIn] = useState(false);
  const [language, setLanguage] = useState("uk");
  const [contacts, setContacts] = useState("");
  const [payOnline, setPayOnline] = useState(false);
  const [payCash, setPayCash] = useState(true);
  const [payCard, setPayCard] = useState(true);
  const [activeCats, setActiveCats] = useState<number[]>([]);

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setBotToken(s.bot_token || "");
      setDelivery(s.delivery_enabled ?? true);
      setPickup(s.pickup_enabled ?? true);
      setDineIn(s.dine_in_enabled ?? false);
      setLanguage(s.language || "uk");
      setContacts(s.contacts_html || "");
      setPayOnline(s.pay_online ?? false);
      setPayCash(s.pay_cash ?? true);
      setPayCard(s.pay_card_on_delivery ?? true);
      setActiveCats(s.active_category_ids || []);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiFetch(`${API_APPS}/delivery-bot`, {
      method: "PUT",
      body: JSON.stringify({
        bot_token: botToken || null, delivery_enabled: delivery, pickup_enabled: pickup,
        dine_in_enabled: dineIn, language, contacts_html: contacts || null,
        pay_online: payOnline, pay_cash: payCash, pay_card_on_delivery: payCard,
        active_category_ids: activeCats,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-delivery-bot"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const categories: any[] = catData?.categories || [];

  function toggleCat(id: number) {
    setActiveCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  if (isLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  const hasToken = !!botToken;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-sky-600" />
            <h1 className="text-lg font-bold">Poster Delivery Bot</h1>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://t.me/BotFather" target="_blank" rel="noopener"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Підтримка в Telegram
            </a>
            <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Зберегти
            </Button>
          </div>
        </div>

        {!hasToken && (
          <div className="mx-6 mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 shrink-0">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Для використання цього додатку необхідно прив'язати Telegram-бота. Введіть API-ключ нижче.</span>
          </div>
        )}

        <Tabs defaultValue="settings" className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-6 bg-background">
            <TabsList className="h-9 gap-1 bg-transparent p-0">
              {["settings", "broadcasts", "extra"].map((t, i) => (
                <TabsTrigger key={t} value={t}
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-3 h-9 text-sm">
                  {["Налаштування бота", "Розсилки", "Додатково"][i]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="settings" className="flex-1 overflow-auto m-0 p-6">
            <div className="max-w-xl space-y-6">
              {/* API Token */}
              <div>
                <Label>API-ключ Telegram-бота</Label>
                <Input value={botToken} onChange={e => setBotToken(e.target.value)}
                  placeholder="123456789:AABBCCDDEEFFaabbccddeeff..." className="mt-1 font-mono text-sm" />
              </div>

              {/* Order types */}
              <div className="space-y-3">
                {[
                  { label: "Доставлення", val: delivery, set: setDelivery },
                  { label: "Навинiс", val: pickup, set: setPickup },
                  { label: "У закладi", val: dineIn, set: setDineIn },
                ].map(({ label, val, set }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{label}</span>
                    <Switch checked={val} onCheckedChange={set} />
                  </div>
                ))}
              </div>

              {/* Language */}
              <div>
                <Label>Мова</Label>
                <div className="flex gap-2 mt-1">
                  {[["uk", "Українська"], ["ru", "Російська"], ["uz", "O'zbek"]].map(([code, label]) => (
                    <button key={code} onClick={() => setLanguage(code)}
                      className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${language === code ? "border-primary bg-primary/5 text-primary" : "border-input hover:bg-muted/50"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contacts */}
              <div>
                <Label>Контакти</Label>
                <textarea value={contacts} onChange={e => setContacts(e.target.value)}
                  placeholder="Ваші контактні дані для бота..."
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background h-24 resize-none" />
              </div>

              {/* Payment */}
              <div>
                <h3 className="font-semibold mb-3">Оплата</h3>
                <p className="text-xs text-muted-foreground mb-3">Оберіть способи, якими гості будуть оплачувати замовлення:</p>
                <div className="space-y-3">
                  {[
                    { label: "Онлайн-оплата", val: payOnline, set: setPayOnline },
                    { label: "Готівкою", val: payCash, set: setPayCash },
                    { label: "Карткою при отриманні", val: payCard, set: setPayCard },
                  ].map(({ label, val, set }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <Switch checked={val} onCheckedChange={set} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Menu categories */}
              <div>
                <h3 className="font-semibold mb-1">Відображення меню в боті</h3>
                <p className="text-xs text-muted-foreground mb-3">Оберіть 3-4 категорії до 5 товарів та тех. карток в кожній:</p>
                <div className="space-y-2">
                  {categories.map((cat: any) => (
                    <div key={cat.id} className="flex items-center justify-between">
                      <span className="text-sm">{cat.name}</span>
                      <Switch checked={activeCats.includes(cat.id)} onCheckedChange={() => toggleCat(cat.id)} />
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <p className="text-xs text-muted-foreground">Категорій не знайдено. Спочатку додайте категорії до меню.</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="broadcasts" className="flex-1 overflow-auto m-0 p-6">
            <div className="max-w-xl space-y-4">
              <h2 className="font-semibold">Розсилки</h2>
              <div className="bg-muted/30 rounded-xl p-6 text-center">
                <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Розсилки недоступні</p>
                <p className="text-sm text-muted-foreground mt-1">Спочатку налаштуйте Telegram-бота та підключіть підписку</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="extra" className="flex-1 overflow-auto m-0 p-6">
            <div className="max-w-xl space-y-4">
              <h2 className="font-semibold">Додатково</h2>
              <p className="text-sm text-muted-foreground">Додаткові налаштування Telegram-бота будуть доступні після підключення.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
