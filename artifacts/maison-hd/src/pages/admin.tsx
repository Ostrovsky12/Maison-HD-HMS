import { useState } from "react";
import {
  useListOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useListOrganizationMembers,
  getListOrganizationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  Building2,
  Plus,
  Loader2,
  Users,
  Hotel,
  CheckCircle2,
  XCircle,
  Clock,
  Crown,
  ChevronRight,
  CreditCard,
  ArrowLeft,
  Check,
  Copy,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const PLAN_META: Record<string, { label: string; color: string; bg: string }> = {
  basic: { label: "Basic", color: "text-gray-700", bg: "bg-gray-100" },
  pro: { label: "Pro", color: "text-violet-700", bg: "bg-violet-100" },
  enterprise: { label: "Enterprise", color: "text-amber-700", bg: "bg-amber-100" },
};

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  active: { label: "Активна", icon: CheckCircle2, color: "text-emerald-600" },
  trial: { label: "Пробний", icon: Clock, color: "text-amber-600" },
  suspended: { label: "Призупинена", icon: XCircle, color: "text-red-600" },
  cancelled: { label: "Скасована", icon: XCircle, color: "text-gray-500" },
};

function CreateOrgWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [result, setResult] = useState<{ organization: any; owner: any; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: "", slug: "", email: "", phone: "", address: "",
    ownerEmail: "", ownerName: "", ownerPassword: "",
    plan: "pro", trialDays: 30,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateOrganization();

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const autoSlug = (name: string) => {
    const map: Record<string, string> = {
      а:"a",б:"b",в:"v",г:"h",д:"d",е:"e",є:"ye",ж:"zh",з:"z",и:"y",і:"i",ї:"yi",
      й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
      х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ь:"",ю:"yu",я:"ya",
      ё:"yo",ъ:"",ы:"y",э:"e",
    };
    return name.toLowerCase()
      .split("")
      .map(c => map[c] ?? c)
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleSubmit = () => {
    createMutation.mutate(
      {
        data: {
          name: form.name, slug: form.slug,
          email: form.email || undefined, phone: form.phone || undefined, address: form.address || undefined,
          ownerEmail: form.ownerEmail, ownerName: form.ownerName, ownerPassword: form.ownerPassword,
          plan: form.plan as any, trialDays: form.trialDays,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
          setResult({ organization: data.organization, owner: data.owner, temporaryPassword: form.ownerPassword });
          setStep(3);
        },
        onError: (err: any) => {
          toast({ title: "Помилка", description: err?.message || "Не вдалося створити заклад", variant: "destructive" });
        },
      }
    );
  };

  const copyCredentials = () => {
    if (!result) return;
    const text = `Заклад: ${result.organization.name}\nEmail: ${result.owner.email}\nПароль: ${result.temporaryPassword}\nURL: /maison-hd/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Новий заклад — Крок 1/2: Інформація"}
            {step === 2 && "Новий заклад — Крок 2/2: Власник"}
            {step === 3 && "Заклад створено!"}
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        {step < 3 && (
          <div className="flex items-center gap-2 mb-2">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 2 && <div className={`h-0.5 w-16 ${step > s ? "bg-primary" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Org Info */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Назва закладу *</Label>
                <Input
                  placeholder="Заміський комплекс Dogoda"
                  value={form.name}
                  onChange={e => { update("name")(e); if (!form.slug) setForm(f => ({ ...f, slug: autoSlug(e.target.value) })); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>URL слаг *</Label>
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="dogoda"
                    value={form.slug}
                    onChange={update("slug")}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{form.slug}.maison-hd.com</p>
              </div>
              <div className="space-y-1.5">
                <Label>Тарифний план</Label>
                <Select value={form.plan} onValueChange={v => setForm(f => ({ ...f, plan: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic — 1 500 ₴/міс</SelectItem>
                    <SelectItem value="pro">Pro — 3 500 ₴/міс</SelectItem>
                    <SelectItem value="enterprise">Enterprise — за запитом</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Email закладу</Label>
                <Input placeholder="info@dogoda.com.ua" type="email" value={form.email} onChange={update("email")} />
              </div>
              <div className="space-y-1.5">
                <Label>Телефон</Label>
                <Input placeholder="+380 67 123 45 67" value={form.phone} onChange={update("phone")} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Адреса</Label>
                <Input placeholder="Київська обл., с. Догода, вул. Лісова, 1" value={form.address} onChange={update("address")} />
              </div>
              <div className="space-y-1.5">
                <Label>Тестовий період (днів)</Label>
                <Input type="number" min={0} max={365} value={form.trialDays} onChange={e => setForm(f => ({ ...f, trialDays: parseInt(e.target.value) || 30 }))} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Owner Info */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>ПІБ власника *</Label>
              <Input placeholder="Дмитро Головко" value={form.ownerName} onChange={update("ownerName")} />
            </div>
            <div className="space-y-1.5">
              <Label>Email власника *</Label>
              <Input type="email" placeholder="dmytro@dogoda.com.ua" value={form.ownerEmail} onChange={update("ownerEmail")} />
            </div>
            <div className="space-y-1.5">
              <Label>Початковий пароль *</Label>
              <Input type="password" placeholder="••••••••" value={form.ownerPassword} onChange={update("ownerPassword")} />
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
              Після першого входу власник зможе змінити пароль у налаштуваннях профілю.
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && result && (
          <div className="py-4 space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
              <p className="font-semibold text-emerald-800">{result.organization.name}</p>
              <div className="text-sm text-emerald-700 space-y-1">
                <p>Email: <code className="bg-white px-1 rounded">{result.owner.email}</code></p>
                <p>Пароль: <code className="bg-white px-1 rounded">{result.temporaryPassword}</code></p>
                <p>URL: <code className="bg-white px-1 rounded">/maison-hd/login</code></p>
              </div>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={copyCredentials}>
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? "Скопійовано!" : "Скопіювати дані"}
            </Button>
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={onClose}>Скасувати</Button>
              <Button onClick={() => setStep(2)} disabled={!form.name || !form.slug}>Далі →</Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" /> Назад</Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || !form.ownerEmail || !form.ownerName || !form.ownerPassword}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Створити заклад
              </Button>
            </>
          )}
          {step === 3 && (
            <Button onClick={onClose} className="w-full">Готово</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<number | null>(null);

  const { data: organizations, isLoading } = useListOrganizations();
  const { data: members, isLoading: membersLoading } = useListOrganizationMembers(
    selectedOrg!,
    { query: { enabled: !!selectedOrg } }
  );

  const totalOrgs = organizations?.length || 0;
  const activeOrgs = organizations?.filter(o => o.isActive).length || 0;
  const trialOrgs = organizations?.filter(o => o.subscriptionStatus === "trial").length || 0;

  if (selectedOrg) {
    const org = organizations?.find(o => o.id === selectedOrg);
    return (
      <AppLayout>
        <div className="p-8 max-w-5xl mx-auto space-y-6">
          <Button variant="ghost" onClick={() => setSelectedOrg(null)} className="gap-2 -ml-2">
            <ArrowLeft className="w-4 h-4" /> Всі заклади
          </Button>

          {org && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold">{org.name}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{org.slug}</code>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_META[org.plan]?.bg} ${PLAN_META[org.plan]?.color}`}>{PLAN_META[org.plan]?.label}</span>
                    {(() => {
                      const s = STATUS_META[org.subscriptionStatus || "trial"];
                      if (!s) return null;
                      return <span className={`text-xs flex items-center gap-1 ${s.color}`}><s.icon className="w-3.5 h-3.5" />{s.label}</span>;
                    })()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Email", value: org.email || "—" },
                  { label: "Телефон", value: org.phone || "—" },
                  { label: "Макс. номерів", value: org.maxUnits },
                  { label: "Макс. користувачів", value: org.maxUsers },
                ].map(item => (
                  <Card key={item.label} className="shadow-sm">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-semibold mt-0.5">{item.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {org.address && (
                <Card className="shadow-sm">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Адреса</p>
                    <p className="font-medium mt-0.5">{org.address}</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Співробітники
              </CardTitle>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (members || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Немає співробітників</p>
              ) : (
                <div className="space-y-2">
                  {(members || []).map(m => (
                    <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary uppercase">
                          {m.name.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">{m.role}</span>
                        {m.isActive ? (
                          <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Активний</span>
                        ) : (
                          <span className="text-xs text-gray-400">Вимкнено</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Crown className="w-8 h-8 text-amber-500" />
              Super Admin
            </h1>
            <p className="text-muted-foreground mt-1">Управління всіма закладами Maison HD</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Новий заклад
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Всього закладів", value: totalOrgs, icon: Building2, color: "text-primary", bg: "bg-primary/10" },
            { label: "Активні", value: activeOrgs, icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-100" },
            { label: "Пробний період", value: trialOrgs, icon: Clock, color: "text-amber-700", bg: "bg-amber-100" },
          ].map(s => (
            <Card key={s.label} className="shadow-sm">
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${s.bg}`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Organizations list */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Заклади</CardTitle>
            <CardDescription>Всі підключені заклади та їх статус</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
            ) : (organizations || []).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">Немає закладів</p>
                <p className="text-sm mt-1">Натисніть "Новий заклад" щоб додати перший</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(organizations || []).map(org => {
                  const plan = PLAN_META[org.plan] || PLAN_META.basic;
                  const status = STATUS_META[org.subscriptionStatus || "trial"];
                  return (
                    <div
                      key={org.id}
                      className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrg(org.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold">{org.name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.bg} ${plan.color}`}>{plan.label}</span>
                            {status && <span className={`text-xs flex items-center gap-1 ${status.color}`}><status.icon className="w-3 h-3" />{status.label}</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <code>{org.slug}</code>
                            {org.email && <span>{org.email}</span>}
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{org.userCount ?? 0} корист.</span>
                            <span className="flex items-center gap-1"><Hotel className="w-3 h-3" />{org.propertyCount ?? 0} об'єктів</span>
                            {org.trialEndsAt && org.subscriptionStatus === "trial" && (
                              <span className="flex items-center gap-1 text-amber-600">
                                <Clock className="w-3 h-3" />
                                До {format(new Date(org.trialEndsAt), "d MMM yyyy", { locale: uk })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showCreate && <CreateOrgWizard onClose={() => setShowCreate(false)} />}
    </AppLayout>
  );
}
