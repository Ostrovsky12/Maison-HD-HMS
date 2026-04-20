import { useEffect, useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListGuideLocations, useListGuideCategories } from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Leaf, Info, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DOGODA_CENTER: [number, number] = [50.2705, 30.0395];

const categoryColors: Record<string, string> = {
  trees: "#3d6b4f", // forest green
  mushrooms: "#d97736", // warm amber
  birds: "#5c9ab5", // sky blue
  water: "#2b7a78", // teal
  monuments: "#8b5a2b", // warm brown
  routes: "#7a6b8a", // muted purple
  activities: "#b5561b", // terracotta / horse chestnut
};

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

export default function MapPage() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const initialCategory = searchParams.get("category");
  
  const [selectedCategory, setSelectedCategory] = useState<number | null>(initialCategory ? Number(initialCategory) : null);
  const [showFilters, setShowFilters] = useState(false);
  const [, setLocation] = useLocation();

  const { data: locations, isLoading: isLocationsLoading } = useListGuideLocations(
    selectedCategory ? { categoryId: selectedCategory } : undefined
  );
  const { data: categories } = useListGuideCategories();

  return (
    <AppLayout>
      <div className="relative w-full h-[100dvh]">
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

           <Button 
              variant="secondary" 
              size="icon" 
              className="rounded-full shadow-lg pointer-events-auto bg-background/90 backdrop-blur-md border-border"
              onClick={() => setShowFilters(!showFilters)}
            >
             {showFilters ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
           </Button>
        </div>

        {/* Filters Overlay */}
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

        <MapContainer 
          center={DOGODA_CENTER} 
          zoom={15} 
          zoomControl={false}
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            // clean minimal map style
          />
          <ZoomControl position="bottomright" />
          <MapController center={DOGODA_CENTER} />

          {/* Dogoda Center Marker */}
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

          {locations?.map(location => {
            if (!location.gpsLat || !location.gpsLng) return null;
            
            // Try to match category color, fallback to primary
            const colorName = categories?.find(c => c.id === location.categoryId)?.colorToken || "trees";
            const hexColor = categoryColors[colorName] || "hsl(var(--primary))";

            return (
              <CircleMarker
                key={location.id}
                center={[location.gpsLat, location.gpsLng]}
                radius={6}
                pathOptions={{ color: "white", fillColor: hexColor, fillOpacity: 0.9, weight: 2 }}
              >
                <Popup className="dogoda-popup">
                  <div className="min-w-[180px] p-1">
                    {location.categoryNameUa && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block mb-1">
                        {location.categoryNameUa}
                      </span>
                    )}
                    <h3 className="font-serif font-bold text-foreground mb-1 leading-tight">{location.titleUa}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{location.shortDescUa}</p>
                    <Button 
                      size="sm" 
                      className="w-full h-8 text-xs rounded-xl"
                      onClick={(e) => {
                        e.preventDefault();
                        setLocation(`/locations/${location.id}`);
                      }}
                    >
                      Детальніше
                    </Button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        
        {/* Custom CSS for popup to match theme */}
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
  )
}