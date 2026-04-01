import { useState } from "react";
import {
  useGetMe,
  useGetMyOrganization,
  useListProperties,
  useCreateProperty,
  useListUnits,
  useCreateUnit,
  useInviteOrganizationMember,
  getListPropertiesQueryKey,
  getListUnitsQueryKey,
  getListOrganizationMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Hotel, Users, Sparkles, Check, Loader2, Plus, Trash2, ArrowRight, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STEPS = [
  { id: 1, label: "Заклад", icon: Hotel },
  { id: 2, label: "Номери", icon: Sparkles },
  { id: 3, label: "Персонал", icon: Users },
  { id: 4, label: "Готово!", icon: Check },
];

interface RoomRow {
  number: string;
  category: string;
  capacity: number;
  price: number;
}

interface InviteRow {
  email: string;
  name: string;
  role: string;
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={`
            flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all
            ${step > s.id ? "bg-primary border-primary text-primary-foreground" : step === s.id ? "border-primary text-primary bg-primary/10" : "border-muted text-muted-foreground bg-background"}
          `}>
            {step > s.id ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
          </div>
          <span className={`text-sm font-medium hidden sm:block ${step >= s.id ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 ${step > s.id ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function StepProperty({ propertyId, onComplete }: { propertyId: number | null; onComplete: (id: number) => void }) {
  const queryClient = useQueryClient();
  const { data: org } = useGetMyOrganization();
  const createMutation = useCreateProperty();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: org?.name || "",
    address: org?.address || "",
    phone: org?.phone || "",
    email: org?.email || "",
    checkinTime: "14:00",
    checkoutTime: "12:00",
    type: "hotel",
  });
  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = () => {
    createMutation.mutate(
      { data: { name: form.name, type: form.type as any, address: form.address || undefined, description: form.phone || undefined } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          toast({ title: "Заклад налаштовано!" });
          onComplete(data.id);
        },
        onError: () => toast({ title: "Помилка", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border p-8">
      <h2 className="text-xl font-semibold mb-1">Інформація про заклад</h2>
      <p className="text-sm text-muted-foreground mb-6">Базові дані вашого готелю або комплексу</p>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Назва *</Label>
          <Input placeholder="Заміський комплекс Dogoda" value={form.name} onChange={upd("name")} />
        </div>
        <div className="space-y-1.5">
          <Label>Тип закладу</Label>
          <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hotel">Готель</SelectItem>
              <SelectItem value="house">Заміський будинок</SelectItem>
              <SelectItem value="spa">СПА-комплекс</SelectItem>
              <SelectItem value="bungalow">Бунгало</SelectItem>
              <SelectItem value="other">Інше</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Телефон</Label>
            <Input placeholder="+380 67 123 45 67" value={form.phone} onChange={upd("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="info@dogoda.com.ua" value={form.email} onChange={upd("email")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Адреса</Label>
          <Input placeholder="Київська обл., с. Догода, вул. Лісова, 1" value={form.address} onChange={upd("address")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Час заїзду</Label>
            <Input type="time" value={form.checkinTime} onChange={upd("checkinTime")} />
          </div>
          <div className="space-y-1.5">
            <Label>Час виїзду</Label>
            <Input type="time" value={form.checkoutTime} onChange={upd("checkoutTime")} />
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-6">
        <Button onClick={handleSubmit} disabled={createMutation.isPending || !form.name} className="gap-2">
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Продовжити <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StepRooms({ propertyId, onComplete }: { propertyId: number; onComplete: () => void }) {
  const queryClient = useQueryClient();
  const createMutation = useCreateUnit();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<RoomRow[]>([
    { number: "101", category: "standard", capacity: 2, price: 2500 },
    { number: "102", category: "standard", capacity: 2, price: 2500 },
    { number: "201", category: "suite", capacity: 4, price: 4500 },
    { number: "301", category: "cottage", capacity: 6, price: 8000 },
  ]);

  const updateRoom = (idx: number, key: keyof RoomRow, value: string | number) => {
    setRooms(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
  };

  const addRoom = () => setRooms(r => [...r, { number: `${r.length + 1}01`, category: "standard", capacity: 2, price: 2500 }]);
  const removeRoom = (idx: number) => setRooms(r => r.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      await Promise.all(
        rooms.map(room =>
          createMutation.mutateAsync({
            data: {
              propertyId,
              number: room.number,
              type: room.category as any,
              capacity: room.capacity,
              basePrice: String(room.price),
            },
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey() });
      toast({ title: `Додано ${rooms.length} номерів!` });
      onComplete();
    } catch {
      toast({ title: "Помилка збереження", variant: "destructive" });
    }
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border p-8">
      <h2 className="text-xl font-semibold mb-1">Номери та ціни</h2>
      <p className="text-sm text-muted-foreground mb-6">Додайте ваші номери, котеджі або бунгало</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="pb-2 text-left font-medium w-24">Номер</th>
              <th className="pb-2 text-left font-medium w-36">Категорія</th>
              <th className="pb-2 text-left font-medium w-24">Місця</th>
              <th className="pb-2 text-left font-medium w-32">Ціна ₴/ніч</th>
              <th className="pb-2 w-8" />
            </tr>
          </thead>
          <tbody className="space-y-1">
            {rooms.map((room, idx) => (
              <tr key={idx} className="border-b border-muted/30">
                <td className="py-1.5 pr-2">
                  <Input
                    className="h-8 text-sm"
                    value={room.number}
                    onChange={e => updateRoom(idx, "number", e.target.value)}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Select value={room.category} onValueChange={v => updateRoom(idx, "category", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Стандарт</SelectItem>
                      <SelectItem value="suite">Люкс</SelectItem>
                      <SelectItem value="cottage">Котедж</SelectItem>
                      <SelectItem value="bungalow">Бунгало</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    min={1}
                    value={room.capacity}
                    onChange={e => updateRoom(idx, "capacity", parseInt(e.target.value) || 1)}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    min={0}
                    value={room.price}
                    onChange={e => updateRoom(idx, "price", parseInt(e.target.value) || 0)}
                  />
                </td>
                <td className="py-1.5">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => removeRoom(idx)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={addRoom}>
        <Plus className="w-3.5 h-3.5" /> Додати рядок
      </Button>

      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={onComplete}>Пропустити</Button>
        <Button onClick={handleSave} disabled={createMutation.isPending || rooms.length === 0} className="gap-2">
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Зберегти номери <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StepInviteStaff({ orgId, onComplete }: { orgId: number; onComplete: () => void }) {
  const queryClient = useQueryClient();
  const inviteMutation = useInviteOrganizationMember();
  const { toast } = useToast();
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", name: "", role: "reception" },
  ]);

  const updateInvite = (idx: number, key: keyof InviteRow, value: string) => {
    setInvites(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
  };

  const addRow = () => setInvites(r => [...r, { email: "", name: "", role: "reception" }]);
  const removeRow = (idx: number) => setInvites(r => r.filter((_, i) => i !== idx));

  const handleSend = async () => {
    const valid = invites.filter(i => i.email && i.name);
    if (valid.length === 0) { onComplete(); return; }
    try {
      await Promise.all(
        valid.map(invite =>
          inviteMutation.mutateAsync({
            orgId,
            data: { email: invite.email, name: invite.name, role: invite.role as any },
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: getListOrganizationMembersQueryKey(orgId) });
      toast({ title: `Запрошено ${valid.length} співробітників!` });
      onComplete();
    } catch {
      toast({ title: "Помилка надсилання запрошень", variant: "destructive" });
    }
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border p-8">
      <h2 className="text-xl font-semibold mb-1">Запросити співробітників</h2>
      <p className="text-sm text-muted-foreground mb-6">Ваш персонал отримає доступ до системи</p>

      <div className="space-y-3">
        {invites.map((invite, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-3">
            <Input
              placeholder="Email"
              value={invite.email}
              onChange={e => updateInvite(idx, "email", e.target.value)}
            />
            <Input
              placeholder="ПІБ"
              value={invite.name}
              onChange={e => updateInvite(idx, "name", e.target.value)}
            />
            <div className="flex gap-2">
              <Select value={invite.role} onValueChange={v => updateInvite(idx, "role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reception">Адміністратор рецепції</SelectItem>
                  <SelectItem value="housekeeper">Покоївка</SelectItem>
                  <SelectItem value="accountant">Бухгалтер</SelectItem>
                  <SelectItem value="admin">Адміністратор</SelectItem>
                </SelectContent>
              </Select>
              {invites.length > 1 && (
                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-red-500 flex-shrink-0" onClick={() => removeRow(idx)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={addRow}>
        <Plus className="w-3.5 h-3.5" /> Додати ще
      </Button>

      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={onComplete}>Пропустити</Button>
        <Button onClick={handleSend} disabled={inviteMutation.isPending} className="gap-2">
          {inviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Надіслати запрошення <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StepDone() {
  const [, navigate] = useLocation();
  return (
    <div className="bg-card rounded-2xl shadow-sm border p-12 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
        <Check className="w-10 h-10 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Готово!</h2>
      <p className="text-muted-foreground mb-8">Ваш заклад налаштовано. Можете починати приймати бронювання!</p>
      <Button
        size="lg"
        className="gap-2"
        onClick={() => navigate(`~${BASE}/dashboard`)}
      >
        Перейти до дашборду <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const { data: user } = useGetMe();
  const { data: org } = useGetMyOrganization();
  const { data: properties } = useListProperties();
  const [, navigate] = useLocation();

  const hasProperty = (properties || []).length > 0;

  if (hasProperty && step === 1) {
    navigate(`~${BASE}/dashboard`);
    return null;
  }

  const orgId = user?.organizationId || 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      <div className="flex items-center gap-3 p-6 border-b bg-background">
        <div className="bg-primary text-primary-foreground p-2 rounded-lg">
          <Hotel className="w-5 h-5" />
        </div>
        <div>
          <p className="font-bold text-lg">Maison HD</p>
          <p className="text-xs text-muted-foreground">{org?.name || "Налаштування закладу"}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">Вітаємо в Maison HD!</h1>
            <p className="text-muted-foreground mt-2">Налаштуємо ваш заклад за кілька хвилин</p>
          </div>

          <StepIndicator step={step} />

          {step === 1 && (
            <StepProperty propertyId={propertyId} onComplete={(id) => { setPropertyId(id); setStep(2); }} />
          )}
          {step === 2 && propertyId && (
            <StepRooms propertyId={propertyId} onComplete={() => setStep(3)} />
          )}
          {step === 3 && (
            <StepInviteStaff orgId={orgId} onComplete={() => setStep(4)} />
          )}
          {step === 4 && <StepDone />}
        </div>
      </div>
    </div>
  );
}
