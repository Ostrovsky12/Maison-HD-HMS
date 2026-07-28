import { useEffect, useState, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListGuideLocations, useListGuideCategories } from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Filter, X, Navigation, Crosshair, Loader2 } from "lucide-react";

const DOGODA_CENTER: [number, number] = [50.2635, 30.0330];

const categoryColors: Record<string, string> = {
  trees: "#3d6b4f",
  mushrooms: "#d97736",
  birds: "#5c9ab5",
  water: "#2b7a78",
  monuments: "#8b5a2b",
  routes: "#7a6b8a",
  activities: "#b5561b",
};

function MapController({ flyTo }: { flyTo: [number, number] | null }) {
  const map = useMap();
  const prevFlyTo = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (flyTo && flyTo !== prevFlyTo.current) {
      prevFlyTo.current = flyTo;
      map.flyTo(flyTo, 16, { animate: true, duration: 1.2 });
    }
  }, [flyTo, map]);
  return null;
}

// Pulsing blue dot for user location
function UserLocationMarker({ position }: { position: [number, number] }) {
  return (
    <CircleMarker
      center={position}
      radius={10}
      pathOptions={{ color: "white", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }}
    >
      <CircleMarker
        center={position}
        radius={20}
        pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15, weight: 1 }}
      />
    </CircleMarker>
  );
}

function openGoogleMapsRoute(
  destLat: number,
  destLng: number,
  userLat?: number,
  userLng?: number
) {
  const origin = userLat && userLng ? `&origin=${userLat},${userLng}` : "";
  window.open(
    `https://www.google.com/maps/dir/?api=1${origin}&destination=${destLat},${destLng}&travelmode=walking`,
    "_blank"
  );
}

export default function MapPage() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const initialCategory = searchParams.get("category");

  const [selectedCategory, setSelectedCategory] = useState<number | null>(
    initialCategory ? Number(initialCategory) : null
  );
  const [showFilters, setShowFilters] = useState(false);
  const [, setLocation] = useLocation();

  // Geolocation state
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Start watching user position immediately
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPosition(coords);
        setFlyTo([...coords]);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const { data: locations } = useListGuideLocations(
    selectedCategory ? { categoryId: selectedCategory } : undefined
  );
  const { data: categories } = useListGuideCategories();

  return (
    <AppLayout>
      <div className="relative w-full h-[100dvh]">
        {/* Top bar */}
        <div className="absolute top-4 left-4 right-4 z-[400] flex justify-between items-start pointer-events-none">
          <Card className="bg-background/90 backdrop-blur-md border-border p-3 shadow-lg pointer-events-auto rounded-2xl inline-flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <MapPinIcon className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-serif font-bold text-foreground">DOGODA</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Гостьовий гід</p>
            </div>
          </Card>

          <div className="flex flex-col gap-2 pointer-events-auto">
            {/* Locate me button */}
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full shadow-lg bg-background/90 backdrop-blur-md border-border"
              onClick={handleLocateMe}
              title="Моє місцезнаходження"
            >
              {locating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Crosshair className="w-4 h-4" />
              }
            </Button>
            {/* Filter button */}
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full shadow-lg bg-background/90 backdrop-blur-md border-border"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && categories && (
          <div className="absolute top-20 right-4 w-48 bg-background/95 backdrop-blur-xl border border-border rounded-2xl p-3 shadow-xl z-[400] animate-in fade-in slide-in-from-top-4 space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Фільтри</h3>
            <button
              className={cn(
                "w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                selectedCategory === null ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-foreground"
              )}
              onClick={() => { setSelectedCategory(null); setShowFilters(false); }}
            >
              Всі локації
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2",
                  selectedCategory === cat.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-foreground"
                )}
                onClick={() => { setSelectedCategory(cat.id); setShowFilters(false); }}
              >
                {cat.icon && <span>{cat.icon}</span>}
                {cat.nameUa}
              </button>
            ))}
          </div>
        )}

        {/* User location status badge */}
        {userPosition && (
          <div className="absolute bottom-24 left-4 z-[400] pointer-events-none">
            <div className="bg-blue-500/10 backdrop-blur-md border border-blue-500/30 rounded-full px-3 py-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Ваше місце на карті</span>
            </div>
          </div>
        )}

        <MapContainer
          center={DOGODA_CENTER}
          zoom={15}
          zoomControl={false}
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <ZoomControl position="bottomright" />
          <MapController flyTo={flyTo} />

          {/* User location */}
          {userPosition && <UserLocationMarker position={userPosition} />}

          {/* DOGODA base marker */}
          <CircleMarker
            center={DOGODA_CENTER}
            radius={8}
            pathOptions={{ color: "#2c1f14", fillColor: "#f5f0e8", fillOpacity: 1, weight: 3 }}
          >
            <Popup className="dogoda-popup rounded-2xl">
              <div className="text-center py-1">
                <h3 className="font-serif font-bold text-foreground">DOGODA</h3>
                <p className="text-xs text-muted-foreground">Відпочинковий комплекс</p>
              </div>
            </Popup>
          </CircleMarker>

          {/* Location markers */}
          {locations?.map(location => {
            if (!location.gpsLat || !location.gpsLng) return null;
            const colorName = categories?.find(c => c.id === location.categoryId)?.colorToken || "trees";
            const hexColor = categoryColors[colorName] || "#3d6b4f";

            return (
              <CircleMarker
                key={location.id}
                center={[location.gpsLat, location.gpsLng]}
                radius={7}
                pathOptions={{ color: "white", fillColor: hexColor, fillOpacity: 0.95, weight: 2.5 }}
              >
                <Popup className="dogoda-popup" minWidth={200}>
                  <div className="p-1 space-y-2">
                    {location.categoryNameUa && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block">
                        {location.categoryNameUa}
                      </span>
                    )}
                    <h3 className="font-serif font-bold text-foreground leading-tight">{location.titleUa}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{location.shortDescUa}</p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs rounded-xl"
                        onClick={(e) => { e.preventDefault(); setLocation(`/locations/${location.id}`); }}
                      >
                        Детальніше
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 rounded-xl flex-shrink-0"
                        title="Маршрут від мого місця"
                        onClick={(e) => {
                          e.preventDefault();
                          openGoogleMapsRoute(
                            location.gpsLat!,
                            location.gpsLng!,
                            userPosition?.[0],
                            userPosition?.[1]
                          );
                        }}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        <style>{`
          .leaflet-popup-content-wrapper {
            border-radius: 1rem;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            background: hsl(var(--card));
            color: hsl(var(--card-foreground));
            border: 1px solid hsl(var(--border));
          }
          .leaflet-popup-tip {
            background: hsl(var(--card));
            border-top: 1px solid hsl(var(--border));
            border-left: 1px solid hsl(var(--border));
          }
          .leaflet-popup-content {
            margin: 12px;
          }
        `}</style>
      </div>
    </AppLayout>
  );
}

function MapPinIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
