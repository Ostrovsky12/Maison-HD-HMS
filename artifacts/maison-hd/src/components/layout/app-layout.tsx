import { useLocation } from "wouter";
import { MaisonLogo } from "@/components/MaisonLogo";
import {
  LayoutDashboard, CalendarDays, KeyRound, Users, BarChart3, Settings,
  LogOut, Grid3X3, Bell, CheckCheck, X, FileText, TrendingUp,
  Plug, Crown, CreditCard, ArrowRightLeft, MessageSquare, Waves,
  PartyPopper, UtensilsCrossed, Zap, Bot, Building2, Globe,
  Monitor, Brain, Heart, Wallet, Wrench, ChefHat, Bike, BedDouble, Truck,
  Activity, Layers, ClipboardList, Target, Landmark, Tag, Star,
  ChevronRight, Menu, Sparkles, Search, Wine, Moon, Package, QrCode, Coins,
  Smartphone, Leaf, Phone, Hammer, Warehouse, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useLogout, useGetMe, useGetMyOrganization, useListNotifications,
  useMarkAllNotificationsRead, useMarkNotificationRead,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ReactNode, useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { uk } from "date-fns/locale";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";

// ── NAV STRUCTURE ─────────────────────────────────────────────────────────────
type NavItem = { name: string; path: string; icon: any; roles?: string[] | null; badge?: string; moduleKey?: string };
type NavSection = { label: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    label: "Cockpit",
    items: [
      { name: "Головна",        path: "/dashboard",  icon: LayoutDashboard, roles: null },
      { name: "Staff Console",  path: "/console",    icon: Activity,        roles: null },
      { name: "Command Center", path: "/hq",         icon: Zap,             roles: ["super_admin", "owner", "manager"] },
    ],
  },
  {
    label: "Резервації",
    items: [
      { name: "Бронювання",  path: "/bookings",    icon: CalendarDays, roles: null },
      { name: "Шахматка",    path: "/chess",        icon: Grid3X3,      roles: null },
      { name: "Тарифи",      path: "/rates",        icon: Tag,          roles: ["super_admin","owner","manager","reception"] },
      { name: "Номери",      path: "/units",        icon: KeyRound,     roles: null },
      { name: "Гості",       path: "/guests",       icon: Users,        roles: null },
      { name: "Бронювати онлайн", path: "/book",    icon: Sparkles,     roles: null },
    ],
  },
  {
    label: "Операції",
    items: [
      { name: "Прибирання",     path: "/housekeeping", icon: Sparkles, roles: null },
      { name: "Тех. служба",    path: "/maintenance",  icon: Wrench,   roles: null },
      { name: "Вигляд техніка", path: "/tech",         icon: Hammer,   roles: null },
      { name: "Активності",     path: "/activities",   icon: Bike,     roles: null },
      { name: "Проживання",     path: "/accommodation",icon: BedDouble,roles: null },
      { name: "Внутрішні операції", path: "/operations",   icon: Layers,       roles: null },
      { name: "Розклад персоналу", path: "/staff-schedule", icon: CalendarDays, roles: ["super_admin","owner","manager"] },
    ],
  },
  {
    label: "Дохід",
    items: [
      { name: "Revenue Mgmt",      path: "/revenue",           icon: TrendingUp, roles: ["super_admin", "owner", "manager"] },
      { name: "Rate Intelligence", path: "/rate-intelligence",  icon: Activity,   roles: ["super_admin", "owner", "manager"] },
      { name: "OTA Канали",    path: "/ota",     icon: Globe,      roles: ["super_admin", "owner", "manager"] },
      { name: "Оренда",        path: "/rentals", icon: Building2,  roles: ["super_admin", "owner", "manager"] },
    ],
  },
  {
    label: "Гостьовий досвід",
    items: [
      { name: "Inbox",           path: "/inbox",            icon: MessageSquare, roles: null },
      { name: "Guest Experience",path: "/guest-experience", icon: Heart,         roles: ["super_admin", "owner", "manager", "reception"] },
      { name: "Digital Key",     path: "/digital-keys",     icon: Smartphone,    roles: null },
      { name: "Telephony AI",    path: "/telephony",        icon: Phone,         roles: null },
      { name: "Hotel TV",        path: "/hotel-tv",         icon: Monitor,       roles: ["super_admin", "owner", "manager"] },
    ],
  },
  {
    label: "Гостинність",
    items: [
      { name: "SPA & Wellness",  path: "/spa",           icon: Waves,           roles: null,                                       moduleKey: "spa" },
      { name: "Events & Банкети",path: "/events",        icon: PartyPopper,     roles: null,                                       moduleKey: "events" },
      { name: "Ресторан & F&B",  path: "/fb",            icon: UtensilsCrossed, roles: null,                                       moduleKey: "fb" },
      { name: "Станція офіціанта",path: "/waiter",       icon: ClipboardList,   roles: null,                                       moduleKey: "fb_pos" },
      { name: "F&B Склад",       path: "/fb-warehouse",  icon: Warehouse,       roles: null,                                       moduleKey: "fb_warehouse" },
      { name: "F&B Каса",        path: "/fb-pos",        icon: Coins,           roles: null,                                       moduleKey: "fb_pos" },
      { name: "F&B Костинг",     path: "/fb-costing",    icon: ChefHat,         roles: null,                                       moduleKey: "fb_analytics" },
      { name: "QR-замовлення",   path: "/qr-ordering",   icon: QrCode,          roles: null },
      { name: "Доставка",        path: "/delivery",      icon: Truck,           roles: null,                                       moduleKey: "fb_pos" },
      { name: "Мінібар",         path: "/minibar",       icon: Wine,            roles: null },
      { name: "F&B CRM Клієнти", path: "/fb-customers",  icon: Users,           roles: null,                                       moduleKey: "fb_pos" },
      { name: "POS Налаштування",path: "/pos-settings",  icon: Printer,         roles: ["super_admin", "owner", "manager"] },
    ],
  },
  {
    label: "AI & Автоматизація",
    items: [
      { name: "AI Hub",       path: "/ai-hub",     icon: Brain,   roles: ["super_admin", "owner", "manager"], moduleKey: "ai_hub" },
      { name: "Автоматизація",path: "/automation", icon: Bot,     roles: ["super_admin", "owner", "manager"], moduleKey: "automation" },
      { name: "Пакети",       path: "/packages",   icon: Package, roles: ["super_admin", "owner", "manager"] },
      { name: "Лояльність",   path: "/loyalty",    icon: Coins,   roles: ["super_admin", "owner", "manager"] },
      { name: "Upsell Engine",path: "/upsell",     icon: Zap,     roles: ["super_admin", "owner", "manager"], moduleKey: "upsell" },
    ],
  },
  {
    label: "Фінанси",
    items: [
      { name: "Фінанси",      path: "/finance",      icon: Wallet,   roles: ["super_admin", "owner", "manager", "reception"] },
      { name: "Рахунки",      path: "/invoices",     icon: FileText, roles: null },
      { name: "Бухгалтерія",  path: "/accounting",   icon: Landmark, roles: ["super_admin", "owner", "manager"], moduleKey: "accounting" },
      { name: "Нічний аудит", path: "/night-audit",  icon: Moon,     roles: ["super_admin", "owner", "manager"], moduleKey: "night_audit" },
      { name: "Продажі & CRM",path: "/sales",        icon: Target,   roles: ["super_admin", "owner", "manager", "reception"] },
    ],
  },
  {
    label: "Аналітика",
    items: [
      { name: "Аналітика", path: "/analytics", icon: BarChart3, roles: ["super_admin", "owner", "manager"], moduleKey: "analytics" },
      { name: "Звіти",     path: "/reports",   icon: FileText,  roles: null },
    ],
  },
  {
    label: "Sustainability",
    items: [
      { name: "ESG & Екологія", path: "/sustainability", icon: Leaf, roles: ["super_admin", "owner", "manager"] },
    ],
  },
  {
    label: "Платформа",
    items: [
      { name: "Інтеграції",    path: "/integrations",  icon: Plug,          roles: ["super_admin", "owner", "manager"] },
      { name: "Підписка",      path: "/subscription",  icon: CreditCard,    roles: ["owner", "super_admin"] },
      { name: "Міграція",      path: "/migration",     icon: ArrowRightLeft,roles: ["super_admin", "owner", "manager"] },
      { name: "Презентація",   path: "/pitch",         icon: Sparkles,      roles: ["super_admin", "owner", "manager"] },
    ],
  },
  {
    label: "⚙ Адміністрація",
    items: [
      { name: "Панель адміна", path: "/admin",         icon: Crown,         roles: ["super_admin"] },
      { name: "Demo Заявки",   path: "/demo-requests", icon: ClipboardList, roles: ["super_admin"] },
      { name: "Тарифи SaaS",   path: "/pricing",       icon: Tag,           roles: ["super_admin"] },
    ],
  },
];

