import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetMe } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import {
  Building2, Plus, Trash2, Pencil, Check, X, Percent, Star, ShieldCheck,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token");
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmt = (n: number) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(n);

// ── Legal Entities Tab ───────────────────────────────────────────
function LegalEntitiesTab() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: entities = [], isLoading } = useQuery<any[]>({
    queryKey: ["legal-entities"],
    queryFn: async () => {
      const r = await authFetch(`${API}/legal-entities`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const save = async (isNew: boolean) => {
    const url = isNew ? `${API}/legal-entities` : `${API}/legal-entities/${editId}`;
    const method = isNew ? "POST" : "PATCH";
    const r = await authFetch(url, { method, body: JSON.stringify(form) });
    if (!r.ok) {
      const e = await r.json();
      toast({ title: "Помилка", description: e.error, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["legal-entities"] });
    setShowAdd(false);
    setEditId(null);
    setForm({});
    toast({ title: isNew ? "Юридичну особу додано" : "Оновлено" });
  };

  const remove = async (id: number) => {
    if (!confirm("Видалити юридичну особу?")) return;
    await authFetch(`${API}/legal-entities/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["legal-entities"] });
    toast({ title: "Видалено" });
  };

  const setDefault = async (id: number) => {
    await authFetch(`${API}/legal-entities/${id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) });
    qc.invalidateQueries({ queryKey: ["legal-entities"] });
    toast({ title: "Встановлено як основну" });
  };

  const fv = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const renderForm = (isNew: boolean) => (
    <div className="border rounded-xl p-5 space-y-4 mt-3 bg-muted/10">
      <h4 className="font-semibold">{isNew ? "Нова юридична особа" : "Редагування"}</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Назва організації</Label>
          <Input placeholder='ТОВ "Готель Плюс"' value={form.name || ""} onChange={e => fv("name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Тип</Label>
          <Select value={form.type || "tov"} onValueChange={v => fv("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tov">ТОВ</SelectItem>
              <SelectItem value="fop">ФОП</SelectItem>
              <SelectItem value="pp">ПП</SelectItem>
              <SelectItem value="at">АТ</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">ЄДРПОУ</Label>
          <Input placeholder="12345678" value={form.edrpou || ""} onChange={e => fv("edrpou", e.target.value)} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">IBAN</Label>
          <Input placeholder="UA21300000000000000000000000" value={form.iban || ""} onChange={e => fv("iban", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Банк</Label>
          <Input placeholder="ПриватБанк" value={form.bank || ""} onChange={e => fv("bank", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">МФО</Label>
          <Input placeholder="305299" value={form.mfo || ""} onChange={e => fv("mfo", e.target.value)} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Адреса</Label>
          <Input placeholder="м. Київ, вул. Хрещатик 1" value={form.address || ""} onChange={e => fv("address", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">LiqPay Public Key</Label>
          <Input placeholder="sandbox_..." value={form.liqpayPublicKey || ""} onChange={e => fv("liqpayPublicKey", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">LiqPay Private Key</Label>
          <Input type="password" placeholder="••••••••" value={form.liqpayPrivateKey || ""} onChange={e => fv("liqpayPrivateKey", e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setEditId(null); setForm({}); }}>
          <X className="h-3.5 w-3.5 mr-1" /> Скасувати
        </Button>
        <Button size="sm" onClick={() => save(isNew)}>
          <Check className="h-3.5 w-3.5 mr-1" /> Зберегти
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Юридичні особи</h3>
          <p className="text-sm text-muted-foreground">Для формування рахунків та платіжних посилань</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setShowAdd(true); setForm({ type: "tov" }); }}>
          <Plus className="h-3.5 w-3.5" /> Додати
        </Button>
      </div>

      {showAdd && renderForm(true)}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження...</p>
      ) : entities.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-8 text-center text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Юридичні особи ще не додані</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entities.map((e: any) => (
            <div key={e.id}>
              {editId === e.id ? renderForm(false) : (
                <div className="rounded-xl border p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{e.name}</span>
                        <Badge variant="outline" className="text-xs">{e.type?.toUpperCase()}</Badge>
                        {e.isDefault && <Badge className="text-xs gap-1"><Star className="h-3 w-3" /> Основна</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                        {e.edrpou && <p>ЄДРПОУ: {e.edrpou}</p>}
                        {e.iban && <p>IBAN: {e.iban}</p>}
                        {e.bank && <p>Банк: {e.bank}</p>}
                        {e.liqpayPublicKey && (
                          <p className="flex items-center gap-1 text-emerald-600">
                            <ShieldCheck className="h-3 w-3" /> LiqPay підключено
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {!e.isDefault && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDefault(e.id)}>
                          <Star className="h-3 w-3 mr-1" /> Основна
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                        setEditId(e.id);
                        setForm({ name: e.name, type: e.type, edrpou: e.edrpou, iban: e.iban, bank: e.bank, mfo: e.mfo, address: e.address, liqpayPublicKey: e.liqpayPublicKey });
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => remove(e.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Discount Types Tab ───────────────────────────────────────────
function DiscountTypesTab() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<any>({ valueType: "percent", value: 10 });

  const { data: discounts = [], isLoading } = useQuery<any[]>({
    queryKey: ["discount-types"],
    queryFn: async () => {
      const r = await authFetch(`${API}/discount-types`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const save = async (isNew: boolean) => {
    const url = isNew ? `${API}/discount-types` : `${API}/discount-types/${editId}`;
    const method = isNew ? "POST" : "PATCH";
    const r = await authFetch(url, { method, body: JSON.stringify(form) });
    if (!r.ok) {
      const e = await r.json();
      toast({ title: "Помилка", description: e.error, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["discount-types"] });
    setShowAdd(false);
    setEditId(null);
    setForm({ valueType: "percent", value: 10 });
    toast({ title: isNew ? "Тип знижки додано" : "Оновлено" });
  };

  const remove = async (id: number) => {
    if (!confirm("Видалити тип знижки?")) return;
    await authFetch(`${API}/discount-types/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["discount-types"] });
    toast({ title: "Видалено" });
  };

  const fv = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const renderForm = (isNew: boolean) => (
    <div className="border rounded-xl p-5 space-y-4 mt-3 bg-muted/10">
      <h4 className="font-semibold">{isNew ? "Новий тип знижки" : "Редагування"}</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Назва знижки</Label>
          <Input placeholder='День народження' value={form.name || ""} onChange={e => fv("name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Код (латиниця)</Label>
          <Input placeholder="birthday" value={form.code || ""} onChange={e => fv("code", e.target.value.toLowerCase().replace(/\s+/g, "_"))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Тип значення</Label>
          <Select value={form.valueType || "percent"} onValueChange={v => fv("valueType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Відсоток (%)</SelectItem>
              <SelectItem value="fixed">Фіксована сума (₴)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Розмір знижки ({form.valueType === "percent" ? "%" : "₴"})</Label>
          <Input type="number" min="0" max={form.valueType === "percent" ? "100" : undefined} value={form.value ?? ""} onChange={e => fv("value", Number(e.target.value))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setEditId(null); setForm({ valueType: "percent", value: 10 }); }}>
          <X className="h-3.5 w-3.5 mr-1" /> Скасувати
        </Button>
        <Button size="sm" onClick={() => save(isNew)}>
          <Check className="h-3.5 w-3.5 mr-1" /> Зберегти
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Типи знижок</h3>
          <p className="text-sm text-muted-foreground">Налаштуйте знижки для різних категорій гостей</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setShowAdd(true); setForm({ valueType: "percent", value: 10 }); }}>
          <Plus className="h-3.5 w-3.5" /> Додати
        </Button>
      </div>

      {showAdd && renderForm(true)}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження...</p>
      ) : discounts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-8 text-center text-muted-foreground">
          <Percent className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Типи знижок ще не налаштовані</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {discounts.map((d: any) => (
            <div key={d.id}>
              {editId === d.id ? renderForm(false) : (
                <div className="rounded-xl border p-4 hover:border-primary/30 transition-colors flex items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.name}</span>
                      <Badge variant="secondary" className="text-xs font-mono">{d.code}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Знижка: <strong>{d.value}{d.valueType === "percent" ? "%" : " ₴"}</strong>
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                      setEditId(d.id);
                      setForm({ name: d.name, code: d.code, value: d.value, valueType: d.valueType });
                    }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => remove(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Settings Page ───────────────────────────────────────────
export default function SettingsPage() {
  const { data: user } = useGetMe();

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto h-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Налаштування</h1>
          <p className="text-muted-foreground mt-1">Керування обліковим записом та параметрами системи.</p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-6 bg-muted/50 p-1 flex-wrap gap-1">
            <TabsTrigger value="profile">Профіль</TabsTrigger>
            <TabsTrigger value="hotel">Дані готелю</TabsTrigger>
            <TabsTrigger value="legal">Юр. особи</TabsTrigger>
            <TabsTrigger value="discounts">Знижки</TabsTrigger>
            <TabsTrigger value="billing">Оплата</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Особисті дані</CardTitle>
                <CardDescription>Оновіть свою контактну інформацію та пароль.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Повне ім'я</Label>
                    <Input id="name" defaultValue={user?.name || ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" defaultValue={user?.email || ""} disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Роль у системі</Label>
                  <Input id="role" defaultValue={user?.role || "Адміністратор"} disabled />
                </div>
                <Button>Зберегти зміни</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hotel">
            <Card>
              <CardHeader>
                <CardTitle>Налаштування об'єкту</CardTitle>
                <CardDescription>Основна інформація про готель, що відображається у системі.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="hotelName">Назва об'єкту</Label>
                  <Input id="hotelName" defaultValue="Boutique Hotel Kyiv" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Основна валюта</Label>
                  <Input id="currency" defaultValue="UAH (Українська гривня)" disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Часовий пояс</Label>
                  <Input id="timezone" defaultValue="Europe/Kiev" disabled />
                </div>
                <Button>Зберегти налаштування</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="legal">
            <Card>
              <CardHeader>
                <CardTitle>Юридичні особи</CardTitle>
                <CardDescription>Реквізити для формування рахунків та приймання онлайн-оплат через LiqPay.</CardDescription>
              </CardHeader>
              <CardContent>
                <LegalEntitiesTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="discounts">
            <Card>
              <CardHeader>
                <CardTitle>Типи знижок</CardTitle>
                <CardDescription>Визначте знижки для окремих категорій гостей (УБД, день народження, постійний гість тощо).</CardDescription>
              </CardHeader>
              <CardContent>
                <DiscountTypesTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Підписка</CardTitle>
                <CardDescription>Керування підпискою Maison HD.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-primary">Pro План</h4>
                    <p className="text-sm text-muted-foreground mt-1">Активний до 12 Грудня 2024</p>
                  </div>
                  <Button variant="outline">Управління підпискою</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
