import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, CalendarDays, Users, Bed,
  Settings, LogOut, Moon, Sun, Wallet,
  Sparkles, Hotel, ClipboardList, Download, BedDouble,
  ChevronRight, ChevronLeft, ChevronDown,
  Home, Search, Info, ShoppingBag, BarChart2,
  Wrench, FileText, MessageSquare, UtensilsCrossed,
  Building2, Percent, CreditCard, BookOpen, Shield, Warehouse, FileDown, QrCode, ShieldCheck,
  Users2, Store, Bell, TrendingUp, Receipt, Package, FlaskConical, Clock,
  PackageX, ArrowRightLeft, BarChart, ClipboardCheck, Package2,
  Megaphone, Star, Ban, Users2 as UsersGroup,
  Lock, Monitor, Puzzle,
  Printer, XCircle, Cpu, Bot,
  Truck, LayoutGrid, ShieldAlert, Receipt as ReceiptIcon, CreditCard as CreditCardIcon,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES_UA: Record<string, string> = {
  super_admin: "Супер адмін",
  owner: "Власник",
  manager: "Менеджер",
  reception: "Рецепція",
  housekeeping: "Прибирання",
};

// ─── Nav structure ─────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  isExternal?: boolean;
  badge?: string;
};

type NavGroup = {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "basic",
    label: "Базовий",
    icon: Home,
    items: [
      { href: "/dashboard", label: "Головна", icon: LayoutDashboard },
      { href: "/chess", label: "Шахматка", icon: CalendarDays },
      { href: "/bookings", label: "Бронювання", icon: ClipboardList },
      { href: "/living", label: "Мешкаючі гості", icon: BedDouble },
      { href: "/guests", label: "Пошук гостей", icon: Search },
      { href: "/housekeeping", label: "Покоївки", icon: Sparkles },
    ],
  },
  {
    id: "sales",
    label: "Продаж",
    icon: ShoppingBag,
    items: [
      { href: "/rates", label: "Прейскуранти", icon: Wallet },
    ],
  },
  {
    id: "reports",
    label: "Звіти",
    icon: BarChart2,
    items: [
      { href: "/reports", label: "Статистика", icon: FileText },
    ],
  },
  {
    id: "fb",
    label: "F&B",
    icon: UtensilsCrossed,
    items: [
      { href: "/fb/cashier", label: "Станція касира / офіціанта", icon: Bell },
      { href: "/waiter", label: "Відкрити станцію офіціанта", icon: UtensilsCrossed, isExternal: true },
      { href: "/fb/menu", label: "Меню", icon: BookOpen },
      { href: "/fb/qr", label: "QR-меню столів", icon: QrCode },
    ],
  },
  {
    id: "fb-warehouse",
    label: "Склад F&B",
    icon: Warehouse,
    items: [
      { href: "/fb/warehouse", label: "Склад F&B", icon: Warehouse },
      { href: "/fb/packaging", label: "Фасування", icon: Package },
    ],
  },
  {
    id: "fb-marketing",
    label: "Маркетинг F&B",
    icon: Megaphone,
    items: [
      { href: "/fb/promotions", label: "Маркетинг (всі)", icon: Megaphone },
      { href: "/fb/clients", label: "Клієнти", icon: Users2 },
      { href: "/fb/client-groups", label: "Групи клієнтів", icon: UsersGroup },
      { href: "/fb/loyalty", label: "Програми лояльності", icon: Star },
      { href: "/fb/exceptions", label: "Винятки", icon: Ban },
    ],
  },
  {
    id: "fb-reports",
    label: "Звітність F&B",
    icon: BarChart2,
    items: [
      { href: "/fb/report/ai", label: "ШІ-звіти", icon: Sparkles, badge: "Нове" },
      { href: "/fb/report/sales", label: "Продажі", icon: TrendingUp },
      { href: "/fb/report/orders", label: "Чеки", icon: Receipt },
      { href: "/fb/report/products", label: "Товари та категорії", icon: Package },
      { href: "/fb/report/abc", label: "АВС-аналіз", icon: FlaskConical },
      { href: "/fb/shifts", label: "Касові зміни", icon: Clock },
    ],
  },
  {
    id: "fb-apps",
    label: "Застосунки F&B",
    icon: Puzzle,
    items: [
      { href: "/fb/apps", label: "Усі застосунки", icon: Puzzle },
      { href: "/fb/print-cards", label: "Друк тех. карток і НФ", icon: Printer },
      { href: "/fb/stop-list", label: "Стоп-лист на касі", icon: XCircle },
      { href: "/fb/postie", label: "Postie AI Assistant", icon: Cpu },
      { href: "/fb/delivery-bot", label: "Poster Delivery Bot", icon: Bot },
    ],
  },
  {
    id: "fb-config",
    label: "Налаштування F&B",
    icon: Wrench,
    items: [
      { href: "/fb/config/general", label: "Загальні", icon: Settings },
      { href: "/fb/config/tables", label: "Столи та зали", icon: LayoutGrid },
      { href: "/fb/config/orders", label: "Замовлення", icon: ShoppingBag },
      { href: "/fb/config/delivery", label: "Доставлення", icon: Truck },
      { href: "/fb/config/receipt", label: "Чек", icon: ReceiptIcon },
      { href: "/fb/config/taxes", label: "Податки / ПДВ", icon: Percent },
      { href: "/fb/config/security", label: "Безпека", icon: ShieldAlert },
      { href: "/fb/config/subscription", label: "Передплата", icon: CreditCardIcon },
      { href: "/fb/prro", label: "ПРРО / Зміни", icon: Shield },
      { href: "/fb/legal-entities", label: "Юр. особи", icon: Building2 },
      { href: "/fb/import", label: "Імпорт з Poster", icon: FileDown },
      { href: "/fb/admin-pin", label: "Admin PIN", icon: ShieldCheck },
      { href: "/fb/staff-access", label: "Персонал", icon: Users2 },
      { href: "/fb/positions", label: "Посади", icon: Shield },
      { href: "/fb/sessions", label: "Сесії", icon: Monitor },
      { href: "/fb/registers", label: "Каси", icon: Monitor },
      { href: "/fb/outlets", label: "Заклади", icon: Store },
      { href: "/fb/integrations", label: "Інтеграції", icon: Puzzle },
    ],
  },
  {
    id: "settings",
    label: "Налаштування",
    icon: Wrench,
    items: [
      { href: "/units", label: "Номерний фонд", icon: Bed },
      { href: "/import", label: "Імпорт даних", icon: Download },
      { href: "/settings/organization", label: "Параметри", icon: Settings },
    ],
  },
];

