import { useGetGuideHome, useListGuideCategories } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { MapPin, Clock, ArrowRight, Leaf } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

export default function Home() {
  const { data: homeData, isLoading } = useGetGuideHome();
  const { data: categories } = useListGuideCategories();

  return (
    <AppLayout>
      <div className="px-6 py-8 pb-24 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-both">
        <header className="space-y-3">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs px-3 py-1 font-medium tracking-wide rounded-full">
            DOGODA Guest Guide
          </Badge>
          <h1 className="text-3xl font-serif text-foreground leading-tight">
            Досліджуйте <br />
            <span className="text-primary italic">природу DOGODA</span>
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-[90%]">
            Ваш особистий супутник у світі спокою, лісових стежок та прихованих куточків природи.
          </p>
        </header>

        {/* Seasonal Note */}
        <Card className="bg-secondary/50 border-secondary shadow-none rounded-2xl overflow-hidden">
          <CardContent className="p-5 flex gap-4 items-start">
            <div className="p-2 bg-background rounded-xl shadow-sm text-primary">
              <Leaf className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Весна у Дзвінковому</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ліс прокидається — ідеальний час для прогулянок та спостереження за перелітними птахами на Ірпені.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Best Route Now */}
        <section className="space-y-4">
          <h2 className="text-lg font-serif text-foreground flex items-center justify-between">
            <span>Ідеально для зараз</span>
            <Link href="/routes" className="text-xs font-sans font-medium text-primary hover:underline">
              Всі маршрути
            </Link>
          </h2>
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-3xl" />
          ) : homeData?.bestRouteNow ? (
            <Link href={`/routes/${homeData.bestRouteNow.id}`} className="block group">
              <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-sm hover:shadow-md transition-all duration-300">
                <div className="aspect-[2/1] bg-secondary relative overflow-hidden">
                  {(homeData.bestRouteNow as any).imageUrl && (
                    <img
                      src={(homeData.bestRouteNow as any).imageUrl}
                      alt={homeData.bestRouteNow.titleUa}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent z-10" />
                  <div className="absolute bottom-4 left-4 right-4 z-20 space-y-2">
                    <Badge className="bg-white/20 hover:bg-white/20 backdrop-blur-md text-white border-none rounded-full font-medium">
                      {homeData.bestRouteNow.moodTag || "Рекомендовано"}
                    </Badge>
                    <h3 className="text-white font-serif text-xl">{homeData.bestRouteNow.titleUa}</h3>
                    <div className="flex gap-3 text-white/80 text-xs font-medium">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {homeData.bestRouteNow.durationMinutes} хв</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {homeData.bestRouteNow.distanceMeters} м</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ) : (
             <div className="text-sm text-muted-foreground italic px-2">Немає рекомендацій</div>
          )}
        </section>

        {/* Featured Locations */}
        <section className="space-y-4">
          <h2 className="text-lg font-serif text-foreground">Цікаві локації</h2>
          {isLoading ? (
            <div className="flex gap-4 overflow-hidden">
              <Skeleton className="h-32 w-48 rounded-2xl shrink-0" />
              <Skeleton className="h-32 w-48 rounded-2xl shrink-0" />
            </div>
          ) : homeData?.featuredLocations && homeData.featuredLocations.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-6 px-6">
              {homeData.featuredLocations.map((location) => (
                <Link key={location.id} href={`/locations/${location.id}`} className="shrink-0 w-48 group">
                  <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-sm hover:shadow-md transition-all duration-300 h-full">
                    <div className="aspect-[4/3] bg-secondary relative">
                      {location.imageUrl ? (
                        <img src={location.imageUrl} alt={location.titleUa} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
                           <Leaf className="w-6 h-6 opacity-20" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3 space-y-1">
                      <h3 className="text-sm font-semibold text-foreground line-clamp-1">{location.titleUa}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {location.shortDescUa}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic px-2">Немає локацій</div>
          )}
        </section>

        {/* Categories / Quick Filters */}
        <section className="space-y-4">
          <h2 className="text-lg font-serif text-foreground">Що шукаєте?</h2>
          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-10 w-24 rounded-full" />
              <Skeleton className="h-10 w-32 rounded-full" />
              <Skeleton className="h-10 w-20 rounded-full" />
            </div>
          ) : categories ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Link key={cat.id} href={`/map?category=${cat.id}`} className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-full text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors shadow-sm">
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.nameUa}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}