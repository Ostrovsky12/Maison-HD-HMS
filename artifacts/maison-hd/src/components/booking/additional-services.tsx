import type { BookingAdditionalService } from "@workspace/api-client-react";
import { SERVICE_REQUEST_NOTICE } from "@/lib/booking-additional-services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AdditionalServicesEditor({ value, onChange }: {
  value: BookingAdditionalService[]; onChange: (value: BookingAdditionalService[]) => void;
}) {
  const update = (id: string, patch: Partial<BookingAdditionalService>) =>
    onChange(value.map(item => item.id === id ? { ...item, ...patch } : item));
  return <div className="space-y-4" data-testid="additional-services-editor">
    <p className="text-sm text-stone-500">Гість обирає побажання. У Servio вони передаються як примітка, без нарахування вартості.</p>
    {value.length === 0 && <p className="text-sm text-stone-500">Побажання ще не додані. На сторінці бронювання цей блок приховано.</p>}
    {value.map((item, index) => <div key={item.id} className="space-y-3 rounded-xl border border-stone-200 p-4">
      <label className="block text-sm font-medium">Назва
        <Input aria-label={`Назва послуги ${index + 1}`} maxLength={60} required value={item.name} onChange={e => update(item.id, { name: e.target.value })} />
      </label>
      <label className="block text-sm font-medium">Опис
        <Textarea aria-label={`Опис послуги ${index + 1}`} maxLength={300} rows={2} value={item.description} onChange={e => update(item.id, { description: e.target.value })} />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={e => update(item.id, { enabled: e.target.checked })} />Показувати гостям</label>
        <Button type="button" variant="ghost" onClick={() => onChange(value.filter(row => row.id !== item.id))} aria-label={`Видалити ${item.name || "послугу"}`}>Видалити</Button>
      </div>
    </div>)}
    <Button type="button" variant="outline" disabled={value.length >= 10} onClick={() =>
      onChange([...value, { id: crypto.randomUUID(), name: "", description: "", enabled: true }])}>Додати побажання</Button>
    <p className="text-xs text-stone-500">До 10 опцій. Зміни набудуть чинності після збереження налаштувань.</p>
  </div>;
}

export function AdditionalServicesPicker({ services, selected, onChange, disabled = false, showNotice = true }: {
  services: BookingAdditionalService[]; selected: string[]; onChange: (selected: string[]) => void; disabled?: boolean; showNotice?: boolean;
}) {
  const available = services.filter(item => item.enabled);
  if (!available.length) return null;
  return <fieldset className="space-y-3" disabled={disabled} data-testid="additional-services-picker">
    <legend className="mb-2 text-sm font-medium">Додаткові побажання</legend>
    {available.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3">
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-current" checked={selected.includes(item.id)}
        onChange={e => onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />
      <span className="min-w-0 break-words"><span className="block text-sm font-medium">{item.name}</span>
        {item.description && <span className="mt-1 block text-xs text-stone-500">{item.description}</span>}</span>
    </label>)}
    {showNotice && <p className="text-xs leading-relaxed text-stone-500">{SERVICE_REQUEST_NOTICE}</p>}
  </fieldset>;
}
