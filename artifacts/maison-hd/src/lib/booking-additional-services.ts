import type { BookingAdditionalService } from "@workspace/api-client-react";

export const SERVICE_REQUEST_NOTICE = "Це побажання, а не підтверджена послуга. Наявність та можливу доплату підтвердить адміністратор. Онлайн-сума не змінюється.";

export function normalizeAdditionalServices(value: unknown): BookingAdditionalService[] {
  if (value === undefined) return [
    { id: "pet", name: "З твариною", description: "", enabled: true },
    { id: "baby-cot", name: "Дитяче ліжко", description: "", enabled: true },
  ];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BookingAdditionalService =>
    !!item && typeof item.id === "string" && typeof item.name === "string"
    && typeof item.description === "string" && typeof item.enabled === "boolean").slice(0, 10);
}

// Capture names in the existing free-text snapshot: later catalogue edits must
// not change a submitted request or the idempotency key of that submission.
export function serviceRequestText(services: BookingAdditionalService[], selected: string[], notes: string): string {
  const names = services.filter(item => item.enabled && selected.includes(item.id)).map(item => item.name.trim());
  return [names.length ? `Додаткові побажання: ${names.join("; ")}.` : "", notes.trim()].filter(Boolean).join("\n");
}
