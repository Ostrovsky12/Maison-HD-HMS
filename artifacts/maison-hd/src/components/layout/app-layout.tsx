import { useLocation } from "wouter";
import { 
  LayoutDashboard, 
  CalendarDays, 
  KeyRound, 
  Users, 
  Sparkles, 
  BarChart3, 
  Settings,
  LogOut,
  Building,
  Grid3X3,
  Bell,
  CheckCheck,
  X,
  FileText,
  TrendingUp,
  Plug,
  Crown,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLogout, useGetMe, useListNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ReactNode, useState, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { uk } from "date-fns/locale";

const allNavItems = [
  { name: "Головна", path: "/dashboard", icon: LayoutDashboard, roles: null },
  { name: "Бронювання", path: "/bookings", icon: CalendarDays, roles: null },
  { name: "Шахматка", path: "/chess", icon: Grid3X3, roles: null },
  { name: "Номери", path: "/units", icon: KeyRound, roles: null },
  { name: "Гості", path: "/guests", icon: Users, roles: null },
  { name: "Прибирання", path: "/housekeeping", icon: Sparkles, roles: null },
  { name: "Рахунки", path: "/invoices", icon: FileText, roles: null },
  { name: "Звіти", path: "/reports", icon: BarChart3, roles: null },
  { name: "Аналітика", path: "/analytics", icon: TrendingUp, roles: ["super_admin", "owner", "manager"] },
  { name: "Інтеграції", path: "/integrations", icon: Plug, roles: ["super_admin", "owner", "manager"] },
  { name: "Підписка", path: "/subscription", icon: CreditCard, roles: ["owner", "super_admin"] },
  { name: "Super Admin", path: "/admin", icon: Crown, roles: ["super_admin"] },
];

const NOTIF_TYPE_COLORS: Record<string, string> = {
  booking_created: "bg-blue-100 text-blue-700",
  checkin: "bg-green-100 text-green-700",
  checkout: "bg-amber-100 text-amber-700",
  cancellation: "bg-red-100 text-red-700",
  alert: "bg-orange-100 text-orange-700",
  housekeeping: "bg-purple-100 text-purple-700",
  report: "bg-gray-100 text-gray-700",
};

const NOTIF_TYPE_LABELS: Record<string, string> = {
  booking_created: "Бронювання",
  checkin: "Заселення",
  checkout: "Виселення",
  cancellation: "Скасування",
  alert: "Увага",
  housekeeping: "Прибирання",
  report: "Звіт",
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
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleMarkAll = () => {
    markAll.mutate(undefined, { onSuccess: () => refetch() });
  };

  const handleMarkOne = (id: number) => {
    markOne.mutate({ notificationId: id }, { onSuccess: () => refetch() });
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold text-sm">Сповіщення</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleMarkAll}
                >
                  <CheckCheck className="w-3 h-3 mr-1" />
                  Всі прочитано
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Немає сповіщень
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-accent/50 transition-colors ${!n.isRead ? "bg-blue-50/50" : ""}`}
                  onClick={() => !n.isRead && handleMarkOne(n.id)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${NOTIF_TYPE_COLORS[n.type] || "bg-gray-100 text-gray-700"}`}>
                          {NOTIF_TYPE_LABELS[n.type] || n.type}
                        </span>
                        {!n.isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: uk })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("hms_token");
        navigate(`~${BASE}/login`);
      },
      onError: () => {
        toast({
          title: "Помилка",
          description: "Не вдалося вийти з системи",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border/50">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground p-2 rounded-md">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">Maison HD</h1>
            <p className="text-xs text-sidebar-foreground/60">Cockpit</p>
          </div>
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {allNavItems
            .filter(item => !item.roles || item.roles.includes(user?.role || ""))
            .map((item) => {
              const isActive = location.startsWith(item.path);
              const Icon = item.icon;
              const isAdmin = item.path === "/admin";
              return (
                <a
                  key={item.path}
                  href={`${BASE}${item.path}`}
                  onClick={(e) => { e.preventDefault(); navigate(`~${BASE}${item.path}`); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                      : isAdmin
                        ? "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{item.name}</span>
                </a>
              );
            })}
        </nav>

        <div className="p-4 border-t border-sidebar-border/50 space-y-2">
          <a
            href={`${BASE}/settings`}
            onClick={(e) => { e.preventDefault(); navigate(`~${BASE}/settings`); }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
              location.startsWith("/settings") 
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm">Налаштування</span>
          </a>
          <div 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Вийти</span>
          </div>
          <div className="px-3 pt-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-accent-foreground uppercase">
                {user?.name?.[0] || "U"}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">{user?.name || "Користувач"}</p>
                <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Top Header (desktop) — notification bell lives here */}
        <header className="hidden md:flex items-center justify-end px-6 py-3 border-b bg-card/50 backdrop-blur-sm gap-2">
          <NotificationBell />
        </header>

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <Building className="w-4 h-4" />
            </div>
            <h1 className="font-bold text-lg">Maison HD</h1>
          </div>
          <NotificationBell />
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
