import type { BookingAdditionalService } from "@workspace/api-zod";

// These are requests only: they never reserve stock or add bill charges.
export function bookingAdditionalServices(value: unknown): BookingAdditionalService[] {
  if (value === undefined) return [
    { id: "pet", name: "З твариною", description: "", enabled: true },
    { id: "baby-cot", name: "Дитяче ліжко", description: "", enabled: true },
  ];
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 10).flatMap(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string"
      || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || seen.has(item.id)
      || typeof item.name !== "string" || !item.name.trim()) return [];
    seen.add(item.id);
    return [{ id: item.id, name: item.name.trim().slice(0, 60),
      description: typeof item.description === "string" ? item.description.trim().slice(0, 300) : "",
      enabled: item.enabled === true }];
  });
}
