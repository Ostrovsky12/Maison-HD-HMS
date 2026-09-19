import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Crown, Star, Medal, Shield, Users, Coins, TrendingUp, Gift,
  Plus, ChevronDown, ChevronUp, Settings, Search, Edit3, RefreshCw,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/loyalty";

const TIER_CONFIG = {
  platinum: { label: "Platinum", color: "bg-purple-100 text-purple-800", icon: Crown, border: "border-purple-200" },
  gold:     { label: "Gold",     color: "bg-yellow-100 text-yellow-800", icon: Star,  border: "border-yellow-200" },
  silver:   { label: "Silver",   color: "bg-slate-100 text-slate-700",   icon: Medal, border: "border-slate-200" },
  bronze:   { label: "Bronze",   color: "bg-orange-100 text-orange-800", icon: Shield,border: "border-orange-200" },
};

const TX_LABELS: Record<string, string> = {
  earn_stay: "Нарахування за проживання",
  earn_fb: "Нарахування F&B",
  earn_bonus: "Бонус",
  redeem: "Списання",
  expire: "Згорання",
  adjust: "Коригування",
};

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.bronze;
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.color} gap-1`}>
      <Icon size={12} /> {cfg.label}
    </Badge>
  );
}

function formatPts(n: number) {
  return n.toLocaleString("uk-UA") + " балів";
}

const tok = () => localStorage.getItem("hms_token") || "";

export default function LoyaltyPage() {
  const headers = { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" };

  const [tab, setTab] = useState("members");
  const [members, setMembers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedMember, setExpandedMember] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Record<number, any[]>>({});

  // Adjust modal
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustMember, setAdjustMember] = useState<any>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustDesc, setAdjustDesc] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Settings modal
  const [settingsModal, setSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [savingSettings, setSavingSettings] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [mRes, sRes, cfgRes] = await Promise.all([
        fetch(`${API}/members?limit=100`, { headers }),
        fetch(`${API}/stats`, { headers }),
        fetch(`${API}/settings`, { headers }),
      ]);
      const [m, s, cfg] = await Promise.all([mRes.json(), sRes.json(), cfgRes.json()]);
      setMembers(m);
      setStats(s);
      setSettings(cfg);
      setSettingsForm(cfg);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function loadTransactions(memberId: number) {
    try {
      const res = await fetch(`${API}/members/${memberId}/transactions`, { headers });
      const data = await res.json();
      setTransactions(prev => ({ ...prev, [memberId]: data }));
    } catch {}
  }

  function toggleMember(id: number) {
    if (expandedMember === id) {
      setExpandedMember(null);
    } else {
      setExpandedMember(id);
      if (!transactions[id]) loadTransactions(id);
    }
  }

  async function handleAdjust() {
    if (!adjustMember || !adjustPoints) return;
    setAdjusting(true);
    try {
      const res = await fetch(`${API}/members/${adjustMember.id}/adjust`, {
        method: "POST", headers,
        body: JSON.stringify({ points: parseInt(adjustPoints), description: adjustDesc }),
      });
      if (!res.ok) throw new Error();
      toast({ title: adjustPoints.startsWith("-") ? "Бали списано" : "Бали нараховано" });
      setAdjustModal(false);
      setAdjustPoints("");
      setAdjustDesc("");
      load();
      if (expandedMember === adjustMember.id) {
        delete transactions[adjustMember.id];
        loadTransactions(adjustMember.id);
      }
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setAdjusting(false);
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch(`${API}/settings`, {
        method: "PATCH", headers, body: JSON.stringify(settingsForm),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Налаштування збережено" });
      setSettingsModal(false);
      load();
    } catch { toast({ title: "Помилка збереження", variant: "destructive" }); }
    setSavingSettings(false);
  }

  const filtered = members.filter(m =>
    !search || m.guestName?.toLowerCase().includes(search.toLowerCase()) ||
    m.guestEmail?.toLowerCase().includes(search.toLowerCase()) ||
    m.guestPhone?.includes(search)
  );

  const TIERS = ["platinum", "gold", "silver", "bronze"] as const;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Програма лояльності</h1>
            <p className="text-muted-foreground text-sm">Управління учасниками, балами та рівнями</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw size={14} className="mr-1" /> Оновити
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettingsModal(true)}>
              <Settings size={14} className="mr-1" /> Налаштування
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="text-blue-500" size={24} />
                <div>
                  <p className="text-xs text-muted-foreground">Учасників</p>
                  <p className="text-2xl font-bold">{stats.totalMembers}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Coins className="text-amber-500" size={24} />
                <div>
                  <p className="text-xs text-muted-foreground">Балів в обігу</p>
                  <p className="text-2xl font-bold">{(stats.totalPointsInCirculation || 0).toLocaleString("uk-UA")}</p>
                </div>
              </CardContent>
            </Card>
            {TIERS.map(tier => {
              const cfg = TIER_CONFIG[tier];
              const Icon = cfg.icon;
              return (
                <Card key={tier} className={`border ${cfg.border}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Icon size={20} className="opacity-60" />
                    <div>
                      <p className="text-xs text-muted-foreground">{cfg.label}</p>
                      <p className="text-2xl font-bold">{stats.byTier?.[tier] || 0}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="members">Учасники</TabsTrigger>
            <TabsTrigger value="tiers">Рівні та привілеї</TabsTrigger>
          </TabsList>

          {/* ── Members tab ── */}
          <TabsContent value="members" className="mt-4 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Пошук за ім'ям, email, телефоном..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Badge variant="outline" className="px-3 py-1.5">{filtered.length} учасників</Badge>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">Завантаження...</div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <Gift size={40} className="opacity-30" />
                  <p>Учасників не знайдено</p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Гість</TableHead>
                      <TableHead>Рівень</TableHead>
                      <TableHead className="text-right">Баланс</TableHead>
                      <TableHead className="text-right">Заробили всього</TableHead>
                      <TableHead className="text-right">Візитів</TableHead>
                      <TableHead className="text-right">Ночей</TableHead>
                      <TableHead className="text-right">Витрачено, грн</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(member => (
                      <>
                        <TableRow
                          key={member.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => toggleMember(member.id)}
                        >
                          <TableCell>
                            <div className="font-medium">{member.guestName}</div>
                            <div className="text-xs text-muted-foreground">{member.guestEmail || member.guestPhone}</div>
                          </TableCell>
                          <TableCell><TierBadge tier={member.tier} /></TableCell>
                          <TableCell className="text-right font-mono font-medium text-blue-600">
                            {(member.pointsBalance || 0).toLocaleString("uk-UA")}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {(member.pointsLifetime || 0).toLocaleString("uk-UA")}
                          </TableCell>
                          <TableCell className="text-right">{member.totalStays}</TableCell>
                          <TableCell className="text-right">{member.totalNights}</TableCell>
                          <TableCell className="text-right">
                            {parseFloat(member.totalSpent || "0").toLocaleString("uk-UA", { minimumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => { setAdjustMember(member); setAdjustModal(true); }}
                              >
                                <Edit3 size={13} />
                              </Button>
                              {expandedMember === member.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedMember === member.id && (
                          <TableRow key={`${member.id}-exp`}>
                            <TableCell colSpan={8} className="bg-muted/30 p-0">
                              <div className="p-4 space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Останні транзакції</p>
                                {!transactions[member.id] ? (
                                  <p className="text-sm text-muted-foreground">Завантаження...</p>
                                ) : transactions[member.id].length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Немає транзакцій</p>
                                ) : (
                                  <div className="space-y-1">
                                    {transactions[member.id].slice(0, 10).map(tx => (
                                      <div key={tx.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-xs">{TX_LABELS[tx.txType] || tx.txType}</Badge>
                                          <span className="text-muted-foreground">{tx.description}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <span className={`font-mono font-medium ${tx.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                                            {tx.points >= 0 ? "+" : ""}{tx.points}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            Баланс: {tx.balanceAfter}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {new Date(tx.createdAt).toLocaleDateString("uk-UA")}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Tiers tab ── */}
          <TabsContent value="tiers" className="mt-4">
            {settings && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {TIERS.map(tier => {
                  const cfg = TIER_CONFIG[tier];
                  const Icon = cfg.icon;
                  const perks: string[] = settings[`${tier}Perks`] || [];
                  const threshold = tier === "bronze" ? 0
                    : tier === "silver" ? settings.silverThreshold
                    : tier === "gold" ? settings.goldThreshold
                    : settings.platinumThreshold;
                  return (
                    <Card key={tier} className={`border-2 ${cfg.border}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Icon size={20} />
                          <CardTitle className="text-base">{cfg.label}</CardTitle>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {tier === "bronze" ? "З першого балу" : `Від ${threshold.toLocaleString("uk-UA")} балів`}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        {perks.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">Немає привілеїв</p>
                        ) : perks.map((perk: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-green-500 mt-0.5">✓</span>
                            <span>{perk}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            {settings && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Coins size={16} /> Правила нарахування балів
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="font-semibold text-blue-700">За ніч проживання</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">{settings.pointsPerNight}</p>
                    <p className="text-xs text-blue-500">балів</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                    <p className="font-semibold text-green-700">За 1 грн (номер)</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{settings.pointsPerUah}</p>
                    <p className="text-xs text-green-500">балів</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="font-semibold text-amber-700">За 1 грн (F&B)</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{settings.pointsPerFbUah}</p>
                    <p className="text-xs text-amber-500">балів</p>
                  </div>
                </CardContent>
                <CardContent className="pt-0">
                  <div className="p-3 rounded-lg bg-purple-50 border border-purple-100 text-sm">
                    <p className="font-semibold text-purple-700">Курс списання</p>
                    <p className="text-purple-600">1 бал = <strong>{settings.pointsToUahRate} грн</strong></p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Adjust points modal ── */}
      <Dialog open={adjustModal} onOpenChange={setAdjustModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Коригування балів — {adjustMember?.guestName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Поточний баланс</p>
              <p className="text-2xl font-bold text-blue-600">{formatPts(adjustMember?.pointsBalance || 0)}</p>
            </div>
            <div className="space-y-1">
              <Label>Кількість балів</Label>
              <p className="text-xs text-muted-foreground">Позитивне число — нарахування, негативне — списання</p>
              <Input
                type="number"
                placeholder="напр. 500 або -200"
                value={adjustPoints}
                onChange={e => setAdjustPoints(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Опис (необов'язково)</Label>
              <Input placeholder="Причина коригування..." value={adjustDesc} onChange={e => setAdjustDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustModal(false)}>Скасувати</Button>
            <Button onClick={handleAdjust} disabled={adjusting || !adjustPoints}>
              {adjusting ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Settings modal ── */}
      <Dialog open={settingsModal} onOpenChange={setSettingsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Налаштування програми лояльності</DialogTitle>
          </DialogHeader>
          {settingsForm && (
            <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <Label>Назва програми</Label>
                <Input value={settingsForm.programName || ""} onChange={e => setSettingsForm({...settingsForm, programName: e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Балів за ніч</Label>
                  <Input type="number" value={settingsForm.pointsPerNight || 0} onChange={e => setSettingsForm({...settingsForm, pointsPerNight: parseInt(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Балів за 1 грн (номер)</Label>
                  <Input type="number" step="0.1" value={settingsForm.pointsPerUah || 0} onChange={e => setSettingsForm({...settingsForm, pointsPerUah: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Балів за 1 грн (F&B)</Label>
                  <Input type="number" step="0.1" value={settingsForm.pointsPerFbUah || 0} onChange={e => setSettingsForm({...settingsForm, pointsPerFbUah: e.target.value})} />
                </div>
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Пороги рівнів (накопичені бали)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Silver від</Label>
                  <Input type="number" value={settingsForm.silverThreshold || 0} onChange={e => setSettingsForm({...settingsForm, silverThreshold: parseInt(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Gold від</Label>
                  <Input type="number" value={settingsForm.goldThreshold || 0} onChange={e => setSettingsForm({...settingsForm, goldThreshold: parseInt(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Platinum від</Label>
                  <Input type="number" value={settingsForm.platinumThreshold || 0} onChange={e => setSettingsForm({...settingsForm, platinumThreshold: parseInt(e.target.value)})} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Курс списання (1 бал = ? грн)</Label>
                <Input type="number" step="0.01" value={settingsForm.pointsToUahRate || 0} onChange={e => setSettingsForm({...settingsForm, pointsToUahRate: e.target.value})} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsModal(false)}>Скасувати</Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
