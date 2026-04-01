import { useGetMe, useGetMyOrganization, useUpdateOrganization, getGetMyOrganizationQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Zap, Building2, Crown, Shield, Clock, Users, Database, TrendingUp, Globe, Headphones } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: "1 500 ₴",
    period: "/міс",
    icon: Building2,
    color: "text-gray-700",
    bg: "bg-gray-50",
    border: "border-gray-200",
    badge: null,
    features: [
      "До 20 номерів",
      "До 5 користувачів",
      "Шахматка бронювань",
      "CRM гостей",
      "Базові звіти",
      "Email підтримка",
      "Зберігання 30 днів",
    ],
    limits: { rooms: 20, users: 5 },
  },
  {
    id: "pro",
    name: "Pro",
    price: "3 500 ₴",
    period: "/міс",
    icon: Zap,
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-300",
    badge: "ПОПУЛЯРНИЙ",
    features: [
      "До 100 номерів",
      "До 15 користувачів",
      "Розширена аналітика (ADR, RevPAR)",
      "Прогнозування попиту",
      "Інтеграція з OTA (Booking, Expedia)",
      "Webhook сповіщення",
      "Telegram бот",
      "Пріоритетна підтримка",
      "Зберігання 1 рік",
    ],
    limits: { rooms: 100, users: 15 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "За запитом",
    period: "",
    icon: Crown,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: null,
    features: [
      "Безліміт номерів",
      "Безліміт користувачів",
      "Всі функції Pro",
      "Інтеграція з 1С / ERP",
      "Кастомний брендинг",
      "White-label рішення",
      "SLA 99.9%",
      "Виділений менеджер",
      "API без обмежень",
      "Архів без обмежень",
    ],
    limits: { rooms: null, users: null },
  },
];

const COMPARISON_FEATURES = [
  { name: "Номери", basic: "До 20", pro: "До 100", enterprise: "Безліміт", icon: Building2 },
  { name: "Користувачі", basic: "До 5", pro: "До 15", enterprise: "Безліміт", icon: Users },
  { name: "Шахматка", basic: true, pro: true, enterprise: true, icon: Check },
  { name: "CRM гостей", basic: true, pro: true, enterprise: true, icon: Check },
  { name: "Аналітика ADR/RevPAR", basic: false, pro: true, enterprise: true, icon: TrendingUp },
  { name: "OTA інтеграція", basic: false, pro: true, enterprise: true, icon: Globe },
  { name: "Прогнозування", basic: false, pro: true, enterprise: true, icon: Check },
  { name: "1С / ERP", basic: false, pro: false, enterprise: true, icon: Database },
  { name: "SLA 99.9%", basic: false, pro: false, enterprise: true, icon: Shield },
  { name: "Підтримка", basic: "Email", pro: "Пріоритетна", enterprise: "Виділений менеджер", icon: Headphones },
];

function FeatureCheck({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value
      ? <Check className="w-4 h-4 text-emerald-600 mx-auto" />
      : <span className="text-muted-foreground/40 text-sm">—</span>;
  }
  return <span className="text-sm text-center">{value}</span>;
}

export default function SubscriptionPage() {
  const { data: user } = useGetMe();
  const { data: org } = useGetMyOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateOrgMutation = useUpdateOrganization();

  const currentPlan = org?.plan || "basic";
  const subscriptionStatus = org?.subscriptionStatus;
  const trialEndsAt = org?.trialEndsAt;

  const handleChangePlan = (planId: string) => {
    if (planId === "enterprise") {
      toast({ title: "Зв'яжіться з нами", description: "Напишіть на sales@maison-hd.com для обговорення умов Enterprise." });
      return;
    }
    if (!org) return;
    updateOrgMutation.mutate(
      { orgId: org.id, data: { plan: planId as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyOrganizationQueryKey() });
          toast({ title: "Тарифний план змінено", description: `Активовано план ${planId.charAt(0).toUpperCase() + planId.slice(1)}` });
        },
        onError: () => toast({ title: "Помилка зміни плану", variant: "destructive" }),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Тарифні плани</h1>
          <p className="text-muted-foreground mt-2">Оберіть або змініть план у будь-який час без штрафів</p>
        </div>

        {/* Trial notice */}
        {subscriptionStatus === "trial" && trialEndsAt && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-4">
            <Clock className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Пробний період активний</p>
              <p className="text-sm text-amber-700">
                Доступ до всіх функцій Pro до {format(new Date(trialEndsAt), "d MMMM yyyy", { locale: uk })}.
                Після закінчення перейдіть на один з планів нижче.
              </p>
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(plan => {
            const isActive = currentPlan === plan.id;
            return (
              <div key={plan.id} className={`relative flex flex-col rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${isActive ? "border-primary shadow-md" : plan.border}`}>
                {plan.badge && (
                  <div className="bg-primary text-primary-foreground text-center text-xs font-bold py-1.5 tracking-wide">
                    {plan.badge}
                  </div>
                )}
                {isActive && !plan.badge && (
                  <div className="bg-primary/10 text-primary text-center text-xs font-bold py-1.5 tracking-wide">
                    ВАШ ПОТОЧНИЙ ПЛАН
                  </div>
                )}
                <div className={`p-6 ${plan.bg}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl bg-white/80 shadow-sm`}>
                      <plan.icon className={`w-6 h-6 ${plan.color}`} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{plan.name}</h2>
                      <div>
                        <span className="text-2xl font-bold">{plan.price}</span>
                        <span className="text-muted-foreground text-sm">{plan.period}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-6 bg-card space-y-3">
                  <ul className="space-y-2">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-card border-t">
                  <Button
                    className="w-full"
                    variant={isActive ? "secondary" : plan.badge ? "default" : "outline"}
                    disabled={isActive || updateOrgMutation.isPending}
                    onClick={() => handleChangePlan(plan.id)}
                  >
                    {isActive ? "Активний план" : plan.id === "enterprise" ? "Зв'язатися з нами" : "Обрати план"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison table */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Порівняння функцій</h2>
          <Card className="shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground w-1/3">Функція</th>
                    {PLANS.map(p => (
                      <th key={p.id} className={`py-3 px-4 text-center font-semibold ${currentPlan === p.id ? "text-primary" : ""}`}>
                        {p.name}
                        {currentPlan === p.id && <Badge variant="outline" className="ml-2 text-xs">Ваш</Badge>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map((feature, i) => (
                    <tr key={feature.name} className={`border-b ${i % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                      <td className="py-3 px-4 font-medium flex items-center gap-2">
                        <feature.icon className="w-4 h-4 text-muted-foreground" />
                        {feature.name}
                      </td>
                      <td className="py-3 px-4 text-center"><FeatureCheck value={feature.basic} /></td>
                      <td className="py-3 px-4 text-center"><FeatureCheck value={feature.pro} /></td>
                      <td className="py-3 px-4 text-center"><FeatureCheck value={feature.enterprise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* CTA for Enterprise */}
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100">
              <Crown className="w-7 h-7 text-amber-700" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-bold text-amber-900">Потрібен Enterprise?</p>
              <p className="text-sm text-amber-700">Кастомний брендинг, інтеграції з 1С, виділений менеджер і SLA 99.9%</p>
            </div>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => toast({ title: "Скоро!", description: "Наша команда зв'яжеться з вами" })}>
              Зв'язатися з нами
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
