import { Link, useLocation } from "wouter";
import { Compass, Map as MapIcon, Route, Leaf, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Головна", icon: Compass },
    { href: "/map", label: "Карта", icon: MapIcon },
    { href: "/routes", label: "Маршрути", icon: Route },
    { href: "/nature", label: "Природа", icon: Leaf },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground max-w-md mx-auto relative shadow-2xl overflow-hidden">
      <main className="flex-1 overflow-y-auto pb-20 no-scrollbar">
        {children}
      </main>

      <nav className="absolute bottom-0 w-full bg-background/90 backdrop-blur-md border-t border-border px-6 py-3 pb-safe">
        <div className="flex justify-between items-center">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 min-w-[60px]">
                <div
                  className={cn(
                    "p-2 rounded-2xl transition-all duration-300",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium tracking-wide transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}