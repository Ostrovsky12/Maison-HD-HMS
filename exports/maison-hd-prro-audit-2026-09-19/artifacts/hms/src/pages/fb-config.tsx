import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Settings, ShoppingBag, Truck, LayoutGrid, Receipt, Percent, ShieldAlert,
  CreditCard, Shield, Building2, FileDown, ShieldCheck, Users2, Award,
  Monitor, Store, Puzzle, ChevronRight, Wrench,
} from "lucide-react";

// ─── Config item definition ───────────────────────────────────────────────────
interface ConfigItem {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
}

interface ConfigSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: ConfigItem[];
}

const SECTIONS: ConfigSection[] = [
  {
    id: "general",
    label: "Основні",
    icon: Settings,
    items: [
      { href: "/fb/config/general",    label: "Загальні налаштування", description: "Назва, мова, часовий пояс, формат чека",    icon: Settings,    iconColor: "text-slate-600 bg-slate-100" },
      { href: "/fb/config/orders",     label: "Замовлення",            description: "Типи замовлень, мінімальна сума, час",     icon: ShoppingBag, iconColor: "text-blue-600 bg-blue-100" },
      { href: "/fb/config/delivery",   label: "Доставлення",           description: "Умови доставки, зони, мінімальний чек",   icon: Truck,       iconColor: "text-orange-600 bg-orange-100" },
      { href: "/fb/config/tables",     label: "Столи та зали",         description: "Структура зон, столи, QR-коди",           icon: LayoutGrid,  iconColor: "text-violet-600 bg-violet-100" },
    ],
  },
  {
    id: "payments",
    label: "Розрахунки",
    icon: Receipt,
    items: [
      { href: "/fb/config/receipt",      label: "Чек",             description: "Шаблон чека, логотип, підвал, коментар",    icon: Receipt,     iconColor: "text-emerald-600 bg-emerald-100" },
      { href: "/fb/config/taxes",        label: "Податки / ПДВ",   description: "Ставки ПДВ, акцизи, групи оподаткування",  icon: Percent,     iconColor: "text-amber-600 bg-amber-100" },
      { href: "/fb/config/subscription", label: "Передплата",      description: "Активна підписка, ліміти, поновлення",     icon: CreditCard,  iconColor: "text-indigo-600 bg-indigo-100" },
    ],
  },
  {
    id: "security",
    label: "Безпека та доступ",
    icon: ShieldAlert,
    items: [
      { href: "/fb/config/security", label: "Безпека",   description: "Дозволи, підтвердження дій, скидання",    icon: ShieldAlert, iconColor: "text-red-600 bg-red-100" },
      { href: "/fb/admin-pin",       label: "Admin PIN", description: "Пін-код адміністратора для захисту дій",  icon: ShieldCheck, iconColor: "text-rose-600 bg-rose-100" },
    ],
  },
  {
    id: "prro",
    label: "ПРРО та юридичне",
    icon: Shield,
    items: [
      { href: "/fb/prro",           label: "ПРРО / Зміни",  description: "Фіскальний реєстратор, зміни, чеки ДПС",  icon: Shield,    iconColor: "text-slate-600 bg-slate-100" },
      { href: "/fb/legal-entities", label: "Юридичні особи", description: "ФОП, ТОВ, реквізити, ІПН / ЄДРПОУ",     icon: Building2, iconColor: "text-slate-700 bg-slate-100" },
    ],
  },
  {
    id: "staff",
    label: "Персонал та каси",
    icon: Users2,
    items: [
      { href: "/fb/staff-access", label: "Персонал",    description: "Доступи для касирів та офіціантів",     icon: Users2,  iconColor: "text-violet-600 bg-violet-100" },
      { href: "/fb/positions",    label: "Посади",       description: "Ролі персоналу та їхні права",          icon: Award,   iconColor: "text-purple-600 bg-purple-100" },
      { href: "/fb/sessions",     label: "Сесії",        description: "Активні сеанси касирів та офіціантів",  icon: Monitor, iconColor: "text-blue-600 bg-blue-100" },
      { href: "/fb/registers",    label: "Каси",         description: "Термінали та касові апарати",           icon: Monitor, iconColor: "text-teal-600 bg-teal-100" },
      { href: "/fb/outlets",      label: "Заклади",      description: "Точки продажу, адреси, графік",         icon: Store,   iconColor: "text-emerald-600 bg-emerald-100" },
    ],
  },
  {
    id: "tools",
    label: "Інтеграції та імпорт",
    icon: Puzzle,
    items: [
      { href: "/fb/integrations", label: "Інтеграції",      description: "Poster, 1C, фіскальні апарати, API",  icon: Puzzle,   iconColor: "text-violet-600 bg-violet-100" },
      { href: "/fb/import",       label: "Імпорт з Poster",  description: "Завантаження меню, залишків, клієнтів", icon: FileDown, iconColor: "text-blue-600 bg-blue-100" },
    ],
  },
];

// ─── Config card ──────────────────────────────────────────────────────────────
function ConfigCard({ item }: { item: ConfigItem }) {
  const [, nav] = useLocation();
  const Icon = item.icon;
  return (
    <button
      onClick={() => nav(item.href)}
      className="group flex items-start gap-3 p-4 bg-card border rounded-xl text-left hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.iconColor}`}>
        <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{item.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.description}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground mt-1 shrink-0 transition-colors" />
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FbConfig() {
  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center gap-3">
          <Wrench className="w-5 h-5 text-muted-foreground shrink-0" />
          <div>
            <h1 className="text-lg font-bold">Налаштування F&B</h1>
            <p className="text-xs text-muted-foreground">Конфігурація системи, персоналу, каси та інтеграцій</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto space-y-8">
            {SECTIONS.map(section => {
              const SectionIcon = section.icon;
              return (
                <div key={section.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <SectionIcon className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{section.label}</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {section.items.map(item => (
                      <ConfigCard key={item.href} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
