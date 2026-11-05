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
  Crown, Users2, Loader2, ChevronRight, Clock, CheckCircle2, AlertCircle,
  Copy, RefreshCw, Globe, Phone, Mail, Lock, Hash,
  Bell, Send, Bot, ToggleLeft, ToggleRight, Sparkles, MessageSquare,
  ScrollText, RotateCcw, CalendarDays, Moon, Ban,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

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

  const { data: legalEntities = [] } = useQuery<any[]>({
    queryKey: ["legal-entities"],
    queryFn: async () => {
      const r = await authFetch(`${API}/legal-entities`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.legalEntities || d || [];
    },
  });

  const buildForm = (p: any) => ({
    name: p.name || "",
    address: p.address || "",
    type: p.type || "hotel",
    description: p.description || "",
    checkInTime: p.check_in_time || "14:00",
    checkOutTime: p.check_out_time || "12:00",
    touristTaxRate: p.tourist_tax_rate != null ? parseFloat(p.tourist_tax_rate) : 0,
    legalEntityId: p.legal_entity_id || null,
  });

  useEffect(() => {
    if (properties.length > 0 && !propertyId) {
      const p = properties[0];
      setPropertyId(p.id);
      setForm(buildForm(p));
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
            if (p) { setPropertyId(p.id); setForm(buildForm(p)); }
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
            <SelectItem value="house">🏡 Котедж / Будинок</SelectItem>
            <SelectItem value="bungalow">🛖 Бунгало</SelectItem>
            <SelectItem value="villa">🏖 Вілла</SelectItem>
            <SelectItem value="apartment">🏢 Апарт-готель</SelectItem>
            <SelectItem value="glamping">🌿 Курорт / Глемпінг</SelectItem>
            <SelectItem value="camping">⛺ Кемпінг</SelectItem>
            <SelectItem value="spa">💆 SPA-комплекс</SelectItem>
            <SelectItem value="pool">🏊 Аквапарк / Купальня</SelectItem>
            <SelectItem value="other">⚙️ Інше</SelectItem>
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="checkInTime">Час заїзду за замовчуванням</Label>
          <Input id="checkInTime" type="time" value={form.checkInTime || "14:00"} onChange={e => fv("checkInTime", e.target.value)} />
          <p className="text-xs text-muted-foreground">Використовується при створенні бронювань</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkOutTime">Час виїзду за замовчуванням</Label>
          <Input id="checkOutTime" type="time" value={form.checkOutTime || "12:00"} onChange={e => fv("checkOutTime", e.target.value)} />
          <p className="text-xs text-muted-foreground">Використовується при створенні бронювань</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="touristTax">Туристичний збір (%)</Label>
        <Input
          id="touristTax"
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={form.touristTaxRate ?? ""}
          onChange={e => fv("touristTaxRate", e.target.value === "" ? null : parseFloat(e.target.value))}
          placeholder="0"
          className="w-40"
        />
        <p className="text-xs text-muted-foreground">Наприклад: 5 — додається до суми рахунку автоматично</p>
      </div>

      {/* ── Legal Entity for this property ── */}
      <div className="space-y-2 border-t pt-4">
        <Label className="flex items-center gap-1.5">
          Юридична особа об'єкту
          <span className="text-xs font-normal text-muted-foreground">(для LiqPay та розрахунків)</span>
        </Label>
        <Select
          value={form.legalEntityId ? String(form.legalEntityId) : "__none__"}
          onValueChange={v => fv("legalEntityId", v === "__none__" ? null : parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Оберіть юридичну особу..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Без прив'язки (глобальна за замовч.) —</SelectItem>
            {legalEntities.map((e: any) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.name} {e.is_default ? "(за замовч.)" : ""} · {e.type === "fop" ? "ФОП" : e.type === "tov" ? "ТОВ" : e.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Виручка від проживання в цьому об'єкті піде на рахунок обраної юр. особи при розщепленні оплат
        </p>
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
      const d = await r.json();
      return d.legalEntities || d || [];
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

  const [testingPrro, setTestingPrro] = useState(false);

  const testCheckbox = async () => {
    if (!form.checkboxLogin || !form.checkboxPassword || !form.checkboxLicenseKey) {
      toast({ title: "Заповніть Checkbox credentials", variant: "destructive" }); return;
    }
    setTestingPrro(true);
    try {
      const r = await authFetch(`${API}/legal-entities/checkbox-test`, {
        method: "POST",
        body: JSON.stringify({ login: form.checkboxLogin, password: form.checkboxPassword, licenseKey: form.checkboxLicenseKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Помилка");
      toast({ title: "✅ Checkbox підключено", description: `Касир: ${d.cashier_name || "OK"} · Зміна: ${d.shift_status || "—"}` });
    } catch (e: any) {
      toast({ title: "❌ Помилка Checkbox", description: e.message, variant: "destructive" });
    } finally { setTestingPrro(false); }
  };

  const renderForm = (isNew: boolean) => (
    <div className="border rounded-xl p-5 space-y-5 mt-3 bg-muted/10">
      <h4 className="font-semibold">{isNew ? "Нова юридична особа" : "Редагування"}</h4>

      {/* ── Основна інформація ─────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Реєстраційні дані</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Повна назва *</Label>
            <Input placeholder='ТОВ "Готель Плюс"' value={form.name || ""} onChange={e => fv("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Скорочена назва</Label>
            <Input placeholder='ТОВ "Готель Плюс"' value={form.shortName || ""} onChange={e => fv("shortName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Тип</Label>
            <Select value={form.type || "tov"} onValueChange={v => fv("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tov">ТОВ</SelectItem>
                <SelectItem value="fop">ФОП</SelectItem>
                <SelectItem value="pp">ПП</SelectItem>
                <SelectItem value="other">Інше</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ЄДРПОУ / ІПН</Label>
            <Input placeholder="12345678" value={form.edrpou || ""} onChange={e => fv("edrpou", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ІПН (якщо ФОП)</Label>
            <Input placeholder="1234567890" value={form.ipn || ""} onChange={e => fv("ipn", e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Юридична адреса</Label>
            <Input placeholder="м. Київ, вул. Хрещатик 1" value={form.legalAddress || ""} onChange={e => fv("legalAddress", e.target.value)} />
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
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="checkbox" id="handles_alcohol" checked={!!form.handlesAlcohol} onChange={e => fv("handlesAlcohol", e.target.checked)} className="accent-amber-600" />
          <label htmlFor="handles_alcohol" className="text-sm text-muted-foreground cursor-pointer">🍺 Ця юр. особа реалізує алкоголь (підакцизні товари)</label>
        </div>
      </div>

      {/* ── Checkbox ПРРО ─────────────────────────────────── */}
      <div className="border rounded-lg p-4 space-y-3 bg-blue-50/60 border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🖨️</span>
            <p className="text-sm font-semibold text-blue-900">Checkbox ПРРО</p>
            <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">checkbox.ua</Badge>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="prro_enabled" checked={!!form.prroEnabled} onChange={e => fv("prroEnabled", e.target.checked)} className="accent-blue-600" />
            <label htmlFor="prro_enabled" className="text-xs text-blue-800 cursor-pointer">Увімкнути ПРРО</label>
          </div>
        </div>
        {form.prroEnabled && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Логін касира (checkbox.ua)</Label>
                <Input placeholder="cashier@example.com" value={form.checkboxLogin || ""} onChange={e => fv("checkboxLogin", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Пароль касира</Label>
                <Input type="password" placeholder="••••••••" value={form.checkboxPassword || ""} onChange={e => fv("checkboxPassword", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ключ ліцензії (License Key)</Label>
              <Input placeholder="XXXX-XXXX-XXXX-XXXX" value={form.checkboxLicenseKey || ""} onChange={e => fv("checkboxLicenseKey", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Податковий номер ПРРО</Label>
              <Input placeholder="4000000001" value={form.taxNumber || ""} onChange={e => fv("taxNumber", e.target.value)} />
            </div>
            <Button
              size="sm" variant="outline" type="button"
              className="border-blue-400 text-blue-700 hover:bg-blue-50"
              onClick={testCheckbox} disabled={testingPrro}
            >
              {testingPrro ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
              Перевірити з'єднання з Checkbox
            </Button>
          </div>
        )}
        {!form.prroEnabled && (
          <p className="text-xs text-blue-700/70">Увімкніть ПРРО щоб автоматично формувати фіскальні чеки при оплаті через POS</p>
        )}
      </div>

      {/* ── LiqPay ─────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">LiqPay (онлайн-платежі)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">LiqPay Public Key</Label>
            <Input placeholder="sandbox_..." value={form.liqpayPublicKey || ""} onChange={e => fv("liqpayPublicKey", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">LiqPay Private Key</Label>
            <Input type="password" placeholder="••••••••" value={form.liqpayPrivateKey || ""} onChange={e => fv("liqpayPrivateKey", e.target.value)} />
          </div>
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
                        {(e.is_default || e.isDefault) && <Badge className="text-xs gap-1"><Star className="h-3 w-3" /> Основна</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                        {e.edrpou && <p>ЄДРПОУ: {e.edrpou}</p>}
                        {e.iban && <p>IBAN: {e.iban}</p>}
                        {e.bank && <p>Банк: {e.bank}</p>}
                        {e.handles_alcohol && <p className="text-amber-600">🍺 Реалізує алкоголь</p>}
                        {e.liqpay_public_key && (
                          <p className="flex items-center gap-1 text-emerald-600">
                            <ShieldCheck className="h-3 w-3" /> LiqPay підключено
                          </p>
                        )}
                        {e.prro_enabled && (
                          <p className="flex items-center gap-1 text-blue-600">
                            🖨️ Checkbox ПРРО підключено
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {!e.is_default && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDefault(e.id)}>
                          <Star className="h-3 w-3 mr-1" /> Основна
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                        setEditId(e.id);
                        setForm({
                          name: e.name, type: e.type, edrpou: e.edrpou, ipn: e.ipn,
                          iban: e.iban, bank: e.bank, mfo: e.mfo, address: e.address,
                          legalAddress: e.legal_address, shortName: e.short_name,
                          liqpayPublicKey: e.liqpay_public_key,
                          prroEnabled: e.prro_enabled || false,
                          checkboxLogin: e.checkbox_login || "",
                          checkboxPassword: "",
                          checkboxLicenseKey: e.checkbox_license_key || "",
                          taxNumber: e.tax_number || "",
                          handlesAlcohol: e.handles_alcohol || false,
                        });
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

// ── Notifications Tab ──────────────────────────────────────────────
function NotificationsTab({ emailOnly = false, showEmail = true }: { emailOnly?: boolean; showEmail?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"email" | "telegram" | "sms" | null>(null);
  const [testing, setTesting] = useState<"email" | "telegram" | "sms" | null>(null);

  const emptyEmail = { enabled: false, host: "", port: 587, secure: false, user: "", pass: "", from: "", fromName: "Maison HD", adminEmails: [] as string[] };
  const emptyTelegram = { enabled: false, botToken: "", chatId: "" };
  const emptySms = { enabled: false, provider: "smsclub", apiKey: "", senderId: "Hotel", apiUrl: "https://im.smsclub.mobi/sms/send", adminPhones: [] as string[], guestSmsEnabled: true };

  const [email, setEmail] = useState<any>(emptyEmail);
  const [telegram, setTelegram] = useState<any>(emptyTelegram);
  const [sms, setSms] = useState<any>(emptySms);
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [adminPhoneInput, setAdminPhoneInput] = useState("");

  useEffect(() => {
    authFetch(`${API}/notifications/channels`).then(async r => {
      if (r.ok) {
        const d = await r.json();
        if (d.email) setEmail(d.email);
        if (d.telegram) setTelegram(d.telegram);
        if (d.sms) setSms(d.sms);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveEmail = async () => {
    setSaving("email");
    const r = await authFetch(`${API}/notifications/channels/email`, { method: "PUT", body: JSON.stringify(email) });
    setSaving(null);
    if (r.ok) toast({ title: "✅ Email збережено", description: "SMTP налаштування оновлено" });
    else toast({ title: "Помилка", description: "Не вдалось зберегти", variant: "destructive" });
  };

  const saveTelegram = async () => {
    setSaving("telegram");
    const r = await authFetch(`${API}/notifications/channels/telegram`, { method: "PUT", body: JSON.stringify(telegram) });
    setSaving(null);
    if (r.ok) toast({ title: "✅ Telegram збережено", description: "Бот налаштовано" });
    else toast({ title: "Помилка", description: "Не вдалось зберегти", variant: "destructive" });
  };

  const saveSms = async () => {
    setSaving("sms");
    const r = await authFetch(`${API}/notifications/channels/sms`, { method: "PUT", body: JSON.stringify(sms) });
    setSaving(null);
    if (r.ok) toast({ title: "✅ SMS збережено", description: "Налаштування SMS оновлено" });
    else toast({ title: "Помилка", description: "Не вдалось зберегти", variant: "destructive" });
  };

  const testChannel = async (channel: "email" | "telegram" | "sms") => {
    setTesting(channel);
    const r = await authFetch(`${API}/notifications/test`, { method: "POST", body: JSON.stringify({ channel }) });
    const d = await r.json();
    setTesting(null);
    if (d.ok) toast({ title: "✅ Тест успішний!", description: channel === "email" ? "Лист надіслано на вказані адреси" : channel === "telegram" ? "Повідомлення надіслано в Telegram" : "SMS надіслано" });
    else toast({ title: "Помилка відправки", description: d.error || "Перевірте налаштування", variant: "destructive" });
  };

  const addAdminEmail = () => {
    const val = adminEmailInput.trim();
    if (!val || !val.includes("@")) return;
    if (!email.adminEmails.includes(val)) setEmail((e: any) => ({ ...e, adminEmails: [...e.adminEmails, val] }));
    setAdminEmailInput("");
  };

  const addAdminPhone = () => {
    const val = adminPhoneInput.trim().replace(/\D/g, "");
    if (!val || val.length < 10) return;
    const formatted = val.startsWith("380") ? `+${val}` : val.startsWith("0") ? `+38${val}` : `+${val}`;
    if (!sms.adminPhones.includes(formatted)) setSms((s: any) => ({ ...s, adminPhones: [...s.adminPhones, formatted] }));
    setAdminPhoneInput("");
  };

  if (loading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Завантаження...</div>;

  return (
    <div className="space-y-6">

      {/* Email / SMTP */}
      {showEmail && <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-500" />
              <CardTitle className="text-base">Email сповіщення (SMTP)</CardTitle>
            </div>
            <button
              onClick={() => setEmail((e: any) => ({ ...e, enabled: !e.enabled }))}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${email.enabled ? "text-emerald-600" : "text-muted-foreground"}`}
            >
              {email.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {email.enabled ? "Увімкнено" : "Вимкнено"}
            </button>
          </div>
          <CardDescription>Листи при новому бронюванні, заїзді та оплаті</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">SMTP Host</Label>
              <Input className="mt-1" placeholder="smtp.gmail.com" value={email.host} onChange={e => setEmail((v: any) => ({ ...v, host: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Порт</Label>
              <Input className="mt-1" type="number" placeholder="587" value={email.port} onChange={e => setEmail((v: any) => ({ ...v, port: parseInt(e.target.value) || 587 }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Логін (email)</Label>
              <Input className="mt-1" placeholder="alerts@myhotel.ua" value={email.user} onChange={e => setEmail((v: any) => ({ ...v, user: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Пароль / App Password</Label>
              <Input className="mt-1" type="password" placeholder="••••••••" value={email.pass} onChange={e => setEmail((v: any) => ({ ...v, pass: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ім'я відправника</Label>
              <Input className="mt-1" placeholder="Maison HD" value={email.fromName} onChange={e => setEmail((v: any) => ({ ...v, fromName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">From email</Label>
              <Input className="mt-1" placeholder="noreply@myhotel.ua" value={email.from} onChange={e => setEmail((v: any) => ({ ...v, from: e.target.value }))} />
            </div>
          </div>

          {/* Admin emails */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Кому надсилати (адміни)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="admin@myhotel.ua"
                value={adminEmailInput}
                onChange={e => setAdminEmailInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addAdminEmail()}
              />
              <Button variant="outline" size="sm" onClick={addAdminEmail}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
            {email.adminEmails?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {email.adminEmails.map((em: string) => (
                  <Badge key={em} variant="secondary" className="gap-1 pr-1">
                    {em}
                    <button onClick={() => setEmail((v: any) => ({ ...v, adminEmails: v.adminEmails.filter((x: string) => x !== em) }))}>
                      <X className="w-3 h-3 opacity-50 hover:opacity-100" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={saveEmail} disabled={!!saving} className="gap-1.5">
              {saving === "email" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Зберегти
            </Button>
            <Button variant="outline" onClick={() => testChannel("email")} disabled={!email.enabled || !!testing} className="gap-1.5">
              {testing === "email" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Надіслати тест
            </Button>
          </div>
        </CardContent>
      </Card>}
      {!emailOnly && <>
      {/* Telegram */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-500" />
              <CardTitle className="text-base">Telegram Bot</CardTitle>
            </div>
            <button
              onClick={() => setTelegram((t: any) => ({ ...t, enabled: !t.enabled }))}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${telegram.enabled ? "text-emerald-600" : "text-muted-foreground"}`}
            >
              {telegram.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {telegram.enabled ? "Увімкнено" : "Вимкнено"}
            </button>
          </div>
          <CardDescription>
            Миттєві сповіщення у Telegram-чат або групу.{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5">
              Створити бота <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Bot Token</Label>
            <Input className="mt-1 font-mono text-sm" placeholder="1234567890:AAH..." value={telegram.botToken} onChange={e => setTelegram((t: any) => ({ ...t, botToken: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">Отримайте у @BotFather → /newbot</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Chat ID (чат або група)</Label>
            <Input className="mt-1 font-mono text-sm" placeholder="-1001234567890" value={telegram.chatId} onChange={e => setTelegram((t: any) => ({ ...t, chatId: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">
              Додайте бота до групи, перешліть будь-яке повідомлення до{" "}
              <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">@userinfobot</a> — він покаже Chat ID
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={saveTelegram} disabled={!!saving} className="gap-1.5">
              {saving === "telegram" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Зберегти
            </Button>
            <Button variant="outline" onClick={() => testChannel("telegram")} disabled={!telegram.enabled || !!testing} className="gap-1.5">
              {testing === "telegram" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Надіслати тест
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SMS */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-500" />
              <CardTitle className="text-base">SMS сповіщення</CardTitle>
            </div>
            <button
              onClick={() => setSms((s: any) => ({ ...s, enabled: !s.enabled }))}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${sms.enabled ? "text-emerald-600" : "text-muted-foreground"}`}
            >
              {sms.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {sms.enabled ? "Увімкнено" : "Вимкнено"}
            </button>
          </div>
          <CardDescription>
            SMS-повідомлення адміністраторам і гостям. Підтримка SMSclub, AlphaSMS, Twilio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Провайдер</Label>
              <select
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={sms.provider}
                onChange={e => {
                  const p = e.target.value;
                  const urls: Record<string, string> = {
                    smsclub: "https://im.smsclub.mobi/sms/send",
                    alphasms: "https://alphasms.ua/api/json.php",
                    twilio: "https://api.twilio.com/2010-04-01/Accounts/ACXXXXX/Messages.json",
                    generic: "",
                  };
                  setSms((s: any) => ({ ...s, provider: p, apiUrl: urls[p] || s.apiUrl }));
                }}
              >
                <option value="smsclub">SMSclub (Україна)</option>
                <option value="alphasms">AlphaSMS (Україна)</option>
                <option value="twilio">Twilio (міжнародний)</option>
                <option value="generic">Власний API</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Sender ID (ім'я)</Label>
              <Input className="mt-1" placeholder="Hotel" value={sms.senderId} onChange={e => setSms((s: any) => ({ ...s, senderId: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">API Key / Token</Label>
            <Input className="mt-1 font-mono text-sm" type="password" placeholder="••••••••" value={sms.apiKey} onChange={e => setSms((s: any) => ({ ...s, apiKey: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">API URL</Label>
            <Input className="mt-1 font-mono text-sm" placeholder="https://im.smsclub.mobi/sms/send" value={sms.apiUrl} onChange={e => setSms((s: any) => ({ ...s, apiUrl: e.target.value }))} />
          </div>

          {/* Phones */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Телефони адміністраторів</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="+380501234567"
                value={adminPhoneInput}
                onChange={e => setAdminPhoneInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addAdminPhone()}
              />
              <Button variant="outline" size="sm" onClick={addAdminPhone}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
            {sms.adminPhones?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sms.adminPhones.map((ph: string) => (
                  <Badge key={ph} variant="secondary" className="gap-1 pr-1">
                    {ph}
                    <button onClick={() => setSms((s: any) => ({ ...s, adminPhones: s.adminPhones.filter((x: string) => x !== ph) }))}>
                      <X className="w-3 h-3 opacity-50 hover:opacity-100" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Guest SMS toggle */}
          <div className="flex items-center gap-3 pt-1">
            <Switch
              checked={sms.guestSmsEnabled}
              onCheckedChange={v => setSms((s: any) => ({ ...s, guestSmsEnabled: v }))}
            />
            <div>
              <Label className="text-sm cursor-pointer" onClick={() => setSms((s: any) => ({ ...s, guestSmsEnabled: !s.guestSmsEnabled }))}>
                SMS-підтвердження гостю
              </Label>
              <p className="text-xs text-muted-foreground">Надсилати SMS гостю після онлайн-бронювання</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={saveSms} disabled={!!saving} className="gap-1.5">
              {saving === "sms" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Зберегти
            </Button>
            <Button variant="outline" onClick={() => testChannel("sms")} disabled={!sms.enabled || !!testing} className="gap-1.5">
              {testing === "sms" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Надіслати тест
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Guide */}
      <Card className="bg-indigo-50/50 border-indigo-100">
        <CardContent className="pt-5 pb-4">
          <p className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2"><Bell className="w-4 h-4" /> Коли надсилаються сповіщення?</p>
          <ul className="space-y-1.5 text-sm text-indigo-800/70">
            {[
              "📋 Нове бронювання — Email + Telegram + SMS адміністраторам, Email + SMS підтвердження гостю",
              "✅ Check-in гостя — при оформленні заїзду",
              "💳 Оплата отримана — при успішному платежі LiqPay",
            ].map(t => <li key={t}>{t}</li>)}
          </ul>
        </CardContent>
      </Card>
      </>}
    </div>
  );
}

// ── Calendar Settings Tab ─────────────────────────────────────────
const DAYS_UA = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function CalendarSettingsTab() {
  const API = BASE.replace("/maison-hd", "") + "/api";
  const tok = () => localStorage.getItem("hms_token") || "";
  const qc = useQueryClient();

  // ── Holidays ──
  const { data: holidays = [], isLoading: hLoad } = useQuery<any[]>({
    queryKey: ["calendar-holidays"],
    queryFn: () => fetch(`${API}/calendar-settings/holidays`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json()),
  });

  const [hForm, setHForm] = useState({ date: "", name: "", color: "#ef4444", isRecurring: false });
  const [addingH, setAddingH] = useState(false);

  const saveHoliday = async () => {
    if (!hForm.date || !hForm.name) return toast({ title: "Заповніть дату і назву", variant: "destructive" });
    const r = await fetch(`${API}/calendar-settings/holidays`, {
      method: "POST", headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
      body: JSON.stringify(hForm),
    });
    if (r.ok) {
      toast({ title: "Свято додано ✓" });
      setHForm({ date: "", name: "", color: "#ef4444", isRecurring: false });
      setAddingH(false);
      qc.invalidateQueries({ queryKey: ["calendar-holidays"] });
    } else {
      const e = await r.json();
      toast({ title: "Помилка", description: e.error, variant: "destructive" });
    }
  };

  const deleteHoliday = async (id: number) => {
    await fetch(`${API}/calendar-settings/holidays/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok()}` } });
    qc.invalidateQueries({ queryKey: ["calendar-holidays"] });
    toast({ title: "Видалено" });
  };

  // ── Restrictions ──
  const { data: restrictions = [], isLoading: rLoad } = useQuery<any[]>({
    queryKey: ["calendar-restrictions"],
    queryFn: () => fetch(`${API}/calendar-settings/restrictions`, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json()),
  });

  const emptyR = { name: "", type: "min_nights", minNights: 2, maxNights: "", daysOfWeek: [] as number[], dateFrom: "", dateTo: "", applyToHolidays: false };
  const [rForm, setRForm] = useState({ ...emptyR });
  const [addingR, setAddingR] = useState(false);

  const toggleDay = (d: number) =>
    setRForm(f => ({ ...f, daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x => x !== d) : [...f.daysOfWeek, d] }));

  const saveRestriction = async () => {
    if (!rForm.name) return toast({ title: "Введіть назву правила", variant: "destructive" });
    const r = await fetch(`${API}/calendar-settings/restrictions`, {
      method: "POST", headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rForm,
        minNights: rForm.minNights ? Number(rForm.minNights) : null,
        maxNights: rForm.maxNights ? Number(rForm.maxNights) : null,
        dateFrom: rForm.dateFrom || null,
        dateTo: rForm.dateTo || null,
      }),
    });
    if (r.ok) {
      toast({ title: "Обмеження додано ✓" });
      setRForm({ ...emptyR });
      setAddingR(false);
      qc.invalidateQueries({ queryKey: ["calendar-restrictions"] });
    } else {
      const e = await r.json();
      toast({ title: "Помилка", description: e.error, variant: "destructive" });
    }
  };

  const toggleActive = async (id: number, isActive: boolean) => {
    await fetch(`${API}/calendar-settings/restrictions/${id}`, {
      method: "PUT", headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    qc.invalidateQueries({ queryKey: ["calendar-restrictions"] });
  };

  const deleteRestriction = async (id: number) => {
    await fetch(`${API}/calendar-settings/restrictions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok()}` } });
    qc.invalidateQueries({ queryKey: ["calendar-restrictions"] });
    toast({ title: "Видалено" });
  };

  return (
    <div className="space-y-6">

      {/* ── Holidays ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Moon className="w-4 h-4 text-blue-500" /> Святкові дні</CardTitle>
              <CardDescription className="mt-1">Дні, що виділятимуться на шахматці та впливатимуть на обмеження за мін. ночами.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddingH(v => !v)}>
              <Plus className="w-4 h-4 mr-1" /> Додати свято
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {addingH && (
            <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
              <p className="text-sm font-semibold text-blue-800">Нове свято</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Дата *</Label>
                  <Input type="date" value={hForm.date} onChange={e => setHForm(f => ({ ...f, date: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Назва *</Label>
                  <Input value={hForm.name} onChange={e => setHForm(f => ({ ...f, name: e.target.value }))} placeholder="Великдень, 1 Травня…" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Колір на календарі</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={hForm.color} onChange={e => setHForm(f => ({ ...f, color: e.target.value }))} className="w-8 h-8 cursor-pointer rounded border" />
                    <span className="text-xs text-gray-500">{hForm.color}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Щорічне повторення</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Switch checked={hForm.isRecurring} onCheckedChange={v => setHForm(f => ({ ...f, isRecurring: v }))} />
                    <span className="text-xs text-gray-600">{hForm.isRecurring ? "Так — повторюється щороку" : "Ні — лише цього року"}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveHoliday}><Check className="w-4 h-4 mr-1" /> Зберегти</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingH(false)}><X className="w-4 h-4" /></Button>
              </div>
            </div>
          )}

          {hLoad ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Свят не додано. Натисніть «Додати свято».</p>
          ) : (
            <div className="space-y-1.5">
              {holidays.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: h.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{h.name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(h.date).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
                      {h.is_recurring && <span className="ml-2 text-blue-500">🔄 щорічно</span>}
                    </p>
                  </div>
                  <button onClick={() => deleteHoliday(h.id)} aria-label="Видалити свято" className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Restrictions ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Ban className="w-4 h-4 text-orange-500" /> Обмеження бронювання</CardTitle>
              <CardDescription className="mt-1">Мінімальна / максимальна кількість ночей залежно від дня тижня, свят або дат.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddingR(v => !v)}>
              <Plus className="w-4 h-4 mr-1" /> Додати правило
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {addingR && (
            <div className="mb-4 p-4 bg-orange-50 rounded-xl border border-orange-100 space-y-3">
              <p className="text-sm font-semibold text-orange-800">Нове правило обмеження</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Назва правила *</Label>
                  <Input value={rForm.name} onChange={e => setRForm(f => ({ ...f, name: e.target.value }))} placeholder="Вихідні мін. 2 ночі" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Тип обмеження</Label>
                  <select value={rForm.type} onChange={e => setRForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full h-8 text-sm border rounded-md px-2 bg-white">
                    <option value="min_nights">Мінімум ночей</option>
                    <option value="max_nights">Максимум ночей</option>
                    <option value="min_max_nights">Мін. і макс. ночей</option>
                    <option value="closed_to_arrival">Заборона заїзду</option>
                    <option value="closed_to_departure">Заборона виїзду</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  {(rForm.type === "min_nights" || rForm.type === "min_max_nights") && (
                    <div className="flex-1">
                      <Label className="text-xs">Мін. ночей</Label>
                      <Input type="number" min={1} max={365} value={rForm.minNights} onChange={e => setRForm(f => ({ ...f, minNights: Number(e.target.value) }))} className="h-8 text-sm" />
                    </div>
                  )}
                  {(rForm.type === "max_nights" || rForm.type === "min_max_nights") && (
                    <div className="flex-1">
                      <Label className="text-xs">Макс. ночей</Label>
                      <Input type="number" min={1} max={365} value={rForm.maxNights} onChange={e => setRForm(f => ({ ...f, maxNights: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-2 block">Дні тижня (коли правило діє)</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS_UA.map((d, i) => (
                      <button key={i} type="button"
                        onClick={() => toggleDay(i)}
                        className={`w-9 h-9 rounded-lg text-xs font-semibold border transition-all
                          ${rForm.daysOfWeek.includes(i)
                            ? (i === 0 || i === 6 ? "bg-rose-500 border-rose-600 text-white" : "bg-blue-500 border-blue-600 text-white")
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Порожньо = діє щодня</p>
                </div>
                <div>
                  <Label className="text-xs">Дата від (опціонально)</Label>
                  <Input type="date" value={rForm.dateFrom} onChange={e => setRForm(f => ({ ...f, dateFrom: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Дата до (опціонально)</Label>
                  <Input type="date" value={rForm.dateTo} onChange={e => setRForm(f => ({ ...f, dateTo: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={rForm.applyToHolidays} onCheckedChange={v => setRForm(f => ({ ...f, applyToHolidays: v }))} />
                    <Label className="text-xs cursor-pointer">Застосовувати також до святкових днів</Label>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveRestriction}><Check className="w-4 h-4 mr-1" /> Зберегти</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingR(false); setRForm({ ...emptyR }); }}><X className="w-4 h-4" /></Button>
              </div>
            </div>
          )}

          {rLoad ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : restrictions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Обмежень не додано. Натисніть «Додати правило».</p>
          ) : (
            <div className="space-y-2">
              {restrictions.map((r: any) => {
                const dows: number[] = Array.isArray(r.days_of_week) ? r.days_of_week : (typeof r.days_of_week === "string" ? JSON.parse(r.days_of_week) : []);
                const typeLabel: Record<string, string> = {
                  min_nights: "Мін. ночей", max_nights: "Макс. ночей",
                  min_max_nights: "Мін./макс.", closed_to_arrival: "Заборона заїзду", closed_to_departure: "Заборона виїзду",
                };
                return (
                  <div key={r.id} className={`p-3 rounded-xl border transition-all ${r.is_active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800">{r.name}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{typeLabel[r.type] || r.type}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {r.min_nights && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Мін: <b>{r.min_nights}н</b></span>}
                          {r.max_nights && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Макс: <b>{r.max_nights}н</b></span>}
                          {dows.length > 0 && (
                            <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              {dows.map(d => DAYS_UA[d]).join(", ")}
                            </span>
                          )}
                          {r.date_from && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{r.date_from} → {r.date_to || "…"}</span>}
                          {r.apply_to_holidays && <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">+ святкові</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Switch checked={!!r.is_active} onCheckedChange={v => toggleActive(r.id, v)} />
                        <button onClick={() => deleteRestriction(r.id)} aria-label="Видалити обмеження" className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded ml-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────
function BillingTab({ onGoToLegal }: { onGoToLegal?: () => void }) {
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
          <button onClick={() => onGoToLegal?.()} className="underline font-medium text-amber-800 hover:text-amber-900">Юр. особи</button>.
          Ваші LiqPay ключі зберігаються безпечно.
        </p>
      </div>
    </div>
  );
}

// ── Super Admin: Subscribers (Demo / Trial) ───────────────────────
function SubscribersTab() {
  const { data: orgs = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["sa-orgs-trial"],
    queryFn: async () => {
      const r = await authFetch(`${API}/organizations`);
      if (!r.ok) return [];
      const all: any[] = await r.json();
      return all.filter(o => o.subscriptionStatus === "trial" || o.subscriptionStatus === "demo");
    },
  });

  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm text-muted-foreground">Організації на демо або пробному режимі. Вони ще не придбали підписку.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Оновити
        </Button>
      </div>

      {orgs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground">
          <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Немає активних демо-підписників</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map((o: any) => {
            const trialEnd = o.trialEndsAt ? new Date(o.trialEndsAt) : null;
            const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86400000) : null;
            const expired = daysLeft !== null && daysLeft <= 0;
            return (
              <div key={o.id} className="rounded-xl border p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{o.name}</span>
                      <Badge variant="outline" className="text-xs font-mono">/{o.slug}</Badge>
                      <Badge variant={expired ? "destructive" : "secondary"} className="text-xs">
                        {expired ? "⏰ Демо закінчилось" : `🕐 ${daysLeft} дн. демо`}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                      {o.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{o.email}</span>}
                      {o.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{o.phone}</span>}
                      <span className="text-xs text-muted-foreground">{o.userCount} корист. · {o.propertyCount} об'єктів</span>
                      <span className="text-xs text-muted-foreground">
                        Зареєстровано: {new Date(o.createdAt).toLocaleDateString("uk-UA")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${
                      expired ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {o.plan?.toUpperCase() || "BASIC"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Super Admin: Owners (Paying subscribers) ─────────────────────
function OwnersTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ org: any; owner: any } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "", plan: "basic",
    email: "", phone: "",
    ownerName: "", ownerEmail: "", ownerPassword: "",
  });

  const { data: orgs = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["sa-orgs-active"],
    queryFn: async () => {
      const r = await authFetch(`${API}/organizations`);
      if (!r.ok) return [];
      const all: any[] = await r.json();
      return all.filter(o => o.subscriptionStatus === "active" || o.subscriptionStatus === "paid");
    },
  });

  const fv = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let pw = "";
    for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    fv("ownerPassword", pw);
  };

  const handleCreate = async () => {
    if (!form.name || !form.ownerName || !form.ownerEmail || !form.ownerPassword) {
      toast({ title: "Помилка", description: "Заповніть усі обов'язкові поля", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const slug = autoSlug(form.name);
      const r = await authFetch(`${API}/organizations`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          slug,
          plan: form.plan,
          email: form.email || null,
          phone: form.phone || null,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPassword: form.ownerPassword,
          trialDays: 0,
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        toast({ title: "Помилка", description: e.message || e.error, variant: "destructive" });
        return;
      }
      const data = await r.json();
      setCreated(data);
      qc.invalidateQueries({ queryKey: ["sa-orgs-active"] });
      refetch();
    } finally {
      setCreating(false);
    }
  };

  const PLAN_LABELS: Record<string, { label: string; color: string }> = {
    basic:      { label: "Basic",      color: "bg-gray-100 text-gray-700 border-gray-200" },
    pro:        { label: "Pro",        color: "bg-blue-50 text-blue-700 border-blue-200" },
    enterprise: { label: "Enterprise", color: "bg-violet-50 text-violet-700 border-violet-200" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">Клієнти з активною платною підпискою. Тут ви реєструєте новий об'єкт і видаєте доступ власнику.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setShowCreate(true); setCreated(null); }}>
            <Plus className="w-3.5 h-3.5" /> Додати власника
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && !created && (
        <div className="border rounded-2xl p-6 space-y-5 bg-muted/5">
          <h4 className="font-bold text-base flex items-center gap-2"><Crown className="w-4 h-4 text-amber-500" /> Реєстрація нового власника</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Інформація про об'єкт</label>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Назва організації / закладу *</Label>
              <Input placeholder='Готель «Вершина»' value={form.name} onChange={e => fv("name", e.target.value)} />
              {form.name && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Hash className="w-3 h-3" /> Slug: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{autoSlug(form.name)}</code>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Тарифний план *</Label>
              <Select value={form.plan} onValueChange={v => fv("plan", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic — до 30 юнітів</SelectItem>
                  <SelectItem value="pro">Pro — до 100 юнітів</SelectItem>
                  <SelectItem value="enterprise">Enterprise — необмежено</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email організації</Label>
              <Input type="email" placeholder="info@hotel.ua" value={form.email} onChange={e => fv("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Телефон</Label>
              <Input type="tel" placeholder="+380 67 000 00 00" value={form.phone} onChange={e => fv("phone", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Обліковий запис власника</label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ім'я власника *</Label>
              <Input placeholder="Ольга Коваленко" value={form.ownerName} onChange={e => fv("ownerName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email для входу *</Label>
              <Input type="email" placeholder="owner@hotel.ua" value={form.ownerEmail} onChange={e => fv("ownerEmail", e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Пароль *</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Мінімум 6 символів"
                    value={form.ownerPassword}
                    onChange={e => fv("ownerPassword", e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={generatePassword} title="Згенерувати пароль">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setForm({ name: "", plan: "basic", email: "", phone: "", ownerName: "", ownerEmail: "", ownerPassword: "" }); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Скасувати
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating} className="gap-1.5">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Створити та надати доступ
            </Button>
          </div>
        </div>
      )}

      {/* Success — show credentials */}
      {created && (
        <div className="border-2 border-emerald-300 rounded-2xl p-6 bg-emerald-50/40 space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <CheckCircle2 className="w-5 h-5" /> Власника успішно зареєстровано!
          </div>
          <p className="text-sm text-muted-foreground">Передайте ці дані для першого входу. Власник зможе змінити пароль у налаштуваннях.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Організація", value: created.org?.name },
              { label: "Slug", value: created.org?.slug },
              { label: "Email", value: created.owner?.email },
              { label: "Пароль", value: form.ownerPassword },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-emerald-200 px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="text-sm font-semibold flex-1 break-all">{value}</code>
                  <button onClick={() => { navigator.clipboard.writeText(String(value)); toast({ title: "Скопійовано" }); }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setCreated(null); setShowCreate(false); setForm({ name: "", plan: "basic", email: "", phone: "", ownerName: "", ownerEmail: "", ownerPassword: "" }); }}>
              Закрити
            </Button>
            <Button size="sm" onClick={() => { setCreated(null); setForm({ name: "", plan: "basic", email: "", phone: "", ownerName: "", ownerEmail: "", ownerPassword: "" }); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Додати ще
            </Button>
          </div>
        </div>
      )}

      {/* List of active owners */}
      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : orgs.length === 0 && !showCreate ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground">
          <Crown className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">Ще немає клієнтів з оплаченою підпискою</p>
          <p className="text-xs mt-1">Натисніть «Додати власника» щоб зареєструвати перший об'єкт</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map((o: any) => {
            const pl = PLAN_LABELS[o.plan] || PLAN_LABELS.basic;
            return (
              <div key={o.id} className="rounded-xl border p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{o.name}</span>
                      <Badge variant="outline" className="text-xs font-mono">/{o.slug}</Badge>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-lg border ${pl.color}`}>{pl.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200">✓ Активна</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                      {o.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{o.email}</span>}
                      {o.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{o.phone}</span>}
                      <span className="text-xs text-muted-foreground">{o.userCount} корист. · {o.propertyCount} об'єктів</span>
                      <span className="text-xs text-muted-foreground">З {new Date(o.createdAt).toLocaleDateString("uk-UA")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {o.maxUnits} юнітів / {o.maxUsers} користувачів
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Users / Team Management Tab ───────────────────────────────────
const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  super_admin:  { label: "Супер-адмін", color: "bg-purple-50 text-purple-700 border-purple-200" },
  owner:        { label: "Власник",     color: "bg-amber-50 text-amber-700 border-amber-200" },
  manager:      { label: "Менеджер",    color: "bg-blue-50 text-blue-700 border-blue-200" },
  reception:    { label: "Рецепція",    color: "bg-sky-50 text-sky-700 border-sky-200" },
  housekeeping: { label: "Прибирання", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function UserPasswordCell({ user, onSaved }: { user: any; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showDisplay, setShowDisplay] = useState(false);
  const [saving, setSaving] = useState(false);

  const genPw = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let p = "";
    for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPw(p);
    setShowPw(true);
  };

  const save = async () => {
    if (!pw || pw.length < 4) { toast({ title: "Пароль занадто короткий", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await authFetch(`${API}/users/${user.id}`, { method: "PUT", body: JSON.stringify({ password: pw }) });
      if (!r.ok) throw new Error("failed");
      toast({ title: "Пароль змінено" });
      setEditing(false);
      setPw("");
      onSaved();
    } catch {
      toast({ title: "Помилка збереження", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {user.displayPassword ? (
          <div className="flex items-center gap-1.5">
            <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
              {showDisplay ? user.displayPassword : "••••••••"}
            </code>
            <button onClick={() => setShowDisplay(v => !v)} className="text-muted-foreground hover:text-foreground">
              {showDisplay ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { navigator.clipboard.writeText(user.displayPassword); toast({ title: "Скопійовано" }); }}
              className="text-muted-foreground hover:text-foreground">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">не встановлено</span>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => { setEditing(true); setPw(""); }}>
          <KeyRound className="w-3 h-3" /> Змінити
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Input
          type={showPw ? "text" : "password"}
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Новий пароль"
          className="h-7 text-xs w-40 pr-7"
        />
        <button onClick={() => setShowPw(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          {showPw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>
      <Button size="icon" variant="outline" className="h-7 w-7" title="Згенерувати" onClick={genPw}>
        <RefreshCw className="w-3 h-3" />
      </Button>
      <Button size="sm" className="h-7 px-2 text-xs" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(false); setPw(""); }}>
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

function UsersManagementTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", email: "", password: "", role: "reception", organizationId: "", propertyId: "" });
  const [showNewPw, setShowNewPw] = useState(false);

  const { data: users = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["all-users-mgmt"],
    queryFn: async () => {
      const r = await authFetch(`${API}/users`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: orgs = [] } = useQuery<any[]>({
    queryKey: ["all-orgs-mgmt"],
    queryFn: async () => {
      if (!isSuperAdmin) return [];
      const r = await authFetch(`${API}/organizations`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isSuperAdmin,
  });

  const genNewPw = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let p = "";
    for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setNewForm(v => ({ ...v, password: p }));
    setShowNewPw(true);
  };

  const handleCreate = async () => {
    if (!newForm.name || !newForm.email || !newForm.password) {
      toast({ title: "Заповніть усі поля", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      const r = await authFetch(`${API}/users`, {
        method: "POST",
        body: JSON.stringify({
          name: newForm.name,
          email: newForm.email,
          password: newForm.password,
          role: newForm.role,
          organizationId: newForm.organizationId ? parseInt(newForm.organizationId) : undefined,
          propertyId: newForm.propertyId ? parseInt(newForm.propertyId) : undefined,
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        toast({ title: "Помилка", description: e.message || e.error, variant: "destructive" }); return;
      }
      toast({ title: "Користувача створено" });
      setShowCreate(false);
      setNewForm({ name: "", email: "", password: "", role: "reception", organizationId: "", propertyId: "" });
      qc.invalidateQueries({ queryKey: ["all-users-mgmt"] });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (u: any) => {
    await authFetch(`${API}/users/${u.id}`, { method: "PUT", body: JSON.stringify({ isActive: !u.isActive }) });
    qc.invalidateQueries({ queryKey: ["all-users-mgmt"] });
    toast({ title: u.isActive ? "Деактивовано" : "Активовано" });
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchOrg = orgFilter === "all" || String(u.organizationId) === orgFilter;
    return matchSearch && matchOrg;
  });

  const orgName = (id: number | null) => {
    if (!id) return "Система";
    const o = orgs.find((o: any) => o.id === id);
    return o ? o.name : `Org #${id}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          <Input
            placeholder="Пошук по імені або email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm w-52"
          />
          {isSuperAdmin && (
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="h-8 text-sm w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі організації</SelectItem>
                <SelectItem value="null">Система</SelectItem>
                {orgs.map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="gap-1.5 h-8">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowCreate(v => !v)}>
            <Plus className="w-3.5 h-3.5" /> Новий користувач
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2"><Users2 className="w-4 h-4" /> Новий користувач</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ім'я *</Label>
              <Input className="mt-1 h-8 text-sm" placeholder="Ім'я Прізвище" value={newForm.name} onChange={e => setNewForm(v => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input className="mt-1 h-8 text-sm" type="email" placeholder="user@hotel.ua" value={newForm.email} onChange={e => setNewForm(v => ({ ...v, email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Пароль *</Label>
              <div className="flex gap-1.5 mt-1">
                <div className="relative flex-1">
                  <Input className="h-8 text-sm pr-7" type={showNewPw ? "text" : "password"} placeholder="Мін. 4 символи" value={newForm.password} onChange={e => setNewForm(v => ({ ...v, password: e.target.value }))} />
                  <button onClick={() => setShowNewPw(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={genNewPw}><RefreshCw className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Роль</Label>
              <Select value={newForm.role} onValueChange={v => setNewForm(p => ({ ...p, role: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Власник</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                  <SelectItem value="cashier">Касир (F&B POS)</SelectItem>
                  <SelectItem value="waiter">Офіціант (F&B POS)</SelectItem>
                  <SelectItem value="reception">Рецепція</SelectItem>
                  <SelectItem value="housekeeping">Прибирання</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="col-span-2">
                <Label className="text-xs">Організація</Label>
                <Select value={newForm.organizationId || "none"} onValueChange={v => setNewForm(p => ({ ...p, organizationId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Оберіть організацію" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Без організації —</SelectItem>
                    {orgs.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}><X className="w-3.5 h-3.5 mr-1" /> Скасувати</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              Створити
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground">
          <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Користувачів не знайдено</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Користувач</th>
                {isSuperAdmin && <th className="px-4 py-2.5 text-left font-medium">Організація</th>}
                <th className="px-4 py-2.5 text-left font-medium">Роль</th>
                <th className="px-4 py-2.5 text-left font-medium">Пароль</th>
                <th className="px-4 py-2.5 text-left font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((u: any) => {
                const rl = ROLE_LABELS[u.role] || ROLE_LABELS.reception;
                return (
                  <tr key={u.id} className={`hover:bg-muted/10 transition-colors ${!u.isActive ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-xs text-muted-foreground">{orgName(u.organizationId)}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-lg border ${rl.color}`}>{rl.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <UserPasswordCell user={u} onSaved={() => qc.invalidateQueries({ queryKey: ["all-users-mgmt"] })} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(u)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-lg border cursor-pointer transition-colors ${
                          u.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                            : "bg-red-50 text-red-700 border-red-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                        }`}
                        title={u.isActive ? "Клікніть щоб деактивувати" : "Клікніть щоб активувати"}
                      >
                        {u.isActive ? "✓ Активний" : "✗ Неактивний"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Усього: {filtered.length} з {users.length} користувачів</p>
    </div>
  );
}

// ── Addons / Services Tab ─────────────────────────────────────────
const CATEGORIES = [
  { value: "service",  label: "Сервіс",     icon: "🔧" },
  { value: "food",     label: "Харчування", icon: "🍳" },
  { value: "spa",      label: "SPA",        icon: "🧖" },
  { value: "rental",   label: "Оренда",     icon: "🚲" },
  { value: "activity", label: "Активності", icon: "🎣" },
  { value: "other",    label: "Інше",       icon: "📦" },
];
const UNIT_OPTIONS = [
  { value: "per session",     label: "за сеанс" },
  { value: "per day",         label: "за добу" },
  { value: "per stay",        label: "за весь заїзд" },
  { value: "per person",      label: "за особу" },
  { value: "per trip",        label: "за рейс" },
  { value: "per set",         label: "за набір" },
  { value: "per bundle",      label: "за в'язку" },
  { value: "per arrangement", label: "за оформлення" },
];

function AddonsTab() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", price: "", unit: "per session", category: "service", icon: "🔧", timeSlots: "", sortOrder: "0", maxQuantity: "", isActive: true });

  const { data: addons = [], isLoading } = useQuery<any[]>({
    queryKey: ["addons"],
    queryFn: async () => {
      const r = await authFetch(`${API}/addons`);
      return r.json();
    },
  });

  const sorted = [...addons].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  function resetForm() {
    setForm({ name: "", description: "", price: "", unit: "per session", category: "service", icon: "🔧", timeSlots: "", sortOrder: "0", maxQuantity: "", isActive: true });
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(a: any) {
    setForm({
      name: a.name, description: a.description || "", price: String(a.price),
      unit: a.unit || "per session", category: a.category || "service", icon: a.icon || "🔧",
      timeSlots: Array.isArray(a.timeSlots) ? a.timeSlots.join(", ") : "",
      sortOrder: String(a.sortOrder ?? 0), maxQuantity: a.maxQuantity ? String(a.maxQuantity) : "",
      isActive: a.isActive,
    });
    setEditId(a.id);
    setShowForm(true);
  }

  async function saveAddon() {
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      price: parseFloat(form.price) || 0, unit: form.unit,
      category: form.category, icon: form.icon,
      timeSlots: form.timeSlots ? form.timeSlots.split(",").map(s => s.trim()).filter(Boolean) : [],
      sortOrder: parseInt(form.sortOrder) || 0,
      maxQuantity: form.maxQuantity ? parseInt(form.maxQuantity) : null,
      isActive: form.isActive,
    };
    if (!payload.name) { toast({ title: "Назва обов'язкова", variant: "destructive" }); return; }
    if (!payload.price) { toast({ title: "Вкажіть ціну", variant: "destructive" }); return; }

    if (editId) {
      await authFetch(`${API}/addons/${editId}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast({ title: "Послугу оновлено" });
    } else {
      await authFetch(`${API}/addons`, { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Послугу додано" });
    }
    qc.invalidateQueries({ queryKey: ["addons"] });
    resetForm();
  }

  async function deleteAddon(id: number) {
    if (!confirm("Видалити послугу?")) return;
    await authFetch(`${API}/addons/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["addons"] });
    toast({ title: "Видалено" });
  }

  async function toggleActive(a: any) {
    await authFetch(`${API}/addons/${a.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !a.isActive }) });
    qc.invalidateQueries({ queryKey: ["addons"] });
  }

  const catInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Всі активні послуги автоматично відображаються в кабінеті гостя для замовлення.</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Додати послугу
        </Button>
      </div>

      {showForm && (
        <div className="border rounded-xl p-4 bg-muted/30 space-y-3">
          <h4 className="font-semibold text-sm">{editId ? "Редагувати послугу" : "Нова послуга"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Назва *</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Баня/Сауна" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Іконка (emoji)</Label>
                <Input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} placeholder="🔥" className="h-8 text-sm mt-1 text-center text-lg" maxLength={4} />
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Опис</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Короткий опис для гостя" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Ціна (грн) *</Label>
              <Input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="500" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Одиниця</Label>
              <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Категорія</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Макс. кількість</Label>
              <Input type="number" value={form.maxQuantity} onChange={e => setForm(p => ({ ...p, maxQuantity: e.target.value }))} placeholder="Без обмежень" className="h-8 text-sm mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Часові слоти (через кому)</Label>
              <Input value={form.timeSlots} onChange={e => setForm(p => ({ ...p, timeSlots: e.target.value }))} placeholder="10:00, 13:00, 16:00, 19:00" className="h-8 text-sm mt-1" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Якщо порожньо — гість замовляє без вибору часу</p>
            </div>
            <div>
              <Label className="text-xs">Порядок сортування</Label>
              <Input type="number" value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))} placeholder="0" className="h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={saveAddon} className="gap-1.5"><Check className="w-3.5 h-3.5" /> Зберегти</Button>
            <Button size="sm" variant="outline" onClick={resetForm} className="gap-1.5"><X className="w-3.5 h-3.5" /> Скасувати</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <p>Послуги ще не додані</p>
          <p className="text-xs mt-1">Додайте баню, трансфер, сніданок та інші послуги вашого об'єкту</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((a: any) => (
            <div key={a.id} className={`flex items-center gap-3 p-3 border rounded-xl transition-all ${a.isActive ? "bg-white" : "bg-muted/30 opacity-60"}`}>
              <span className="text-xl w-8 text-center">{a.icon || "🔧"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{a.name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{catInfo(a.category).label}</Badge>
                  {!a.isActive && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground shrink-0">Неактивна</Badge>}
                </div>
                {a.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{a.description}</p>}
                <div className="flex gap-2 mt-0.5">
                  <span className="text-xs font-semibold text-green-700">{a.price.toLocaleString("uk")} грн</span>
                  <span className="text-xs text-muted-foreground">/ {UNIT_OPTIONS.find(u => u.value === a.unit)?.label || a.unit}</span>
                  {Array.isArray(a.timeSlots) && a.timeSlots.length > 0 && (
                    <span className="text-xs text-blue-500">🕐 {a.timeSlots.length} слотів</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(a)} title={a.isActive ? "Деактивувати" : "Активувати"}>
                  {a.isActive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(a)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteAddon(a.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Guest Card Rules Section ───────────────────────────────────────
const DEFAULT_GUEST_CARD_RULES = `Заїзд з 14:00, виїзд до 12:00. Пізній виїзд за домовленістю та за додаткову плату.
Тихий час з 23:00 до 08:00. Прохання дотримуватися тиші та поважати відпочинок інших гостей.
Паління дозволено лише у спеціально відведених місцях. Паління у приміщеннях заборонено та тягне за собою штраф.
Тварини допускаються за попереднім погодженням з адміністрацією.
Забороняється самовільно переставляти або виносити меблі та інвентар з номера/будинку.
Гість несе матеріальну відповідальність за збитки, завдані майну комплексу.
У разі виявлення несправностей або поломок просимо негайно повідомити адміністрацію.
Адміністрація не несе відповідальності за речі, залишені без нагляду на території комплексу.`;

function GuestCardRulesSection() {
  const qc = useQueryClient();
  const { data: user } = useGetMe();
  const [rules, setRules] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data: org } = useQuery<any>({
    queryKey: ["org-current"],
    queryFn: async () => {
      const r = await authFetch(`${API}/organizations/me`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (org && !loaded) {
      setRules(org.guestCardRules || "");
      setLoaded(true);
    }
  }, [org]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const orgId = org?.id || user?.organizationId;
      if (!orgId) throw new Error("Організацію не знайдено");
      const r = await authFetch(`${API}/organizations/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify({ guestCardRules: rules }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-current"] });
      toast({ title: "Збережено", description: "Правила анкети оновлено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const lineCount = rules.trim() ? rules.trim().split("\n").filter(l => l.trim()).length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="w-4 h-4" />
          Правила комплексу для анкети гостя
        </CardTitle>
        <CardDescription>
          Ці правила друкуються в анкеті гостя при заселенні. Кожен рядок — окремий пункт.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">
              {lineCount > 0 ? `${lineCount} пункт${lineCount === 1 ? "" : lineCount < 5 ? "и" : "ів"}` : "Порожньо — будуть застосовані стандартні правила"}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setRules(DEFAULT_GUEST_CARD_RULES)}
            >
              <RotateCcw className="w-3 h-3" />
              Стандартні правила
            </Button>
          </div>
          <Textarea
            value={rules}
            onChange={e => setRules(e.target.value)}
            placeholder={`Введіть правила — кожен рядок окремий пункт:\n\nЗаїзд з 14:00, виїзд до 12:00...\nТихий час з 23:00 до 08:00...`}
            className="min-h-[220px] font-mono text-sm leading-relaxed resize-y"
          />
          <p className="text-[11px] text-muted-foreground">
            Якщо поле порожнє — в анкеті будуть використані стандартні правила Maison HD.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRules(org?.guestCardRules || "")}
          >
            Скасувати
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-1.5"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Зберегти правила
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Payment URL Section ───────────────────────────────────────────
function PaymentUrlSection() {
  const qc = useQueryClient();
  const { data: user } = useGetMe();
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data: org } = useQuery<any>({
    queryKey: ["org-current"],
    queryFn: async () => {
      const r = await authFetch(`${API}/organizations/me`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (org && !loaded) {
      setUrl(org.paymentUrl || "");
      setLoaded(true);
    }
  }, [org]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const orgId = org?.id || user?.organizationId;
      if (!orgId) throw new Error("Організацію не знайдено");
      const r = await authFetch(`${API}/organizations/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify({ paymentUrl: url.trim() || null }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-current"] });
      toast({ title: "Збережено", description: "Посилання на оплату оновлено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Онлайн-оплата для гостей
        </CardTitle>
        <CardDescription>
          Посилання на LiqPay, Monobank або іншу платіжну сторінку. З'являється у гостьовому кабінеті, якщо є борг.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">Посилання на оплату (URL)</Label>
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://send.monobank.ua/jar/... або https://www.liqpay.ua/..."
            type="url"
          />
          <p className="text-[11px] text-muted-foreground">
            Якщо у конкретного бронювання не вказано власне посилання — гостю покажуть це як кнопку «Сплатити онлайн».
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setUrl(org?.paymentUrl || "")}>Скасувати</Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Зберегти
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── F&B Staff Section (in Персонал tab) ──────────────────────────
function FbStaffSection() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", role: "waiter", pin: "" });

  const { data: staff = [], isLoading } = useQuery<any[]>({
    queryKey: ["fb-staff-settings"],
    queryFn: async () => {
      const r = await authFetch(`${API}/fb/staff`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.staff || [];
    },
  });

  const ROLES: Record<string, { label: string; color: string }> = {
    waiter:    { label: "Офіціант",  color: "bg-blue-50 text-blue-700 border-blue-200" },
    bartender: { label: "Бармен",    color: "bg-purple-50 text-purple-700 border-purple-200" },
    cook:      { label: "Кухар",     color: "bg-orange-50 text-orange-700 border-orange-200" },
    cashier:   { label: "Касир",     color: "bg-green-50 text-green-700 border-green-200" },
    manager:   { label: "Менеджер",  color: "bg-gray-50 text-gray-700 border-gray-200" },
  };

  const handleAdd = async () => {
    if (!form.name || !form.role) { toast({ title: "Введіть ім'я та роль", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await authFetch(`${API}/fb/staff`, {
        method: "POST",
        body: JSON.stringify({ name: form.name, phone: form.phone || null, role: form.role, pin: form.pin || undefined }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      toast({ title: "Співробітника додано" });
      setForm({ name: "", phone: "", role: "waiter", pin: "" });
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["fb-staff-settings"] });
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (s: any) => {
    await authFetch(`${API}/fb/staff/${s.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !s.is_active }) });
    qc.invalidateQueries({ queryKey: ["fb-staff-settings"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Завантаження..." : `${staff.filter((s: any) => s.is_active).length} активних з ${staff.length}`}
        </p>
        <Button size="sm" onClick={() => setShowAdd(v => !v)} variant={showAdd ? "outline" : "default"} className="gap-1.5 h-8">
          <Plus className="w-3.5 h-3.5" /> Додати
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-xl p-4 bg-muted/30 space-y-3">
          <p className="text-sm font-semibold">Новий співробітник</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ім'я *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Марія Коваль" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Телефон</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+380..." className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Роль *</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PIN-код (для каси, 4–6 цифр)</Label>
              <Input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))} placeholder="1234" maxLength={6} className="h-8 text-sm font-mono" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleAdd} disabled={saving || !form.name} className="h-8">
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Зберегти
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)} className="h-8">Скасувати</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : staff.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-xl">
          <Users2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Персонал ще не доданий</p>
          <p className="text-xs mt-1 opacity-70">Додайте офіціантів, барменів та кухарів</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Ім'я</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Роль</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Телефон</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">PIN</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff.map((s: any) => {
                const roleMeta = ROLES[s.role] || { label: s.role, color: "bg-gray-50 text-gray-700 border-gray-200" };
                return (
                  <tr key={s.id} className={`hover:bg-muted/30 ${!s.is_active ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${roleMeta.color}`}>{roleMeta.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{s.phone || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${s.pin_hash ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-muted-foreground"}`}>
                        {s.pin_hash ? "●●●●" : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => toggleActive(s)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-lg border cursor-pointer transition-colors ${
                          s.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                            : "bg-red-50 text-red-700 border-red-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                        }`}
                      >
                        {s.is_active ? "✓ Активний" : "✗ Неактивний"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Детальне управління, PIN та права доступу — у розділі <strong>F&B → Персонал</strong></p>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────
export default function SettingsPage() {
  const [mainTab, setMainTab] = useState("profile");
  const { data: user, isLoading: userLoading } = useGetMe();
  const isSAEarly = user?.role === "super_admin";

  // Fetch org modules (only for hotel admins, not super_admin)
  const { data: settingsOrg } = useQuery<any>({
    queryKey: ["org-settings-modules"],
    queryFn: async () => {
      const r = await authFetch(`${API}/organizations/me`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user && !isSAEarly,
  });

  // Wait for user data before rendering — avoids hook-order flicker
  if (userLoading || !user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full py-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const isSA = user.role === "super_admin";

  // Module access check: if enabledModules not set → all enabled (default)
  const mod = (key: string) => {
    if (isSA) return true;
    const em = settingsOrg?.enabledModules;
    if (!em || typeof em !== "object") return true;
    return em[key] !== false;
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto h-full">
        <div className="mb-8">
          {isSA ? (
            <>
              <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 mb-3">
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Super Admin Panel</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Управління платформою</h1>
              <p className="text-muted-foreground mt-1">Особистий профіль, підписники та клієнти з оплаченим доступом.</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">Налаштування</h1>
              <p className="text-muted-foreground mt-1">Керування обліковим записом та параметрами системи.</p>
            </>
          )}
        </div>

        {isSA ? (
          <Tabs defaultValue="users" className="w-full">
            <TabsList className="mb-6 bg-muted/50 p-1 flex-wrap gap-1 h-auto">
              <TabsTrigger value="users" className="gap-1.5"><Users2 className="w-3.5 h-3.5" /> Команда</TabsTrigger>
              <TabsTrigger value="owners" className="gap-1.5"><Crown className="w-3.5 h-3.5" /> Власники</TabsTrigger>
              <TabsTrigger value="subscribers" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> Підписники</TabsTrigger>
              <TabsTrigger value="profile" className="gap-1.5"><User className="w-3.5 h-3.5" /> Профіль</TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users2 className="w-4 h-4" /> Всі користувачі системи</CardTitle>
                  <CardDescription>Перегляд, управління паролями та статусом всіх акаунтів платформи.</CardDescription>
                </CardHeader>
                <CardContent><UsersManagementTab isSuperAdmin={true} /></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="profile"><ProfileTab /></TabsContent>
            <TabsContent value="subscribers">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users2 className="w-4 h-4" /> Підписники (Демо)</CardTitle>
                  <CardDescription>Організації що зараз тестують систему на демо або пробному доступі.</CardDescription>
                </CardHeader>
                <CardContent><SubscribersTab /></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="owners">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Crown className="w-4 h-4 text-amber-500" /> Власники (Платна підписка)</CardTitle>
                  <CardDescription>Клієнти з оплаченим доступом. Тут реєструйте новий об'єкт та видавайте логін/пароль власнику.</CardDescription>
                </CardHeader>
                <CardContent><OwnersTab /></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
            <TabsList className="mb-6 bg-muted/50 p-1 flex-wrap gap-1 h-auto">
              <TabsTrigger value="profile" className="gap-1.5"><User className="w-3.5 h-3.5" /> Профіль</TabsTrigger>
              <TabsTrigger value="hotel" className="gap-1.5"><Hotel className="w-3.5 h-3.5" /> Дані готелю</TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> Пошта</TabsTrigger>
              {(user.role === "owner" || user.role === "manager") && (
                <TabsTrigger value="team" className="gap-1.5"><Users2 className="w-3.5 h-3.5" /> Персонал</TabsTrigger>
              )}
              {mod("legal_entities") && <TabsTrigger value="legal" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Юр. особи</TabsTrigger>}
              {mod("discounts") && <TabsTrigger value="discounts" className="gap-1.5"><Percent className="w-3.5 h-3.5" /> Знижки</TabsTrigger>}
              {(mod("telegram") || mod("liqpay") || mod("binotel")) && <TabsTrigger value="notifications" className="gap-1.5"><Bell className="w-3.5 h-3.5" /> Сповіщення & Інтеграції</TabsTrigger>}
              {mod("services") && <TabsTrigger value="services" className="gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Послуги</TabsTrigger>}
              <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Календар</TabsTrigger>
              <TabsTrigger value="billing" className="gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Підписка</TabsTrigger>
            </TabsList>
            <TabsContent value="profile"><ProfileTab /></TabsContent>
            {(user.role === "owner" || user.role === "manager") && (
              <TabsContent value="team">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Системний доступ</CardTitle>
                      <CardDescription>Люди з логіном та паролем до Maison HD — власники, менеджери, рецепція.</CardDescription>
                    </CardHeader>
                    <CardContent><UsersManagementTab isSuperAdmin={false} /></CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Users2 className="w-4 h-4" /> Персонал закладу</CardTitle>
                      <CardDescription>Офіціанти, бармени, кухарі, касири — вхід через PIN-код на касі F&B.</CardDescription>
                    </CardHeader>
                    <CardContent><FbStaffSection /></CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}
            <TabsContent value="hotel">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Hotel className="w-4 h-4" /> Налаштування об'єкту</CardTitle>
                    <CardDescription>Основна інформація про готель, що відображається у системі.</CardDescription>
                  </CardHeader>
                  <CardContent><HotelTab /></CardContent>
                </Card>
                <GuestCardRulesSection />
                <PaymentUrlSection />
              </div>
            </TabsContent>
            {mod("legal_entities") && (
              <TabsContent value="legal">
                <Card>
                  <CardHeader>
                    <CardTitle>Юридичні особи</CardTitle>
                    <CardDescription>Реквізити для формування рахунків та приймання онлайн-оплат через LiqPay.</CardDescription>
                  </CardHeader>
                  <CardContent><LegalEntitiesTab /></CardContent>
                </Card>
              </TabsContent>
            )}
            {mod("discounts") && (
              <TabsContent value="discounts">
                <Card>
                  <CardHeader>
                    <CardTitle>Типи знижок</CardTitle>
                    <CardDescription>Визначте знижки для окремих категорій гостей (УБД, день народження, постійний гість тощо).</CardDescription>
                  </CardHeader>
                  <CardContent><DiscountTypesTab /></CardContent>
                </Card>
              </TabsContent>
            )}
            <TabsContent value="email">
              <NotificationsTab emailOnly />
            </TabsContent>
            {(mod("telegram") || mod("liqpay") || mod("binotel")) && (
              <TabsContent value="notifications">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Bell className="w-4 h-4" /> Сповіщення & Інтеграції</CardTitle>
                    <CardDescription>Telegram, SMS-сповіщення, LiqPay та Binotel — підключення та налаштування для вашого об'єкту. SMTP налаштовується у вкладці «Пошта».</CardDescription>
                  </CardHeader>
                  <CardContent><NotificationsTab showEmail={false} /></CardContent>
                </Card>
              </TabsContent>
            )}
            {mod("services") && (
              <TabsContent value="services">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Додаткові послуги</CardTitle>
                    <CardDescription>Налаштуйте послуги вашого об'єкту — вони з'являться в кабінеті гостя для замовлення онлайн.</CardDescription>
                  </CardHeader>
                  <CardContent><AddonsTab /></CardContent>
                </Card>
              </TabsContent>
            )}
            <TabsContent value="calendar">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Налаштування календаря</CardTitle>
                  <CardDescription>Свята та обмеження бронювання — відображаються на шахматці та впливають на мінімальний строк проживання.</CardDescription>
                </CardHeader>
                <CardContent><CalendarSettingsTab /></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="billing">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Підписка та оплата</CardTitle>
                  <CardDescription>Керування підпискою Maison HD та платіжними налаштуваннями.</CardDescription>
                </CardHeader>
                <CardContent><BillingTab onGoToLegal={() => setMainTab("legal")} /></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
