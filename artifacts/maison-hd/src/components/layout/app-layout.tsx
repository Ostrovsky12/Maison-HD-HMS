import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  CalendarDays, 
  KeyRound, 
  Users, 
  Sparkles, 
  BarChart3, 
  Settings,
  LogOut,
  Building
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ReactNode } from "react";

const navItems = [
  { name: "Головна", path: "/dashboard", icon: LayoutDashboard },
  { name: "Бронювання", path: "/bookings", icon: CalendarDays },
  { name: "Номери", path: "/units", icon: KeyRound },
  { name: "Гості", path: "/guests", icon: Users },
  { name: "Прибирання", path: "/housekeeping", icon: Sparkles },
  { name: "Звіти", path: "/reports", icon: BarChart3 },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { toast } = useToast();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("hms_token");
        setLocation("/login");
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
          {navItems.map((item) => {
            const isActive = location.startsWith(item.path);
            const Icon = item.icon;
            
            return (
              <Link key={item.path} href={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}>
                <Icon className="w-4 h-4" />
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border/50 space-y-2">
          <Link href="/settings" className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
            location.startsWith("/settings") 
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          }`}>
            <Settings className="w-4 h-4" />
            <span className="text-sm">Налаштування</span>
          </Link>
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
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <Building className="w-4 h-4" />
            </div>
            <h1 className="font-bold text-lg">Maison HD</h1>
          </div>
          {/* Mobile menu button would go here */}
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