// ─── Legend items ─────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { color: "bg-emerald-500", label: "Проживаючий" },
  { color: "bg-amber-400", label: "На заїзді" },
  { color: "bg-blue-400", label: "Бронювання" },
  { color: "bg-red-500", label: "На виїзді" },
  { color: "bg-slate-400", label: "Вільно" },
];

// ─── Sidebar item (narrow or wide) ───────────────────────────────────────────

function NavLink({
  item, isActive, collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const cls = cn(
    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 group relative",
    collapsed ? "justify-center" : "",
    isActive
      ? "bg-primary/12 text-primary font-semibold"
      : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  );
  const inner = (
    <>
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full" />
      )}
      <Icon className={cn(
        "shrink-0 transition-transform group-hover:scale-110",
        collapsed ? "w-5 h-5" : "w-4 h-4",
        isActive ? "text-primary" : "text-sidebar-foreground/45"
      )} />
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="text-[9px] font-bold bg-violet-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
          {item.badge}
        </span>
      )}
    </>
  );
  if (item.isExternal) {
    return <a href={item.href} target="_blank" rel="noreferrer" title={collapsed ? item.label : undefined} className={cls}>{inner}</a>;
  }
  return (
    <Link href={item.href} title={collapsed ? item.label : undefined} className={cls}>
      {inner}
    </Link>
  );
}

// ─── Sidebar group (accordion) ────────────────────────────────────────────────