// ── NOTIFICATION BELL ─────────────────────────────────────────────────────────
const NOTIF_COLORS: Record<string, string> = {
  booking_created: "bg-blue-100 text-blue-700",
  checkin:  "bg-emerald-100 text-emerald-700",
  checkout: "bg-amber-100 text-amber-700",
  cancellation: "bg-red-100 text-red-700",
  alert: "bg-orange-100 text-orange-700",
  housekeeping: "bg-violet-100 text-violet-700",
  report: "bg-gray-100 text-gray-700",
};
const NOTIF_LABELS: Record<string, string> = {
  booking_created: "Бронювання", checkin: "Заїзд", checkout: "Виїзд",
  cancellation: "Скасування", alert: "Увага", housekeeping: "Прибирання", report: "Звіт",
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, refetch } = useListNotifications({ limit: 20 });
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();
  const notifications = data?.notifications || [];
  const unread = data?.unreadCount || 0;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-sm text-gray-800">Сповіщення</span>
            <div className="flex gap-1">
              {unread > 0 && (
                <button onClick={() => markAll.mutate(undefined, { onSuccess: () => refetch() })}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" /> Всі
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Немає сповіщень</p>
              </div>
            ) : notifications.map((n) => (
              <div key={n.id}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50/80 transition-colors ${!n.isRead ? "bg-indigo-50/40" : ""}`}
                onClick={() => !n.isRead && markOne.mutate({ notificationId: n.id }, { onSuccess: () => refetch() })}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${NOTIF_COLORS[n.type] || "bg-gray-100 text-gray-700"}`}>
                        {NOTIF_LABELS[n.type] || n.type}
                      </span>
                      {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />}
                    </div>
                    <p className="text-sm font-medium leading-tight text-gray-800">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: uk })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN LAYOUT ───────────────────────────────────────────────────────────────
