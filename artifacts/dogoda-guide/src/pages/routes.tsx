import { AppLayout } from "@/components/layout/AppLayout";
import { useListGuideRoutes } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Clock, MapPin, Activity, Filter } from "lucide-react";

export default function RoutesPage() {
  const { data: routes, isLoading } = useListGuideRoutes();

  return (
    <AppLayout>
      <div className="px-6 py-8 pb-24 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-serif text-foreground">Маршрути</h1>
          <p className="text-muted-foreground text-sm">
            Ретельно сплановані прогулянки для будь-якого настрою.
          </p>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <Badge variant="secondary" className="px-3 py-1.5 rounded-xl font-medium bg-primary/10 text-primary">Всі</Badge>
          <Badge variant="outline" className="px-3 py-1.5 rounded-xl font-medium text-muted-foreground">До 30 хв</Badge>
          <Badge variant="outline" className="px-3 py-1.5 rounded-xl font-medium text-muted-foreground">До 1 год</Badge>
          <Badge variant="outline" className="px-3 py-1.5 rounded-xl font-medium text-muted-foreground">Більше 1 год</Badge>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-3xl" />
            ))
          ) : routes?.map(route => (
            <Link key={route.id} href={`/routes/${route.id}`} className="block">
              <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-sm hover:shadow-md transition-all duration-300">
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary border-none rounded-full font-medium">
                      {route.moodTag || "Прогулянка"}
                    </Badge>
                    {route.difficulty === "easy" && (
                       <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Легкий</Badge>
                    )}
                    {route.difficulty === "medium" && (
                       <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Середній</Badge>
                    )}
                    {route.difficulty === "hard" && (
                       <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Складний</Badge>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-serif text-foreground leading-tight mb-1">{route.titleUa}</h3>
                    {route.seasonality && (
                      <p className="text-xs text-primary font-medium tracking-wide">{route.seasonality}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{route.durationMinutes} хв</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      <span>{route.distanceMeters} м</span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto text-primary">
                      <span>Деталі</span>
                      <ArrowRightIcon className="w-4 h-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {routes?.length === 0 && (
             <div className="text-center py-12 px-6">
                <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                  <RouteIcon className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-serif text-foreground mb-2">Немає маршрутів</h3>
                <p className="text-sm text-muted-foreground">Маршрути ще не додані або приховані.</p>
             </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function ArrowRightIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  )
}

function RouteIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>
    </svg>
  )
}