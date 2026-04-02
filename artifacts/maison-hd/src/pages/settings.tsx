import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  Save, KeyRound, User, Hotel, Eye, EyeOff, CreditCard, ExternalLink,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const tok = () => localStorage.getItem("hms_token");
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

// ── Profile Tab ───────────────────────────────────────────────────
function ProfileTab() {
  const qc = useQueryClient();
  const { data: user } = useGetMe();
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await authFetch(`${API}/auth/me/profile`, { method: "PATCH", body: JSON.stringify(payload) });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.message || "Помилка збереження");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setCurrentPw(""); setNewPw(""); setConfirmPw(""); setShowPw(false);
      toast({ title: "Збережено", description: "Дані профілю оновлено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (showPw) {
      if (!currentPw) { toast({ title: "Помилка", description: "Введіть поточний пароль", variant: "destructive" }); return; }
      if (!newPw) { toast({ title: "Помилка", description: "Введіть новий пароль", variant: "destructive" }); return; }
      if (newPw !== confirmPw) { toast({ title: "Помилка", description: "Паролі не співпадають", variant: "destructive" }); return; }
      if (newPw.length < 6) { toast({ title: "Помилка", description: "Мінімум 6 символів", variant: "destructive" }); return; }
      saveMutation.mutate({ name, currentPassword: currentPw, newPassword: newPw });
    } else {
      saveMutation.mutate({ name });
    }
  };

  const roleLabel: Record<string, string> = {
    super_admin: "Super Admin",
    owner: "Власник",
    manager: "Менеджер",
    reception: "Рецепція",
    housekeeping: "Покоївка",
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="w-4 h-4" /> Особисті дані</CardTitle>
          <CardDescription>Оновіть ім'я та контактну інформацію</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="name">Повне ім'я</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Ваше ім'я" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue={user?.email || ""} disabled className="bg-muted/50 cursor-not-allowed" />
              <p className="text-xs text-muted-foreground">Email змінити неможливо</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Роль у системі</Label>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                {roleLabel[user?.role || ""] || user?.role}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Безпека</CardTitle>
          <CardDescription>Зміна пароля облікового запису</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showPw ? (
            <Button variant="outline" onClick={() => setShowPw(true)} className="gap-2">
              <KeyRound className="w-4 h-4" /> Змінити пароль
            </Button>
          ) : (
            <div className="space-y-4 border rounded-xl p-5 bg-muted/10">
              <div className="space-y-2">
                <Label htmlFor="currentPw">Поточний пароль</Label>
                <div className="relative">
                  <Input
                    id="currentPw"
                    type={showCurrentPw ? "text" : "password"}
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder="Введіть поточний пароль"
                  />
                  <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPw">Новий пароль</Label>
                <div className="relative">
                  <Input
                    id="newPw"
                    type={showNewPw ? "text" : "password"}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="Мінімум 6 символів"
                  />
                  <button type="button" onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPw">Підтвердити пароль</Label>
                <Input
                  id="confirmPw"
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Повторіть новий пароль"
                  className={confirmPw && confirmPw !== newPw ? "border-red-400" : ""}
                />
                {confirmPw && confirmPw !== newPw && (
                  <p className="text-xs text-red-500">Паролі не співпадають</p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setShowPw(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Скасувати
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2 px-6">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Збереження..." : "Зберегти зміни"}
        </Button>
      </div>
    </div>
  );
}

// ── Hotel Tab ─────────────────────────────────────────────────────
function HotelTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [propertyId, setPropertyId] = useState<number | null>(null);

  const { data: properties = [], isLoading } = useQuery<any[]>({
    queryKey: ["properties-settings"],
    queryFn: async () => {
      const r = await authFetch(`${API}/properties`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  useEffect(() => {
    if (properties.length > 0 && !propertyId) {
      const p = properties[0];
      setPropertyId(p.id);
      setForm({ name: p.name || "", address: p.address || "", type: p.type || "hotel", description: p.description || "" });
    }
  }, [properties]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/properties/${propertyId}`, { method: "PATCH", body: JSON.stringify(form) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties-settings"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast({ title: "Збережено", description: "Дані об'єкту оновлено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const fv = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">Завантаження...</div>;
  if (properties.length === 0) return (
    <div className="py-8 text-center text-muted-foreground">
      <Hotel className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">Об'єктів не знайдено. Спочатку додайте об'єкт.</p>
    </div>
  );

  const selectedProp = properties.find(p => p.id === propertyId);

  return (
    <div className="space-y-5">
      {properties.length > 1 && (
        <div className="space-y-2">
          <Label>Об'єкт</Label>
          <Select value={String(propertyId)} onValueChange={v => {
            const p = properties.find(x => x.id === Number(v));
            if (p) { setPropertyId(p.id); setForm({ name: p.name || "", address: p.address || "", type: p.type || "hotel", description: p.description || "" }); }
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {properties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="propName">Назва об'єкту *</Label>
        <Input id="propName" value={form.name || ""} onChange={e => fv("name", e.target.value)} placeholder='Наприклад: Арт-курорт «Догода»' />
      </div>

      <div className="space-y-2">
        <Label htmlFor="propType">Тип закладу</Label>
        <Select value={form.type || "hotel"} onValueChange={v => fv("type", v)}>
          <SelectTrigger id="propType"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hotel">🏨 Готель</SelectItem>
            <SelectItem value="hostel">🛏 Хостел</SelectItem>
            <SelectItem value="apart">🏢 Апарт-готель</SelectItem>
            <SelectItem value="resort">🌿 Курорт</SelectItem>
            <SelectItem value="villa">🏡 Вілла</SelectItem>
            <SelectItem value="camping">⛺ Кемпінг</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="propAddress">Адреса</Label>
        <Input id="propAddress" value={form.address || ""} onChange={e => fv("address", e.target.value)} placeholder="м. Київ, вул. Хрещатик 1" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="propDesc">Опис</Label>
        <Input id="propDesc" value={form.description || ""} onChange={e => fv("description", e.target.value)} placeholder="Короткий опис закладу" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Часовий пояс</Label>
          <Input value={selectedProp?.timezone || "Europe/Kyiv (UTC+2/+3)"} disabled className="bg-muted/50 cursor-not-allowed" />
          <p className="text-xs text-muted-foreground">Встановлюється під час онбордингу</p>
        </div>
        <div className="space-y-2">
          <Label>Основна валюта</Label>
          <Input value={selectedProp?.currency || "UAH (₴)"} disabled className="bg-muted/50 cursor-not-allowed" />
          <p className="text-xs text-muted-foreground">Встановлюється під час онбордингу</p>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name} className="gap-2 px-6">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Збереження..." : "Зберегти налаштування"}
        </Button>
      </div>
    </div>
  );
}

// ── Legal Entities Tab ────────────────────────────────────────────
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
    setShowAdd(false); setEditId(null); setForm({});
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

// ── Discount Types Tab ────────────────────────────────────────────
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
    setShowAdd(false); setEditId(null); setForm({ valueType: "percent", value: 10 });
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
          <Input placeholder="День народження" value={form.name || ""} onChange={e => fv("name", e.target.value)} />
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

// ── Billing Tab ───────────────────────────────────────────────────
function BillingTab() {
  const [, navigate] = useLocation();

  const { data: sub } = useQuery<any>({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      const r = await authFetch(`${API}/subscriptions/my`);
      if (!r.ok) return null;
      return r.json();
    },
  });

  const planLabel: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
    trial: "Пробний",
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    active: { text: "Активна", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    trialing: { text: "Пробний період", color: "text-blue-600 bg-blue-50 border-blue-200" },
    past_due: { text: "Прострочена", color: "text-red-600 bg-red-50 border-red-200" },
    canceled: { text: "Скасована", color: "text-gray-500 bg-gray-50 border-gray-200" },
  };

  const st = sub?.status ? statusLabel[sub.status] : null;

  return (
    <div className="space-y-5">
      {sub ? (
        <div className="rounded-xl border p-5 flex items-center justify-between bg-primary/5 border-primary/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-lg text-primary">{planLabel[sub.tier] || sub.tier} План</span>
              {st && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${st.color}`}>{st.text}</span>
              )}
            </div>
            {sub.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                Активний до {new Date(sub.currentPeriodEnd).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </div>
          <Button onClick={() => navigate("/subscription")} className="gap-2">
            <CreditCard className="w-4 h-4" /> Управління підпискою
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-6 text-center space-y-3">
          <CreditCard className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
          <div>
            <p className="font-medium">Підписка не активована</p>
            <p className="text-sm text-muted-foreground">Оберіть план щоб отримати повний доступ до системи</p>
          </div>
          <Button onClick={() => navigate("/subscription")} className="gap-2">
            <ExternalLink className="w-4 h-4" /> Переглянути плани
          </Button>
        </div>
      )}

      <div className="rounded-xl border p-4 bg-amber-50/50 border-amber-200">
        <p className="text-sm font-medium text-amber-800 mb-1">LiqPay інтеграція</p>
        <p className="text-xs text-amber-700">
          Для прийому онлайн-оплат налаштуйте LiqPay ключі у вкладці{" "}
          <button onClick={() => {}} className="underline font-medium">Юр. особи</button>.
          Ваші LiqPay ключі зберігаються безпечно.
        </p>
      </div>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto h-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Налаштування</h1>
          <p className="text-muted-foreground mt-1">Керування обліковим записом та параметрами системи.</p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-6 bg-muted/50 p-1 flex-wrap gap-1 h-auto">
            <TabsTrigger value="profile" className="gap-1.5"><User className="w-3.5 h-3.5" /> Профіль</TabsTrigger>
            <TabsTrigger value="hotel" className="gap-1.5"><Hotel className="w-3.5 h-3.5" /> Дані готелю</TabsTrigger>
            <TabsTrigger value="legal" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Юр. особи</TabsTrigger>
            <TabsTrigger value="discounts" className="gap-1.5"><Percent className="w-3.5 h-3.5" /> Знижки</TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Оплата</TabsTrigger>
          </TabsList>

          <TabsContent value="profile"><ProfileTab /></TabsContent>
          <TabsContent value="hotel">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Hotel className="w-4 h-4" /> Налаштування об'єкту</CardTitle>
                <CardDescription>Основна інформація про готель, що відображається у системі.</CardDescription>
              </CardHeader>
              <CardContent><HotelTab /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="legal">
            <Card>
              <CardHeader>
                <CardTitle>Юридичні особи</CardTitle>
                <CardDescription>Реквізити для формування рахунків та приймання онлайн-оплат через LiqPay.</CardDescription>
              </CardHeader>
              <CardContent><LegalEntitiesTab /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="discounts">
            <Card>
              <CardHeader>
                <CardTitle>Типи знижок</CardTitle>
                <CardDescription>Визначте знижки для окремих категорій гостей (УБД, день народження, постійний гість тощо).</CardDescription>
              </CardHeader>
              <CardContent><DiscountTypesTab /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Підписка та оплата</CardTitle>
                <CardDescription>Керування підпискою Maison HD та платіжними налаштуваннями.</CardDescription>
              </CardHeader>
              <CardContent><BillingTab /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
