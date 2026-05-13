import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Star, Tag, Plus, X, ArrowRight } from "lucide-react";

const API = "/api/fb/marketing";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

interface Transition { from_amount: number; group_id: number; }

export default function FbLoyalty() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["fb-loyalty-settings"],
    queryFn: () => apiFetch("/loyalty-settings"),
  });
  const { data: groupsData } = useQuery({
    queryKey: ["fb-client-groups"],
    queryFn: () => apiFetch("/client-groups"),
  });

  const [bonusEnabled, setBonusEnabled] = useState(true);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [maxBonusPct, setMaxBonusPct] = useState("50");
  const [welcomeBonus, setWelcomeBonus] = useState("0");
  const [smsOnOrder, setSmsOnOrder] = useState(false);
  const [bonusTransitions, setBonusTransitions] = useState<Transition[]>([]);
  const [discountTransitions, setDiscountTransitions] = useState<Transition[]>([]);

  useEffect(() => {
    if (settingsData?.settings) {
      const s = settingsData.settings;
      setBonusEnabled(s.bonus_enabled ?? true);
      setDiscountEnabled(s.discount_enabled ?? false);
      setMaxBonusPct(String(s.max_bonus_pct ?? "50"));
      setWelcomeBonus(String(s.welcome_bonus ?? "0"));
      setSmsOnOrder(s.sms_on_order ?? false);
      setBonusTransitions(s.bonus_transitions || []);
      setDiscountTransitions(s.discount_transitions || []);
    }
  }, [settingsData]);

  const groups: any[] = groupsData?.groups || [];

  const save = useMutation({
    mutationFn: () => apiFetch("/loyalty-settings", {
      method: "PUT",
      body: JSON.stringify({
        bonus_enabled: bonusEnabled,
        discount_enabled: discountEnabled,
        max_bonus_pct: parseFloat(maxBonusPct) || 50,
        welcome_bonus: parseFloat(welcomeBonus) || 0,
        sms_on_order: smsOnOrder,
        bonus_transitions: bonusTransitions,
        discount_transitions: discountTransitions,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-loyalty-settings"] }); toast({ title: "Налаштування збережено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function addBonusTransition() { setBonusTransitions(t => [...t, { from_amount: 0, group_id: groups[0]?.id || 0 }]); }
  function removeBonusTransition(i: number) { setBonusTransitions(t => t.filter((_, j) => j !== i)); }
  function updateBonusTransition(i: number, k: keyof Transition, v: any) {
    setBonusTransitions(t => t.map((item, j) => j === i ? { ...item, [k]: v } : item));
  }

  function addDiscountTransition() { setDiscountTransitions(t => [...t, { from_amount: 0, group_id: groups[0]?.id || 0 }]); }
  function removeDiscountTransition(i: number) { setDiscountTransitions(t => t.filter((_, j) => j !== i)); }
  function updateDiscountTransition(i: number, k: keyof Transition, v: any) {
    setDiscountTransitions(t => t.map((item, j) => j === i ? { ...item, [k]: v } : item));
  }

  if (settingsLoading) return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-amber-500" />
            <div>
              <h1 className="text-lg font-bold">Програми лояльності</h1>
              <p className="text-xs text-muted-foreground">Бонусна та знижкова система</p>
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Зберегти
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-8 max-w-2xl">

          {/* ─── Bonus System ─────────────────────────────────────────────── */}
          <div className="border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
              <Switch checked={bonusEnabled} onCheckedChange={setBonusEnabled} />
              <div>
                <h2 className="font-semibold flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> Бонусна система</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Клієнти накопичують бонуси та оплачують ними замовлення</p>
              </div>
            </div>
            {bonusEnabled && (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Максимальний % оплати бонусами</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input type="number" min="0" max="100" value={maxBonusPct}
                        onChange={e => setMaxBonusPct(e.target.value)} className="w-24" />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Максимально можливий % оплати бонусами</p>
                  </div>
                  <div>
                    <Label>Привітальний бонус, ₴</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input type="number" min="0" step="0.01" value={welcomeBonus}
                        onChange={e => setWelcomeBonus(e.target.value)} className="w-24" />
                      <span className="text-sm text-muted-foreground">₴</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Бонус за реєстрацію</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Label>Переходи між групами</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">При досягненні суми покупок клієнт переходить у вищу групу</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addBonusTransition} disabled={groups.length === 0}>
                      <Plus className="w-3 h-3 mr-1" /> Додати
                    </Button>
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                      Спочатку додайте групи клієнтів у розділі "Групи клієнтів"
                    </p>
                  ) : bonusTransitions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Переходи не налаштовано</p>
                  ) : (
                    <div className="space-y-2">
                      {bonusTransitions.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                          <span className="text-xs text-muted-foreground shrink-0">Від</span>
                          <Input type="number" min="0" value={t.from_amount}
                            onChange={e => updateBonusTransition(i, "from_amount", parseFloat(e.target.value) || 0)}
                            className="h-8 w-24 text-sm" />
                          <span className="text-xs text-muted-foreground shrink-0">₴ → група</span>
                          <select value={t.group_id} onChange={e => updateBonusTransition(i, "group_id", parseInt(e.target.value))}
                            className="flex-1 h-8 border rounded-md px-2 text-sm bg-background">
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.bonus_pct}%)</option>)}
                          </select>
                          <button onClick={() => removeBonusTransition(i)} className="text-muted-foreground hover:text-destructive">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3 pt-2 border-t">
                  <Switch checked={smsOnOrder} onCheckedChange={setSmsOnOrder} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Надсилати SMS після оплати замовлення</div>
                    <div className="text-xs text-muted-foreground">SMS оплачуються окремо, 1.26 грн. за кожні 70 символів</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Discount System ──────────────────────────────────────────── */}
          <div className="border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-3">
              <Switch checked={discountEnabled} onCheckedChange={setDiscountEnabled} />
              <div>
                <h2 className="font-semibold flex items-center gap-2"><Tag className="w-4 h-4 text-green-600" /> Знижкова система</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Клієнти отримують знижку від суми чека</p>
              </div>
            </div>
            {discountEnabled && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label>Переходи між групами</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">При досягненні суми клієнт отримує вищу знижку</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addDiscountTransition} disabled={groups.length === 0}>
                    <Plus className="w-3 h-3 mr-1" /> Додати
                  </Button>
                </div>
                {groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                    Спочатку додайте групи клієнтів
                  </p>
                ) : discountTransitions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Переходи не налаштовано</p>
                ) : (
                  <div className="space-y-2">
                    {discountTransitions.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg p-2">
                        <span className="text-xs text-muted-foreground shrink-0">Від</span>
                        <Input type="number" min="0" value={t.from_amount}
                          onChange={e => updateDiscountTransition(i, "from_amount", parseFloat(e.target.value) || 0)}
                          className="h-8 w-24 text-sm" />
                        <span className="text-xs text-muted-foreground shrink-0">₴ → група</span>
                        <select value={t.group_id} onChange={e => updateDiscountTransition(i, "group_id", parseInt(e.target.value))}
                          className="flex-1 h-8 border rounded-md px-2 text-sm bg-background">
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.discount_pct}%)</option>)}
                        </select>
                        <button onClick={() => removeDiscountTransition(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
