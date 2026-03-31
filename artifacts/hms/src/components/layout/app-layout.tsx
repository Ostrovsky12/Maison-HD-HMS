import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, CalendarDays, Users, Bed, 
  Settings, LogOut, Moon, Sun, Wallet, 
  Sparkles, Hotel, ClipboardList, Download, BedDouble
} from "lucide-react";
import { useEffect, useState } from "react";

const ROLES_UA: Record<string, string> = {
  super_admin: "Супер адмін",
  owner: "Власник",
  manager: "Менеджер",
  reception: "Рецепція",
  housekeeping: "Прибирання",
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/chess", label: "Шахматка", icon: CalendarDays },
  { href: "/bookings", label: "Бронювання", icon: ClipboardList },
  { href: "/living", label: "Мешкаючі гості", icon: BedDouble },
  { href: "/guests", label: "Гості", icon: Users },
  { href: "/housekeeping", label: "Прибирання", icon: Sparkles },
  { href: "/units", label: "Юніти", icon: Bed },
  { href: "/rates", label: "Тарифи", icon: Wallet },
  { href: "/import", label: "Імпорт даних", icon: Download },
  { href: "/settings/organization", label: "Налаштування", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isLoading } = useAuth();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (isDark) document.documentElement.classList.remove('light');
    else document.documentElement.classList.add('light');
  }, [isDark]);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-sidebar-border bg-sidebar flex flex-col transition-all duration-300">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border/50">
          <Hotel className="w-6 h-6 text-primary mr-3" />
          <span className="font-display font-bold text-lg tracking-tight">Dogoda PMS</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <div className="px-2 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Меню</div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
                <Icon className={cn("w-5 h-5 mr-3 transition-transform group-hover:scale-110", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border/50">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-inner">
                {user?.name?.charAt(0) || 'К'}
              </div>
              <div className="text-sm">
                <div className="font-medium text-sidebar-foreground">{user?.name || 'Користувач'}</div>
                <div className="text-xs text-sidebar-foreground/50">{ROLES_UA[user?.role || ''] || user?.role}</div>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <button 
              onClick={() => setIsDark(!isDark)}
              title={isDark ? "Світла тема" : "Темна тема"}
              className="flex-1 flex items-center justify-center py-2 rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button 
              onClick={logout}
              title="Вийти"
              className="flex-1 flex items-center justify-center py-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
