import { AppLayout } from "@/components/layout/app-layout";
import { useLocation } from "wouter";
import { ExternalLink, Bot, QrCode, Printer, XCircle, Shield, Cpu, Truck } from "lucide-react";

interface AppCard {
  title: string;
  description: string[];
  href?: string;
  externalHref?: string;
  bg: string;
  titleColor: string;
  icon: React.ElementType;
  featured?: boolean;
  badge?: string;
}

const APPS: AppCard[] = [
  {
    title: "Postie AI Assistant",
    description: ["Відповідає на питання про ваш бізнес", "Створює постачання з фото накладних", "Завантажує банківські виписки"],
    href: "/fb/postie",
    bg: "bg-violet-50 border-violet-200",
    titleColor: "text-violet-900",
    icon: Cpu,
    featured: true,
  },
  {
    title: "QR-меню, оплата, чайові та відгуки",
    description: ["QR-коди для столів", "Гостьове меню у браузері", "Онлайн-оплата та чайові"],
    href: "/fb/qr",
    bg: "bg-violet-600",
    titleColor: "text-white",
    icon: QrCode,
  },
  {
    title: "Сайт для замовлень",
    description: ["Сайт з онлайн-меню та замовленнями", "Синхронізація з меню в реальному часі"],
    externalHref: "#",
    bg: "bg-orange-50 border-orange-200",
    titleColor: "text-orange-900",
    icon: ExternalLink,
  },
  {
    title: "Звіт P&L",
    description: ["Звіт про прибутки та збитки", "Аналіз маржинальності"],
    href: "/fb/report/sales",
    bg: "bg-teal-50 border-teal-200",
    titleColor: "text-teal-900",
    icon: ExternalLink,
  },
  {
    title: "Аналітика для власника",
    description: ["Зведений дашборд", "KPI та тренди", "Доступ з телефону"],
    href: "/fb/report/sales",
    bg: "bg-emerald-50 border-emerald-200",
    titleColor: "text-emerald-900",
    icon: ExternalLink,
  },
  {
    title: "Друк ТК та НФ",
    description: ["Масовий друк технологічних карток", "Напівфабрикати та рецептури"],
    href: "/fb/print-cards",
    bg: "bg-blue-50 border-blue-200",
    titleColor: "text-blue-900",
    icon: Printer,
  },
  {
    title: "Стоп-лист на касі",
    description: ["Позначайте страви недоступними", "Касири та офіціанти не зможуть додати їх до замовлення"],
    href: "/fb/stop-list",
    bg: "bg-red-50 border-red-200",
    titleColor: "text-red-900",
    icon: XCircle,
  },
  {
    title: "ПРРО",
    description: ["Програмний реєстратор розрахункових операцій", "Фіскальні зміни та чеки"],
    href: "/fb/prro",
    bg: "bg-slate-50 border-slate-200",
    titleColor: "text-slate-900",
    icon: Shield,
  },
  {
    title: "Poster Delivery Bot",
    description: ["Telegram-бот для замовлень", "Доставка, самовивіз, в закладі", "Онлайн-оплата"],
    href: "/fb/delivery-bot",
    bg: "bg-sky-50 border-sky-200",
    titleColor: "text-sky-900",
    icon: Bot,
  },
];

export default function FbApps() {
  const [, nav] = useLocation();
  const [featured, ...rest] = APPS;

  function CardContent({ app }: { app: AppCard }) {
    const Icon = app.icon;
    return (
      <div className={`rounded-2xl border p-6 h-full flex flex-col gap-3 cursor-pointer hover:shadow-md transition-all ${app.bg}`}
        onClick={() => app.href ? nav(app.href) : app.externalHref && window.open(app.externalHref, "_blank")}>
        <div className="flex items-start justify-between gap-3">
          <h3 className={`font-bold text-lg leading-tight ${app.titleColor}`}>{app.title}</h3>
          {(app.externalHref) && <ExternalLink className="w-4 h-4 shrink-0 mt-1 opacity-40" />}
        </div>
        <ul className="space-y-1">
          {app.description.map((d, i) => (
            <li key={i} className={`text-sm flex items-start gap-2 ${app.bg.includes("violet-600") ? "text-violet-100" : "text-muted-foreground"}`}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
              {d}
            </li>
          ))}
        </ul>
        {app.badge && (
          <span className="text-xs bg-white/60 px-2 py-0.5 rounded-full w-fit font-medium">{app.badge}</span>
        )}
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-auto">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <h1 className="text-lg font-bold">Каталог застосунків</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Підключайте додаткові функції для вашого закладу</p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-4">
            {/* Featured — spans 2 rows */}
            <div className="row-span-2">
              <CardContent app={featured} />
            </div>
            {/* Rest */}
            {rest.map(app => (
              <CardContent key={app.title} app={app} />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
