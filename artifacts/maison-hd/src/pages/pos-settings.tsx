import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Printer, Plus, Pencil, Trash2, Wifi, WifiOff, CheckCircle2,
  Loader2, Settings, AlertTriangle, X, Check, Tag, Percent,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API_FB = BASE.replace("/maison-hd", "") + "/api/fb";
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${API_FB}${path}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const PRINTER_TYPES = [
  { value: "bar",                   label: "🍸 Бар",               desc: "Напої, алкоголь, коктейлі" },
  { value: "kitchen_general",       label: "🍳 Кухня (загальна)", desc: "Всі страви без спеціалізації" },
  { value: "kitchen_hot",           label: "🔥 Кухня (гаряча)",   desc: "Гарячі страви, супи, м'ясо" },
  { value: "kitchen_cold",          label: "🥗 Кухня (холодна)",  desc: "Салати, закуски, холодні страви" },
  { value: "kitchen_confectionery", label: "🎂 Кондитерська",     desc: "Десерти, випічка, торти" },
  { value: "cashier",               label: "🖨️ Каса",             desc: "Фіскальний чек для гостя" },
];

const EMPTY_FORM = {
  name: "", printerType: "kitchen_general", ipAddress: "", port: "9100",
  usbPath: "", autoPrint: true, copies: "1", notes: "",
};

const EMPTY_DISCOUNT = {
  name: "", type: "percent", value: "", min_order_amount: "0",
  requires_manager: false, description: "",
};

const DISCOUNT_TYPES = [
  { value: "percent",    label: "% від суми",       hint: "Наприклад: 10% знижка" },
  { value: "fixed",      label: "Фіксована сума ₴", hint: "Наприклад: -50 ₴" },
  { value: "compliment", label: "Комплімент (100%)", hint: "Повне списання суми" },
];

type Printer = {
  id: number; name: string; printer_type: string; ip_address?: string;
  port?: number; usb_path?: string; is_active: boolean;
  auto_print: boolean; copies: number; notes?: string;
};

type Discount = {
  id: number; name: string; type: string; value: number;
  min_order_amount: number; requires_manager: boolean;
  description?: string; is_active: boolean;
};

function getPrinterTypeMeta(type: string) {
  return PRINTER_TYPES.find(t => t.value === type) || PRINTER_TYPES[1];
}

