import { useState } from "react";
import { useGetMe, useGetMyOrganization, getGetMyOrganizationQueryKey } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check, Zap, Building2, Crown, Shield, Clock, Users, Database,
  TrendingUp, Globe, Headphones, CreditCard, FileText, RefreshCw,
  AlertCircle, CheckCircle2, Loader2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 990,
    yearlyPrice: 9500,
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
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 2490,
    yearlyPrice: 23900,
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
      "OTA інтеграція (Booking, Expedia)",
      "Webhook сповіщення",
      "Telegram бот",
      "Пріоритетна підтримка",
      "Зберігання 1 рік",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    yearlyPrice: null,
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
    ],
  },
] as const;

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

function formatUAH(n: number) {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 0 }).format(n);
}

const SUB_STATUS_LABELS: Record<string, string> = {
  trial: "Пробний період",
  active: "Активна",
  past_due: "Прострочена оплата",
  cancelled: "Скасована",
  expired: "Закінчилася",
};

const SUB_TIER_LABELS: Record<string, string> = {
  trial: "Trial",
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

interface SubData {
  subscription: {
    tier: string;
    period: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  invoices: {
    id: number;
    invoiceNumber: string;
    tier: string;
    period: string;
    total: string;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }[];
}

interface PaymentData {
  invoice: { id: number; invoiceNumber: string; total: string };
  orderId: string;
  liqpay: { data: string; signature: string; formUrl: string; isSandbox: boolean };
  total: number;
  amount: number;
  tax: number;
}

export default function SubscriptionPage() {
  const { data: user } = useGetMe();
  const { data: org } = useGetMyOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [paymentDialog, setPaymentDialog] = useState<PaymentData | null>(null);
  const [simulating, setSimulating] = useState(false);

  const token = localStorage.getItem("hms_token");

  const { data: subData, refetch: refetchSub } = useQuery<SubData>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const r = await fetch(`${API}/subscriptions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json();
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (vars: { tier: string; period: string }) => {
      const r = await fetch(`${API}/subscriptions/create-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(vars),
      });
      if (!r.ok) throw new Error("Помилка створення рахунку");
      return r.json() as Promise<PaymentData>;
    },
    onSuccess: (data) => setPaymentDialog(data),
    onError: () => toast({ title: "Помилка", description: "Не вдалося створити рахунок", variant: "destructive" }),
  });

  const simulatePayment = async (orderId: string) => {
    setSimulating(true);
    try {
      const r = await fetch(`${API}/webhooks/simulate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "Оплату підтверджено!", description: "Підписку активовано." });
      setPaymentDialog(null);
      refetchSub();
      queryClient.invalidateQueries({ queryKey: getGetMyOrganizationQueryKey() });
    } catch {
      toast({ title: "Помилка симуляції", variant: "destructive" });
    } finally {
      setSimulating(false);
    }
  };

  const sub = subData?.subscription;
  const invoices = subData?.invoices || [];
  const currentTier = sub?.tier || org?.plan || "basic";

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Тарифні плани</h1>
          <p className="text-muted-foreground mt-2">Оберіть або змініть план у будь-який час без штрафів</p>
        </div>

        {/* Current subscription status */}
        {sub && (
          <Card className={`border-2 ${sub.status === "active" ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <CardContent className="pt-5 flex items-center gap-4">
              {sub.status === "active"
                ? <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                : <AlertCircle className="w-8 h-8 text-amber-600 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-lg">{SUB_TIER_LABELS[sub.tier] || sub.tier}</span>
                  <Badge variant="outline" className={sub.status === "active" ? "border-emerald-400 text-emerald-700" : "border-amber-400 text-amber-700"}>
                    {SUB_STATUS_LABELS[sub.status] || sub.status}
                  </Badge>
                  {sub.cancelAtPeriodEnd && (
                    <Badge variant="destructive" className="text-xs">Скасовується</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {sub.period === "yearly" ? "Річна підписка" : "Місячна підписка"} ·{" "}
                  Діє до {format(new Date(sub.currentPeriodEnd), "d MMMM yyyy", { locale: uk })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchSub()} className="gap-1.5 flex-shrink-0">
                <RefreshCw className="w-3.5 h-3.5" /> Оновити
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Trial notice */}
        {(!sub || sub.status === "trial") && org?.trialEndsAt && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-4">
            <Clock className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Пробний період активний</p>
              <p className="text-sm text-amber-700">
                Доступ до всіх функцій Pro до {format(new Date(org.trialEndsAt), "d MMMM yyyy", { locale: uk })}.
                Оберіть план нижче, щоб продовжити.
              </p>
            </div>
          </div>
        )}

        {/* Monthly / Yearly toggle */}
        <div className="flex justify-center">
          <div className="inline-flex items-center bg-muted rounded-xl p-1 gap-1">
            <button
              onClick={() => setPeriod("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${period === "monthly" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Місячна оплата
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${period === "yearly" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Річна оплата
              <Badge variant="secondary" className="text-[10px] py-0 bg-emerald-100 text-emerald-700">−20%</Badge>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(plan => {
            const isActive = currentTier === plan.id && sub?.status === "active";
            const price = period === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
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
                    <div className="p-2.5 rounded-xl bg-white/80 shadow-sm">
                      <plan.icon className={`w-6 h-6 ${plan.color}`} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{plan.name}</h2>
                      <div>
                        {price ? (
                          <>
                            <span className="text-2xl font-bold">{formatUAH(price)}</span>
                            <span className="text-muted-foreground text-sm">/{period === "yearly" ? "рік" : "міс"}</span>
                          </>
                        ) : (
                          <span className="text-lg font-semibold text-amber-700">За запитом</span>
                        )}
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
                  {isActive ? (
                    <Button className="w-full" variant="secondary" disabled>
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Активний план
                    </Button>
                  ) : plan.id === "enterprise" || !price ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => toast({ title: "Enterprise", description: "Напишіть на sales@maison-hd.com" })}
                    >
                      Зв'язатися з нами
                    </Button>
                  ) : (
                    <Button
                      className="w-full gap-2"
                      variant={plan.badge ? "default" : "outline"}
                      disabled={createInvoiceMutation.isPending}
                      onClick={() => createInvoiceMutation.mutate({ tier: plan.id, period })}
                    >
                      {createInvoiceMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      Оплатити
                    </Button>
                  )}
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
                      <th key={p.id} className={`py-3 px-4 text-center font-semibold ${currentTier === p.id ? "text-primary" : ""}`}>
                        {p.name}
                        {currentTier === p.id && <Badge variant="outline" className="ml-2 text-xs">Ваш</Badge>}
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

        {/* Invoice history */}
        {invoices.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Історія рахунків
            </h2>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Рахунок</th>
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Тариф</th>
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Сума</th>
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Статус</th>
                      <th className="py-3 px-4 text-left font-medium text-muted-foreground">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} className="border-b hover:bg-muted/5">
                        <td className="py-3 px-4 font-mono text-xs">{inv.invoiceNumber}</td>
                        <td className="py-3 px-4">
                          <span className="capitalize">{SUB_TIER_LABELS[inv.tier] || inv.tier}</span>
                          <span className="text-muted-foreground ml-1 text-xs">({inv.period === "yearly" ? "річний" : "місячний"})</span>
                        </td>
                        <td className="py-3 px-4 font-medium">{formatUAH(parseFloat(inv.total))}</td>
                        <td className="py-3 px-4">
                          <Badge variant={inv.status === "paid" ? "default" : inv.status === "overdue" ? "destructive" : "secondary"}>
                            {inv.status === "paid" ? "Оплачено" : inv.status === "pending" ? "Очікує оплати" : inv.status === "overdue" ? "Прострочено" : "Скасовано"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {format(new Date(inv.createdAt), "d MMM yyyy", { locale: uk })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Enterprise CTA */}
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100">
              <Crown className="w-7 h-7 text-amber-700" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-bold text-amber-900">Потрібен Enterprise?</p>
              <p className="text-sm text-amber-700">Кастомний брендинг, інтеграції з 1С, виділений менеджер і SLA 99.9%</p>
            </div>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => toast({ title: "Дякуємо!", description: "sales@maison-hd.com" })}>
              Зв'язатися
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={() => setPaymentDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Оплата підписки
            </DialogTitle>
          </DialogHeader>
          {paymentDialog && (
            <div className="space-y-5">
              <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Рахунок</span>
                  <span className="font-mono text-xs">{paymentDialog.invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Сума</span>
                  <span>{formatUAH(paymentDialog.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ПДВ 20%</span>
                  <span>{formatUAH(paymentDialog.tax)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2 font-semibold text-base">
                  <span>До сплати</span>
                  <span>{formatUAH(paymentDialog.total)}</span>
                </div>
              </div>

              {paymentDialog.liqpay.isSandbox ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    <p className="font-semibold mb-1">Тестовий режим (Sandbox)</p>
                    <p className="text-xs text-blue-600">Реальний LiqPay ключ не налаштовано. Натисніть кнопку для симуляції успішної оплати.</p>
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() => simulatePayment(paymentDialog.orderId)}
                    disabled={simulating}
                  >
                    {simulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Симулювати успішну оплату
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">Оплатіть через LiqPay. Вас буде перенаправлено на захищену сторінку оплати.</p>
                  <form action={paymentDialog.liqpay.formUrl} method="POST" target="_blank">
                    <input type="hidden" name="data" value={paymentDialog.liqpay.data} />
                    <input type="hidden" name="signature" value={paymentDialog.liqpay.signature} />
                    <Button type="submit" className="w-full gap-2">
                      <CreditCard className="w-4 h-4" /> Оплатити через LiqPay
                    </Button>
                  </form>
                </div>
              )}

              <Button variant="ghost" className="w-full" onClick={() => setPaymentDialog(null)}>
                Скасувати
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
