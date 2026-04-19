import { useGetGuideRoute } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Clock, MapPin, Activity, Footprints, Trees } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const difficultyLabel: Record<string, { label: string; cls: string }> = {
  easy: { label: "Легкий", cls: "text-green-700 bg-green-50 border-green-200" },
  medium: { label: "Середній", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  hard: { label: "Складний", cls: "text-red-700 bg-red-50 border-red-200" },
};

export default function RouteDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: route, isLoading } = useGetGuideRoute(Number(id));

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-6 py-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (!route) {
    return (
      <AppLayout>
        <div className="px-6 py-16 text-center">
          <p className="text-muted-foreground">Маршрут не знайдено</p>
          <Link href="/routes" className="text-primary text-sm mt-4 inline-block">Назад до маршрутів</Link>
        </div>
      </AppLayout>
    );
  }

  const points = route.points ?? [];
  const polylinePositions = points
    .filter((p: any) => p.location?.gpsLat && p.location?.gpsLng)
    .map((p: any) => [p.location.gpsLat, p.location.gpsLng] as [number, number]);

  const center: [number, number] = polylinePositions.length > 0
    ? polylinePositions[Math.floor(polylinePositions.length / 2)]
    : [50.5820, 30.4440];

  const diff = difficultyLabel[route.difficulty ?? "easy"];

  return (
    <AppLayout>
      <div className="pb-28">
        <div className="px-6 pt-8 pb-6 space-y-4">
          <Link href="/routes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Маршрути
          </Link>

          <div className="space-y-2">
            {route.moodTag && (
              <Badge className="bg-primary/10 text-primary border-none rounded-full font-medium">
                {route.moodTag}
              </Badge>
            )}
            <h1 className="text-3xl font-serif text-foreground leading-tight">{route.titleUa}</h1>
            {route.seasonality && (
              <p className="text-xs text-primary font-medium tracking-wide uppercase">{route.seasonality}</p>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              {route.durationMinutes} хв
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">
              <Footprints className="w-3.5 h-3.5" />
              {((route.distanceMeters ?? 0) / 1000).toFixed(1)} км
            </div>
            {diff && (
              <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${diff.cls}`}>
                <Activity className="w-3 h-3" />
                {diff.label}
              </div>
            )}
          </div>
        </div>

        {(route as any).imageUrl && (
          <div className="mx-6 mt-4 rounded-3xl overflow-hidden border border-border shadow-sm">
            <img
              src={(route as any).imageUrl}
              alt={route.titleUa}
              className="w-full object-cover max-h-64"
            />
          </div>
        )}

        {polylinePositions.length > 1 && (
          <div className="h-64 mx-6 rounded-3xl overflow-hidden border border-border shadow-sm">
            <MapContainer center={center} zoom={15} zoomControl={false} className="w-full h-full z-0">
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              <ZoomControl position="bottomright" />
              <Polyline positions={polylinePositions} pathOptions={{ color: "#3d6b4f", weight: 4, opacity: 0.85 }} />
              {points.map((pt, i) => pt.gpsLat && pt.gpsLng ? (
                <CircleMarker
                  key={i}
                  center={[pt.gpsLat, pt.gpsLng]}
                  radius={i === 0 || i === points.length - 1 ? 8 : 5}
                  pathOptions={{
                    color: "white",
                    fillColor: i === 0 ? "#3d6b4f" : i === points.length - 1 ? "#d97736" : "#7a6b8a",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-sm font-medium">{pt.titleUa || `Точка ${i + 1}`}</div>
                  </Popup>
                </CircleMarker>
              ) : null)}
            </MapContainer>
          </div>
        )}

        <div className="px-6 py-6 space-y-6">
          {route.descriptionUa && (
            <Card className="rounded-2xl border-border shadow-none">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Опис</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{route.descriptionUa}</p>
              </CardContent>
            </Card>
          )}

          {points.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-serif text-foreground">Зупинки маршруту</h2>
              {points.map((pt: any, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {pt.location?.titleUa || `Точка ${i + 1}`}
                    </h3>
                    {pt.location?.shortDescUa && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{pt.location.shortDescUa}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {route.tipsUa && (
            <Card className="bg-primary/5 border-primary/20 rounded-2xl shadow-none">
              <CardContent className="p-5">
                <div className="flex gap-3 items-start">
                  <Trees className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">Поради</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{route.tipsUa}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <style>{`
        .leaflet-popup-content-wrapper {
          border-radius: 0.75rem;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          background: hsl(var(--card));
          color: hsl(var(--card-foreground));
          border: 1px solid hsl(var(--border));
        }
        .leaflet-popup-tip { background: hsl(var(--card)); }
        .leaflet-popup-content { margin: 10px 14px; }
      `}</style>
    </AppLayout>
  );
}
