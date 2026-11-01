import type { WeatherConfig } from "./tv-weather-config.js";

export type TvWeather = {
  status: "live" | "stale" | "unavailable";
  location: string;
  updatedAt: string | null;
  message?: string;
  current?: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    isDay: boolean;
    code: number;
    description: string;
    icon: string;
  };
  forecast: Array<{
    date: string;
    temperatureMax: number;
    temperatureMin: number;
    code: number;
    description: string;
    icon: string;
  }>;
};

type CachedWeather = {
  fetchedAt: number;
  weather: TvWeather;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map<string, CachedWeather>();

const weatherCode = (code: number, isDay = true) => {
  if (code === 0) return { description: "Ясно", icon: isDay ? "☀️" : "🌙" };
  if (code <= 2) return { description: "Мінлива хмарність", icon: isDay ? "🌤️" : "☁️" };
  if (code === 3) return { description: "Хмарно", icon: "☁️" };
  if (code === 45 || code === 48) return { description: "Туман", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { description: "Мряка", icon: "🌦️" };
  if (code >= 61 && code <= 67) return { description: "Дощ", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { description: "Сніг", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { description: "Злива", icon: "🌧️" };
  if (code >= 85 && code <= 86) return { description: "Снігопад", icon: "🌨️" };
  if (code >= 95) return { description: "Гроза", icon: "⛈️" };
  return { description: "Погодні умови", icon: "🌡️" };
};

async function fetchJson(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6_000) });
  if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
  return response.json() as Promise<any>;
}

async function resolveCoordinates(config: WeatherConfig) {
  const hasLatitude = config.latitude !== undefined && config.latitude !== null && String(config.latitude).trim() !== "";
  const hasLongitude = config.longitude !== undefined && config.longitude !== null && String(config.longitude).trim() !== "";
  const latitude = Number(config.latitude);
  const longitude = Number(config.longitude);
  if (hasLatitude && hasLongitude
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
    return { latitude, longitude, location: config.location?.trim() || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
  }

  const location = config.location?.trim();
  if (!location) return null;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "uk");
  url.searchParams.set("format", "json");
  const data = await fetchJson(url);
  const result = data.results?.[0];
  if (!result) throw new Error("Weather location was not found");
  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    location: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
  };
}

export async function getTvWeather(organizationId: number, config: WeatherConfig): Promise<TvWeather> {
  const configuredLocation = config.location?.trim() || "";
  const hasLatitude = config.latitude !== undefined && config.latitude !== null && String(config.latitude).trim() !== "";
  const hasLongitude = config.longitude !== undefined && config.longitude !== null && String(config.longitude).trim() !== "";
  const rawKey = `${configuredLocation}|${config.latitude ?? ""}|${config.longitude ?? ""}`;
  const cacheKey = `${organizationId}:${rawKey.toLowerCase()}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.weather;

  if (!configuredLocation && (!hasLatitude || !hasLongitude)) {
    return {
      status: "unavailable",
      location: "",
      updatedAt: null,
      message: "Локацію для погоди ще не налаштовано",
      forecast: [],
    };
  }

  try {
    const coordinates = await resolveCoordinates(config);
    if (!coordinates) throw new Error("Weather location is incomplete");

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(coordinates.latitude));
    url.searchParams.set("longitude", String(coordinates.longitude));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("forecast_days", "3");
    url.searchParams.set("timezone", "auto");
    const data = await fetchJson(url);
    const currentCode = Number(data.current?.weather_code);
    const currentLabel = weatherCode(currentCode, data.current?.is_day === 1);
    if (!Number.isFinite(Number(data.current?.temperature_2m))) throw new Error("Weather response is incomplete");

    const weather: TvWeather = {
      status: "live",
      location: coordinates.location,
      updatedAt: new Date().toISOString(),
      current: {
        temperature: Number(data.current.temperature_2m),
        apparentTemperature: Number(data.current.apparent_temperature),
        humidity: Number(data.current.relative_humidity_2m),
        windSpeed: Number(data.current.wind_speed_10m),
        isDay: data.current.is_day === 1,
        code: currentCode,
        description: currentLabel.description,
        icon: currentLabel.icon,
      },
      forecast: (data.daily?.time || []).slice(0, 3).map((date: string, index: number) => {
        const code = Number(data.daily.weather_code[index]);
        const label = weatherCode(code);
        return {
          date,
          temperatureMax: Number(data.daily.temperature_2m_max[index]),
          temperatureMin: Number(data.daily.temperature_2m_min[index]),
          code,
          description: label.description,
          icon: label.icon,
        };
      }),
    };
    weatherCache.set(cacheKey, { fetchedAt: Date.now(), weather });
    return weather;
  } catch {
    if (cached) {
      return {
        ...cached.weather,
        status: "stale",
        message: "Погодне джерело тимчасово недоступне. Показано останні отримані дані.",
      };
    }
    return {
      status: "unavailable",
      location: configuredLocation,
      updatedAt: null,
      message: "Погодні дані тимчасово недоступні",
      forecast: [],
    };
  }
}