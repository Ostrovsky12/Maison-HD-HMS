import { useGetGuideLocation, useListGuideCategories } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, MapPin, Leaf, Info } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const categoryColors: Record<string, string> = {
  trees: "#3d6b4f",
  mushrooms: "#d97736",
  birds: "#5c9ab5",
  water: "#2b7a78",
  monuments: "#8b5a2b",
  routes: "#7a6b8a",
};

export default function LocationDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: location, isLoading } = useGetGuideLocation(Number(id));
  const { data: categories } = useListGuideCategories();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-6 py-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (!location) {
    return (
      <AppLayout>
        <div className="px-6 py-16 text-center">
          <p className="text-muted-foreground">Локацію не знайдено</p>
          <Link href="/map" className="text-primary text-sm mt-4 inline-block">Назад до карти</Link>
        </div>
      </AppLayout>
    );
  }

  const category = categories?.find(c => c.id === location.categoryId);
  const hexColor = categoryColors[category?.colorToken ?? ""] ?? "#3d6b4f";
  const hasCoords = Boolean(location.gpsLat && location.gpsLng);

  return (
    <AppLayout>
      <div className="pb-28">
        <div className="px-6 pt-8 pb-6 space-y-4">
          <Link href="/map" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Карта
          </Link>

          <div className="space-y-2">
            {category && (
              <Badge className="bg-primary/10 text-primary border-none rounded-full font-medium">
                {category.icon && <span className="mr-1">{category.icon}</span>}
                {category.nameUa}
              </Badge>
            )}
            <h1 className="text-3xl font-serif text-foreground leading-tight">{location.titleUa}</h1>
            {location.titleEn && (
              <p className="text-sm text-muted-foreground italic">{location.titleEn}</p>
            )}
          </div>

          {hasCoords && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              {location.gpsLat?.toFixed(5)}°N, {location.gpsLng?.toFixed(5)}°E
            </div>
          )}
        </div>

        {hasCoords && (
          <div className="h-56 mx-6 rounded-3xl overflow-hidden border border-border shadow-sm">
            <MapContainer
              center={[location.gpsLat!, location.gpsLng!]}
              zoom={16}
              zoomControl={false}
              className="w-full h-full z-0"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              <ZoomControl position="bottomright" />
              <CircleMarker
                center={[location.gpsLat!, location.gpsLng!]}
                radius={10}
                pathOptions={{ color: "white", fillColor: hexColor, fillOpacity: 1, weight: 3 }}
              />
            </MapContainer>
          </div>
        )}

        {location.imageUrl && (
          <div className="mx-6 mt-6 rounded-3xl overflow-hidden border border-border shadow-sm">
            <img src={location.imageUrl} alt={location.titleUa} className="w-full object-cover max-h-64" />
          </div>
        )}

        <div className="px-6 py-6 space-y-5">
          {location.descriptionUa && (
            <Card className="rounded-2xl border-border shadow-none">
              <CardContent className="p-5">
                <div className="flex gap-3 items-start">
                  <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground mb-2">Опис</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">{location.descriptionUa}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {location.natureNoteUa && (
            <Card className="bg-primary/5 border-primary/20 rounded-2xl shadow-none">
              <CardContent className="p-5">
                <div className="flex gap-3 items-start">
                  <Leaf className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">Природна особливість</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{location.natureNoteUa}</p>
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