function NavGroup({
  group, location, collapsed, openGroups, onToggle,
}: {
  group: NavGroup;
  location: string;
  collapsed: boolean;
  openGroups: Set<string>;
  onToggle: (id: string) => void;
}) {
  const GroupIcon = group.icon;
  const isOpen = openGroups.has(group.id);
  const hasActive = group.items.some(
    item => location === item.href || location.startsWith(item.href + "/")
  );

  if (collapsed) {
    // In collapsed mode: show only group icon as a divider, then items
    return (
      <div className="space-y-0.5">
        <div className="h-px bg-sidebar-border/50 my-2" />
        {group.items.map(item => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return <NavLink key={item.href} item={item} isActive={isActive} collapsed />;
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => onToggle(group.id)}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150",
          hasActive
            ? "text-primary"
            : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
        )}
      >
        <GroupIcon className={cn("w-3.5 h-3.5 shrink-0", hasActive ? "text-primary" : "")} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn(
          "w-3.5 h-3.5 transition-transform duration-200",
          isOpen ? "rotate-0" : "-rotate-90"
        )} />
      </button>

      {/* Items */}
      <div className={cn(
        "overflow-hidden transition-all duration-200",
        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="pl-2 mt-0.5 space-y-0.5">
          {group.items.map(item => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return <NavLink key={item.href} item={item} isActive={isActive} collapsed={false} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Legend panel ─────────────────────────────────────────────────────────────

function LegendPanel({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);

  if (collapsed) {
    return (
      <button
        title="Легенда"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-center w-full py-2 text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
      >
        <Info className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
        <span className="font-semibold uppercase tracking-wider">Легенда</span>
        <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1.5">
          {LEGEND_ITEMS.map(li => (
            <div key={li.label} className="flex items-center gap-2 text-sidebar-foreground/60">
              <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${li.color}`} />
              {li.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isLoading } = useAuth();
  const [isDark, setIsDark] = useState(() => localStorage.getItem("hms_theme") === "dark");
  const [collapsed, setCollapsed] = useState(false);

  // Which groups are open — start with the group that has the active route
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const activeGroup = NAV_GROUPS.find(g =>
      g.items.some(i => location === i.href || location.startsWith(i.href + "/"))
    );
    return new Set(activeGroup ? [activeGroup.id] : ["basic"]);
  });

  // Open the group that contains the current route
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find(g =>
      g.items.some(i => location === i.href || location.startsWith(i.href + "/"))
    );
    if (activeGroup) {
      setOpenGroups(prev => {
        if (prev.has(activeGroup.id)) return prev;
        return new Set([...prev, activeGroup.id]);
      });
    }
  }, [location]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("hms_theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("hms_theme", "light");
    }
  }, [isDark]);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className={cn(
        "border-r border-sidebar-border bg-sidebar flex flex-col transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}>

        {/* Logo + collapse toggle */}
        <div className={cn(
          "h-14 flex items-center border-b border-sidebar-border/50 shrink-0",
          collapsed ? "justify-center px-2" : "px-4 gap-2.5"
        )}>
          {!collapsed && (
            <>
              <Hotel className="w-5 h-5 text-primary shrink-0" />
              <span className="font-display font-bold text-base tracking-tight truncate">Dogoda</span>
            </>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Розгорнути" : "Згорнути"}
            className={cn(
              "p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              collapsed ? "" : "ml-auto"
            )}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft className="w-4 h-4" />
            }
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin">
          {NAV_GROUPS.map(group => (
            <NavGroup
              key={group.id}
              group={group}
              location={location}
              collapsed={collapsed}
              openGroups={openGroups}
              onToggle={toggleGroup}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="border-t border-sidebar-border/50 py-1 px-2">
          <LegendPanel collapsed={collapsed} />
        </div>

        {/* User info + actions */}
        <div className={cn(
          "border-t border-sidebar-border/50 p-2 shrink-0",
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 px-1 mb-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white font-bold text-xs shadow-inner shrink-0">
                {user?.name?.charAt(0) || "К"}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-sidebar-foreground truncate">{user?.name || "Користувач"}</div>
                <div className="text-[10px] text-sidebar-foreground/45 truncate">{ROLES_UA[user?.role || ""] || user?.role}</div>
              </div>
            </div>
          )}

          <div className={cn("flex gap-1", collapsed ? "flex-col" : "")}>
            {collapsed && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white font-bold text-xs shadow-inner mx-auto mb-1">
                {user?.name?.charAt(0) || "К"}
              </div>
            )}
            <button
              onClick={() => setIsDark(!isDark)}
              title={isDark ? "Світла тема" : "Темна тема"}
              className={cn(
                "flex items-center justify-center py-1.5 rounded-lg bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors",
                collapsed ? "w-full" : "flex-1"
              )}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={logout}
              title="Вийти"
              className={cn(
                "flex items-center justify-center py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors",
                collapsed ? "w-full" : "flex-1"
              )}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-background min-w-0">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