export function AppLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { toast } = useToast();
  const qc = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();

  const handleLogout = useCallback(() => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("hms_token");
        qc.clear();
        navigate(`~${BASE}/login`);
      },
      onError: () => toast({ title: "Помилка виходу", variant: "destructive" }),
    });
  }, [logout, qc, navigate, BASE, toast]);

  const goTo = (path: string) => {
    navigate(`~${BASE}${path}`);
    setMobileOpen(false);
  };

  const isActive = (path: string) => {
    if (path === "/dashboard") return location === "/dashboard" || location === "/";
    return location.startsWith(path);
  };

  const isSuperAdmin = user?.role === "super_admin";
  const userRole = user?.role || "";

  // Fetch org modules — only for non-super_admin (super_admin sees everything)
  const { data: orgData } = useGetMyOrganization();
  // enabled_modules: null/undefined = all allowed; array = whitelist
  const enabledModules: string[] | null = isSuperAdmin
    ? null
    : ((orgData as any)?.enabledModules ?? (orgData as any)?.enabled_modules ?? null);

  const isModuleEnabled = (moduleKey?: string) => {
    if (!moduleKey) return true;                         // no gate → always visible
    if (isSuperAdmin) return true;                       // super_admin sees everything
    if (!enabledModules || !Array.isArray(enabledModules)) return true; // null / non-array → no restrictions
    return enabledModules.includes(moduleKey);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="px-5 pt-6 pb-4 space-y-3">
        <MaisonLogo size={36} textVariant="dark" />
        {isSuperAdmin && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/15 border border-amber-500/20 rounded-lg">
            <Crown className="w-3 h-3 text-amber-400" />
            <span className="text-xs text-amber-300 font-medium">Super Admin</span>
          </div>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {NAV.map((section) => {
          const visibleItems = section.items.filter(item =>
            (!item.roles || item.roles.includes(userRole)) &&
            isModuleEnabled(item.moduleKey)
          );
          if (!visibleItems.length) return null;
          const isAdminSection = section.label.includes("Адміністрація");
          return (
            <div key={section.label}>
              {isAdminSection && (
                <div className="mx-3 mb-3 border-t border-amber-500/20" />
              )}
              <div className="px-3 mb-1.5">
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${isAdminSection ? "text-amber-400/60" : "text-white/25"}`}>
                  {isAdminSection ? "Адміністрація" : section.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  const isAdminItem = isAdminSection;
                  return (
                    <button
                      key={item.path}
                      onClick={() => goTo(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all group ${
                        active
                          ? isAdminItem
                            ? "bg-amber-500/15 text-amber-200 font-medium shadow-sm"
                            : "bg-white/12 text-white font-medium shadow-sm"
                          : isAdminItem
                            ? "text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-300"
                            : "text-white/50 hover:bg-white/7 hover:text-white/80"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? (isAdminItem ? "text-amber-300" : "text-indigo-300") : isAdminItem ? "text-amber-400/60 group-hover:text-amber-400" : "text-white/35 group-hover:text-white/60"}`} />
                      <span className="truncate text-left">{item.name}</span>
                      {active && <ChevronRight className={`w-3 h-3 ml-auto shrink-0 ${isAdminItem ? "text-amber-400/50" : "text-white/30"}`} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom user section */}
      <div className="p-3 border-t border-white/8 space-y-0.5">
        {(userRole === "super_admin" || userRole === "owner" || userRole === "manager") && (
          <button
            onClick={() => goTo("/settings")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
              isActive("/settings") ? "bg-white/12 text-white" : "text-white/50 hover:bg-white/7 hover:text-white/80"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Налаштування</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/50 hover:bg-white/7 hover:text-white/80 transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Вийти</span>
        </button>

        {/* User card */}
        <div className="mt-2 px-3 py-2.5 rounded-xl bg-white/6 border border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
              {user?.name?.[0] || "U"}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-medium text-white/85 truncate">{user?.name || "Користувач"}</p>
              <p className="text-[11px] text-white/35 truncate">{user?.role || "—"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F7F8FC] text-foreground">
      {/* Desktop sidebar */}
      <aside className="w-60 shrink-0 hidden md:flex flex-col bg-[#1a1d2e] border-r border-white/5 fixed top-0 left-0 h-screen z-30 overflow-hidden">
        {SidebarContent()}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-[#1a1d2e] h-full overflow-hidden flex flex-col">
            {SidebarContent()}
          </aside>
        </div>
      )}

      {/* Main content — offset for fixed sidebar */}
      <main className="flex-1 flex flex-col min-w-0 md:ml-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Current page breadcrumb — desktop */}
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
            <span className="font-medium text-gray-800">
              {NAV.flatMap(s => s.items).find(i => isActive(i.path))?.name || "Maison HD"}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Cmd+K trigger */}
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs text-gray-400 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Пошук</span>
              <kbd className="text-[10px] bg-white border border-gray-200 px-1 py-0.5 rounded font-mono ml-1">⌘K</kbd>
            </button>
            <NotificationBell />
          </div>
        </header>

        {/* Impersonation banner */}
        {typeof window !== "undefined" && localStorage.getItem("hms_super_admin_token") && (
          <div className="bg-amber-500 text-white text-xs px-4 py-2 flex items-center justify-between gap-3">
            <span className="font-semibold">🔑 Режим імперсонації — ви переглядаєте акаунт тенанта від імені Super Admin</span>
            <button
              onClick={() => {
                const superToken = localStorage.getItem("hms_super_admin_token") || "";
                localStorage.setItem("hms_token", superToken);
                localStorage.removeItem("hms_super_admin_token");
                window.location.href = "/admin";
              }}
              className="shrink-0 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg font-bold transition-colors"
            >
              ← Повернутись до Super Admin
            </button>
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