// ── Printers Tab ──────────────────────────────────────────────────────────────
function PrintersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const fv = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ["pos-printers"],
    queryFn: async () => {
      const r = await apiFetch("/printers");
      const d = await r.json();
      return (d.printers || []) as Printer[];
    },
  });
  const printers = data || [];

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name, printerType: form.printerType,
        ipAddress: form.ipAddress || null, port: parseInt(form.port) || 9100,
        usbPath: form.usbPath || null, autoPrint: form.autoPrint,
        copies: parseInt(form.copies) || 1, notes: form.notes || null,
      };
      const r = editId
        ? await apiFetch(`/printers/${editId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/printers", { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editId ? "Принтер оновлено" : "Принтер додано" });
      qc.invalidateQueries({ queryKey: ["pos-printers"] });
      setShowForm(false); setEditId(null); setForm(EMPTY_FORM);
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/printers/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error("Помилка");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-printers"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await apiFetch(`/printers/${id}`, { method: "DELETE" }); },
    onSuccess: () => { toast({ title: "Принтер видалено" }); qc.invalidateQueries({ queryKey: ["pos-printers"] }); },
  });

  const openEdit = (p: Printer) => {
    setEditId(p.id);
    setForm({
      name: p.name, printerType: p.printer_type,
      ipAddress: p.ip_address || "", port: String(p.port || 9100),
      usbPath: p.usb_path || "", autoPrint: p.auto_print,
      copies: String(p.copies || 1), notes: p.notes || "",
    });
    setShowForm(true);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Принтери чеків та квитків кухні</p>
        <Button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); }} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
          <Plus className="w-4 h-4" /> Додати принтер
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
        <div className="flex gap-3">
          <Printer className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-medium">Як це працює</p>
            <p>Кожна страва в меню має призначену <strong>станцію</strong>. При відправленні замовлення система автоматично друкує квиток на потрібний принтер.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {PRINTER_TYPES.slice(0, 5).map(pt => {
          const mp = printers.filter(p => p.printer_type === pt.value && p.is_active);
          return (
            <div key={pt.value} className={`rounded-xl border p-3 ${mp.length > 0 ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
              <p className="text-sm font-medium text-gray-800">{pt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{pt.desc}</p>
              {mp.length > 0
                ? <div className="mt-2 flex items-center gap-1"><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-xs text-emerald-700">{mp.map(p => p.name).join(", ")}</span></div>
                : <div className="mt-2 flex items-center gap-1"><WifiOff className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-400">Не налаштовано</span></div>
              }
            </div>
          );
        })}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-indigo-700">{printers.filter(p => p.is_active).length}</span>
          <span className="text-xs text-indigo-600 mt-0.5">активних принтерів</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : printers.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <Printer className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Принтерів ще немає</p>
          <p className="text-gray-400 text-sm mt-1">Натисніть «Додати принтер» щоб налаштувати перший</p>
        </div>
      ) : (
        <div className="space-y-3">
          {printers.map(p => {
            const meta = getPrinterTypeMeta(p.printer_type);
            return (
              <div key={p.id} className={`rounded-xl border p-4 transition-all ${p.is_active ? "bg-white border-gray-200 hover:border-indigo-200" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${p.is_active ? "bg-emerald-100" : "bg-gray-100"}`}>
                      {meta.label.split(" ")[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        <Badge variant="outline" className="text-xs">{meta.label.split(" ").slice(1).join(" ")}</Badge>
                        {p.is_active
                          ? <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Активний</Badge>
                          : <Badge variant="secondary" className="text-xs">Вимкнено</Badge>
                        }
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        {p.ip_address && <span className="text-xs text-gray-500 flex items-center gap-1"><Wifi className="w-3 h-3" /> {p.ip_address}:{p.port || 9100}</span>}
                        {p.usb_path && <span className="text-xs text-gray-500">{p.usb_path}</span>}
                        {p.auto_print && <span className="text-xs text-gray-400">Авто-друк · {p.copies || 1} копії</span>}
                        {p.notes && <span className="text-xs text-gray-400 italic">{p.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleActive.mutate({ id: p.id, isActive: !p.is_active })}>
                      {p.is_active ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      onClick={() => { if (confirm("Видалити принтер?")) deleteMut.mutate(p.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Налаштування принтерів</p>
            <p className="mt-1">Популярні принтери: <strong>Epson TM-T88</strong>, <strong>BIXOLON SRP-350</strong>. Порт за замовчуванням: <strong>9100</strong>.</p>
          </div>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Редагувати принтер" : "Новий принтер"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Назва принтера *</Label><Input placeholder="Принтер бару, Кухня-1…" value={form.name} onChange={e => fv("name", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Станція</Label>
              <Select value={form.printerType} onValueChange={v => fv("printerType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRINTER_TYPES.map(pt => <SelectItem key={pt.value} value={pt.value}>{pt.label} — {pt.desc}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5"><Label>IP-адреса</Label><Input placeholder="192.168.1.100" value={form.ipAddress} onChange={e => fv("ipAddress", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Порт</Label><Input placeholder="9100" value={form.port} onChange={e => fv("port", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>USB-шлях (якщо не мережевий)</Label><Input placeholder="/dev/usb/lp0 або COM3" value={form.usbPath} onChange={e => fv("usbPath", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Кількість копій</Label><Input type="number" min={1} max={5} value={form.copies} onChange={e => fv("copies", e.target.value)} /></div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.autoPrint} onChange={e => fv("autoPrint", e.target.checked)} className="accent-indigo-600" /> Авто-друк
                </label>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Примітки</Label><Input placeholder="Необов'язково" value={form.notes} onChange={e => fv("notes", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); }}><X className="w-4 h-4 mr-1" /> Скасувати</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              {editId ? "Зберегти" : "Додати"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Discounts Tab ─────────────────────────────────────────────────────────────
function DiscountsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(EMPTY_DISCOUNT);
  const fv = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ["fb-discounts-all"],
    queryFn: async () => {
      const r = await apiFetch("/discounts/all");
      const d = await r.json();
      return (d.discounts || []) as Discount[];
    },
  });
  const discounts = data || [];

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name, type: form.type,
        value: form.type === "compliment" ? 100 : Number(form.value) || 0,
        min_order_amount: Number(form.min_order_amount) || 0,
        requires_manager: form.requires_manager,
        description: form.description || null,
      };
      const r = editId
        ? await apiFetch(`/discounts/${editId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/discounts", { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editId ? "Акцію оновлено" : "Акцію додано" });
      qc.invalidateQueries({ queryKey: ["fb-discounts-all"] });
      setShowForm(false); setEditId(null); setForm(EMPTY_DISCOUNT);
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const r = await apiFetch(`/discounts/${id}`, { method: "PATCH", body: JSON.stringify({ is_active }) });
      if (!r.ok) throw new Error("Помилка");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-discounts-all"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await apiFetch(`/discounts/${id}`, { method: "DELETE" }); },
    onSuccess: () => { toast({ title: "Акцію деактивовано" }); qc.invalidateQueries({ queryKey: ["fb-discounts-all"] }); },
  });

  const openEdit = (d: Discount) => {
    setEditId(d.id);
    setForm({
      name: d.name, type: d.type, value: String(d.value),
      min_order_amount: String(d.min_order_amount || 0),
      requires_manager: d.requires_manager, description: d.description || "",
    });
    setShowForm(true);
  };

  const typeLabel = (d: Discount) => {
    if (d.type === "compliment") return <Badge className="text-xs bg-rose-100 text-rose-700 border-rose-200">Комплімент</Badge>;
    if (d.type === "percent") return <Badge className="text-xs bg-indigo-100 text-indigo-700 border-indigo-200">{d.value}%</Badge>;
    return <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">-{d.value} ₴</Badge>;
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Пресети знижок та акцій для POS-каси</p>
        <Button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_DISCOUNT); }} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
          <Plus className="w-4 h-4" /> Додати акцію
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : discounts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <Tag className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Акцій ще немає</p>
          <p className="text-gray-400 text-sm mt-1">Натисніть «Додати акцію» щоб створити першу</p>
        </div>
      ) : (
        <div className="space-y-3">
          {discounts.map((d: Discount) => (
            <div key={d.id} className={`rounded-xl border p-4 transition-all flex items-start justify-between ${d.is_active ? "bg-white border-gray-200 hover:border-indigo-200" : "bg-gray-50 border-gray-200 opacity-60"}`}>
              <div className="flex gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${d.is_active ? "bg-emerald-100" : "bg-gray-100"}`}>
                  {d.type === "compliment" ? "🎁" : d.type === "percent" ? "%" : "₴"}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{d.name}</span>
                    {typeLabel(d)}
                    {d.requires_manager && <Badge variant="outline" className="text-xs">Менеджер</Badge>}
                    {d.is_active
                      ? <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Активна</Badge>
                      : <Badge variant="secondary" className="text-xs">Вимкнена</Badge>
                    }
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
                    {Number(d.min_order_amount) > 0 && <span>Мін. сума: {d.min_order_amount} ₴</span>}
                    {d.description && <span className="italic">{d.description}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                  onClick={() => toggleMut.mutate({ id: d.id, is_active: !d.is_active })}>
                  {d.is_active ? "Вимк." : "Увімк."}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(d)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                  onClick={() => { if (confirm("Деактивувати акцію?")) deleteMut.mutate(d.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditId(null); setForm(EMPTY_DISCOUNT); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Редагувати акцію" : "Нова акція"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Назва *</Label><Input placeholder="Знижка іменинника, Happy Hour…" value={form.name} onChange={e => fv("name", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Тип знижки</Label>
              <Select value={form.type} onValueChange={v => fv("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DISCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label} — {t.hint}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.type !== "compliment" && (
              <div className="space-y-1.5">
                <Label>{form.type === "percent" ? "Відсоток (%):" : "Сума знижки (₴):"}</Label>
                <Input type="number" min={0} max={form.type === "percent" ? 100 : undefined}
                  value={form.value} onChange={e => fv("value", e.target.value)}
                  placeholder={form.type === "percent" ? "10" : "50"} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Мінімальна сума замовлення (₴)</Label>
              <Input type="number" min={0} value={form.min_order_amount} onChange={e => fv("min_order_amount", e.target.value)} placeholder="0 = без обмежень" />
            </div>
            <div className="space-y-1.5"><Label>Опис (необов'язково)</Label><Input value={form.description} onChange={e => fv("description", e.target.value)} placeholder="Для іменинників з документом…" /></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.requires_manager} onChange={e => fv("requires_manager", e.target.checked)} className="accent-indigo-600" />
              Потребує підтвердження менеджера
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_DISCOUNT); }}><X className="w-4 h-4 mr-1" /> Скасувати</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              {editId ? "Зберегти" : "Додати"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PosSettingsPage() {
  return (
    <AppLayout title="POS Налаштування">
      <div className="max-w-3xl mx-auto space-y-6 p-6">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">POS Налаштування</h1>
        </div>

        <Tabs defaultValue="printers">
          <TabsList className="mb-4">
            <TabsTrigger value="printers" className="gap-1.5">
              <Printer className="w-4 h-4" /> Принтери
            </TabsTrigger>
            <TabsTrigger value="discounts" className="gap-1.5">
              <Tag className="w-4 h-4" /> Акції та знижки
            </TabsTrigger>
          </TabsList>
          <TabsContent value="printers"><PrintersTab /></TabsContent>
          <TabsContent value="discounts"><DiscountsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
