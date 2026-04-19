import { useState } from "react";
import { useGetGuideAdminStats } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, MapPin, Route, Tag, Lock } from "lucide-react";

const ADMIN_PASSWORD = "dogoda2026";
const STORAGE_KEY = "guide_admin_auth";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | undefined; icon: React.ElementType; color: string }) {
  return (
    <Card className="rounded-2xl border-border shadow-none">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          {value !== undefined ? (
            <p className="text-2xl font-bold text-foreground">{value}</p>
          ) : (
            <Skeleton className="h-7 w-12 mt-1" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const { data: stats } = useGetGuideAdminStats();

  return (
    <div className="px-6 py-8 pb-28 space-y-8 animate-in fade-in duration-500">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-serif text-foreground">Адмін-панель</h1>
        </div>
        <p className="text-xs text-muted-foreground">DOGODA Гостьовий гід — управління контентом</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Статистика</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Локацій" value={stats?.locationCount} icon={MapPin} color="bg-primary/10 text-primary" />
          <StatCard label="Маршрутів" value={stats?.routeCount} icon={Route} color="bg-amber-100 text-amber-700" />
          <StatCard label="Категорій" value={stats?.categoryCount} icon={Tag} color="bg-sky-100 text-sky-700" />
          <StatCard label="Точок маршруту" value={stats?.routePointCount} icon={MapPin} color="bg-emerald-100 text-emerald-700" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Останні локації</h2>
        {stats?.recentLocations ? (
          <div className="space-y-2">
            {stats.recentLocations.map((loc: any) => (
              <Card key={loc.id} className="rounded-xl border-border shadow-none">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{loc.titleUa}</p>
                    <p className="text-xs text-muted-foreground">{loc.shortDescUa}</p>
                  </div>
                  <Badge variant="outline" className="rounded-full text-xs shrink-0 ml-3">#{loc.id}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Управління контентом</h2>
        <Card className="rounded-2xl border-border bg-secondary/30 shadow-none">
          <CardContent className="p-5 space-y-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Повне управління локаціями, маршрутами та категоріями доступне через API або CMS-інтерфейс Maison HD.
            </p>
            <p className="text-xs text-muted-foreground">
              API: <span className="font-mono text-foreground">/api/guide/*</span>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "1");
      onSuccess();
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-8 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-serif text-foreground">Адмін</h1>
          <p className="text-sm text-muted-foreground">Введіть пароль для доступу</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Пароль"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(false); }}
            className={`h-12 rounded-2xl text-center text-base ${error ? "border-red-400 focus-visible:ring-red-300" : ""}`}
            autoFocus
          />
          {error && <p className="text-xs text-red-500 text-center">Невірний пароль</p>}
          <Button type="submit" className="w-full h-12 rounded-2xl text-base font-medium">
            Увійти
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  if (!authed) {
    return <LoginGate onSuccess={() => setAuthed(true)} />;
  }

  return (
    <AppLayout>
      <AdminDashboard />
    </AppLayout>
  );
}
