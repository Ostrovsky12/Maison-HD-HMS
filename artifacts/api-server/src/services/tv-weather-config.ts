export type WeatherConfig = { location?: string; latitude?: number; longitude?: number };
type ScreenConfig = { weatherMode?: "inherit" | "override"; weather?: WeatherConfig };

export function hasWeatherConfig(weather?: WeatherConfig) {
  return Boolean(weather?.location?.trim()
    || (weather?.latitude != null && String(weather.latitude).trim() !== ""
      && weather?.longitude != null && String(weather.longitude).trim() !== ""));
}

// Configured legacy screens keep their location. Empty legacy screens inherit.
export function weatherMode(config?: ScreenConfig | null): "inherit" | "override" {
  return config?.weatherMode ?? (hasWeatherConfig(config?.weather) ? "override" : "inherit");
}

export function effectiveWeather(config: ScreenConfig | null, propertyWeather?: WeatherConfig | null): WeatherConfig {
  return weatherMode(config) === "override" ? config?.weather || {} : propertyWeather || {};
}

// Accept numeric form strings, but never store partial or invalid coordinates.
export function parseWeatherConfig(input: unknown): WeatherConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Некоректна погодна локація");
  const value = input as Record<string, unknown>;
  if (value.location != null && typeof value.location !== "string") throw new Error("Назва локації має бути текстом");
  const location = (value.location as string | undefined)?.trim() || "";
  if (location.length > 255) throw new Error("Назва локації надто довга");
  const present = (v: unknown) => v != null && v !== "";
  const latPresent = present(value.latitude);
  const lonPresent = present(value.longitude);
  if (latPresent !== lonPresent) throw new Error("Вкажіть обидві координати або залиште обидва поля порожніми");
  if (!latPresent) return { location };
  if (![value.latitude, value.longitude].every(v => (typeof v === "number" || typeof v === "string") && String(v).trim() !== "")) {
    throw new Error("Некоректні координати");
  }
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Координати поза допустимими межами");
  return { location, latitude, longitude };
}
