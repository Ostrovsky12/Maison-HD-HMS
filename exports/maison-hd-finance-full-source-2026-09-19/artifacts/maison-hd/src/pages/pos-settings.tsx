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
  Loader2, Settings, AlertTriangle, X, Check, Tag, Percent, Bot, Save, FlaskConical,
  Search, Radio, ChevronDown, ChevronUp, PlugZap,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

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

  // WiFi discovery state
  const [wifiOpen, setWifiOpen] = useState(false);
  const [subnet, setSubnet] = useState("192.168.1");
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ ip: string; port: number }[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [addedIps, setAddedIps] = useState<Set<string>>(new Set());

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

  const runScan = async () => {
    if (!subnet.trim()) return;
    setScanning(true); setScanResults(null); setScanError(null); setAddedIps(new Set());
    try {
      const r = await apiFetch(`/printers/scan?subnet=${encodeURIComponent(subnet.trim())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Помилка сканування");
      setScanResults(d.found || []);
    } catch (e: any) {
      setScanError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const quickAdd = (ip: string, port: number) => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, ipAddress: ip, port: String(port), name: `Принтер ${ip}` });
    setAddedIps(prev => new Set([...prev, ip]));
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

      {/* ── WiFi discovery panel ── */}
      <div className="border rounded-xl mb-4 overflow-hidden">
        <button
          className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
          onClick={() => { setWifiOpen(v => !v); setScanResults(null); setScanError(null); }}
        >
          <Radio className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-sm font-semibold text-indigo-800 flex-1">Знайти WiFi принтери</span>
          <span className="text-xs text-indigo-500 mr-1">Автоматичний пошук у локальній мережі</span>
          {wifiOpen ? <ChevronUp className="w-4 h-4 text-indigo-500" /> : <ChevronDown className="w-4 h-4 text-indigo-500" />}
        </button>

        {wifiOpen && (
          <div className="p-4 bg-white border-t border-indigo-100 space-y-4">
            {/* Subnet input + scan button */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-gray-500">Підмережа (перші 3 октети)</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={subnet}
                    onChange={e => setSubnet(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="192.168.1"
                    className="font-mono text-sm"
                    disabled={scanning}
                  />
                  <span className="text-sm text-gray-400 font-mono shrink-0">.1–254</span>
                </div>
              </div>
              <Button
                onClick={runScan}
                disabled={scanning || !subnet.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 gap-1.5 shrink-0"
              >
                {scanning
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Сканування…</>
                  : <><Search className="w-4 h-4" /> Сканувати</>}
              </Button>
            </div>

            {/* Scanning animation */}
            {scanning && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-5 flex flex-col items-center gap-3">
                <div className="relative">
                  <Radio className="w-8 h-8 text-indigo-500" />
                  <span className="absolute inset-0 rounded-full border-2 border-indigo-400 animate-ping opacity-50" />
                </div>
                <p className="text-sm text-indigo-700 font-medium">Сканую {subnet}.1–254 · порт 9100…</p>
                <p className="text-xs text-indigo-400">Це займе ~10–15 секунд</p>
              </div>
            )}

            {/* Error */}
            {scanError && !scanning && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{scanError}</p>
              </div>
            )}

            {/* Results */}
            {scanResults !== null && !scanning && (
              <div>
                {scanResults.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-5 text-center">
                    <WifiOff className="w-7 h-7 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500 font-medium">Принтерів не знайдено</p>
                    <p className="text-xs text-gray-400 mt-1">Перевірте підмережу або переконайтесь, що принтер увімкнено</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                      Знайдено {scanResults.length} пристрій{scanResults.length === 1 ? "" : scanResults.length < 5 ? "и" : "ів"}
                    </p>
                    {scanResults.map(({ ip, port }) => (
                      <div key={ip} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <PlugZap className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 font-mono">{ip}</p>
                            <p className="text-xs text-gray-500">Порт {port} · ESC/POS</p>
                          </div>
                        </div>
                        {addedIps.has(ip) ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                            <Check className="w-3 h-3" /> Додається
                          </Badge>
                        ) : (
                          <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 gap-1"
                            onClick={() => quickAdd(ip, port)}>
                            <Plus className="w-3 h-3" /> Додати
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Hint */}
            <p className="text-xs text-gray-400">
              Сканується порт <strong>9100</strong> (стандарт ESC/POS). Принтери Epson TM-T88, BIXOLON SRP-350, Star TSP та інші.
            </p>
          </div>
        )}
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

// ── AI Waiter Tab ──────────────────────────────────────────────────────────────
const PERSONALITY_OPTIONS = [
  { value: "friendly", label: "😊 Дружній та теплий" },
  { value: "formal",   label: "🎩 Офіційний та ввічливий" },
  { value: "fun",      label: "🎉 Енергійний та грайливий" },
];

const LANG_OPTIONS = [
  { value: "auto", label: "🌐 Авто (мова гостя)" },
  { value: "uk",   label: "🇺🇦 Українська" },
  { value: "en",   label: "🇬🇧 English" },
];

function AiWaiterTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<any>({ waiter_name: "AI Офіціант", personality: "friendly", promo_text: "", greeting_text: "", language_hint: "auto" });

  const { isLoading } = useQuery({
    queryKey: ["ai-waiter-settings"],
    queryFn: async () => {
      const r = await apiFetch("/ai-waiter-settings");
      const d = await r.json();
      if (d.settings) setForm({
        waiter_name:   d.settings.waiter_name   || "AI Офіціант",
        personality:   d.settings.personality   || "friendly",
        promo_text:    d.settings.promo_text     || "",
        greeting_text: d.settings.greeting_text  || "",
        language_hint: d.settings.language_hint  || "auto",
      });
      return d.settings;
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/ai-waiter-settings", { method: "PUT", body: JSON.stringify(form) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Помилка"); }
      return r.json();
    },
    onSuccess: () => { toast({ title: "✅ Налаштування AI збережено" }); qc.invalidateQueries({ queryKey: ["ai-waiter-settings"] }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const fv = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
        <div className="flex gap-3">
          <Bot className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-semibold">AI Офіціант — унікальна перевага Maison HD</p>
            <p className="text-xs leading-snug">Гості спілкуються з AI через QR-меню, отримують рекомендації, AI додає страви до кошика. Налаштуйте особистість та промо-повідомлення нижче.</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Ім'я офіціанта</Label>
            <Input placeholder="AI Офіціант" value={form.waiter_name} onChange={e => fv("waiter_name", e.target.value)} className="mt-1" />
            <p className="text-xs text-gray-500 mt-1">Буде показано гостям у чаті</p>
          </div>

          <div>
            <Label>Характер / стиль спілкування</Label>
            <Select value={form.personality} onValueChange={v => fv("personality", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSONALITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Мова за замовчуванням</Label>
            <Select value={form.language_hint} onValueChange={v => fv("language_hint", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANG_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Вітальне повідомлення (необов'язково)</Label>
            <Textarea
              rows={2}
              placeholder="Привіт! Я — Макс, ваш AI-помічник у ресторані Dogoda. Готовий допомогти підібрати страви..."
              value={form.greeting_text}
              onChange={e => fv("greeting_text", e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">Якщо порожньо — AI генерує привітання автоматично з урахуванням часу дня</p>
          </div>

          <div>
            <Label>Промо-повідомлення (акція / спеціальна пропозиція)</Label>
            <Textarea
              rows={2}
              placeholder="Сьогодні діє акція: бокал вина у подарунок при замовленні на суму від 800₴"
              value={form.promo_text}
              onChange={e => fv("promo_text", e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">AI згадуватиме цю акцію доречно в розмові з гостем</p>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-stone-700 mb-2">📱 Попередній перегляд чату</p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-stone-100 rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-stone-700 max-w-[80%]">
                  {form.greeting_text || `Вітаємо! Я — ${form.waiter_name || "AI Офіціант"}. Раді бачити вас! Чим можу допомогти?`}
                </div>
              </div>
              {form.promo_text && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-amber-800 max-w-[80%]">
                    🎁 {form.promo_text}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2"
          >
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Зберегти налаштування AI
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const EXCISE_GROUP_LABELS: Record<string, string> = {
  soft_alc: "Слабоалкогольні напої (<8.5%)",
  beer_low:  "Пиво (до 8.5%)",
  beer_high: "Пиво (понад 8.5%)",
  wine:      "Вина, вермути (<22%)",
  spirits:   "Міцний алкоголь (>22%)",
};

function ExciseRatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRate, setEditRate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["excise-rates"],
    queryFn: async () => {
      const r = await apiFetch("/excise-rates");
      const d = await r.json();
      return d.rates || [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async ({ id, rate }: { id: number; rate: string }) => {
      const r = await apiFetch(`/excise-rates/${id}`, {
        method: "PUT", body: JSON.stringify({ rate_per_liter: parseFloat(rate) }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["excise-rates"] });
      toast({ title: "Ставку оновлено" });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <FlaskConical className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-1">Акцизний податок на алкоголь (ст. 215 ПКУ)</p>
          <p className="text-amber-700">{"Ставки оновлюються щорічно Законом про держбюджет. Акциз = об'єм (л) × ставка (грн/л). Для міцного алкоголю (>22%) обов'язкова акцизна марка."}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Група товарів</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Ставка (грн/л)</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Марка</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Оновлено</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data || []).map((rate: any) => (
                <tr key={rate.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{EXCISE_GROUP_LABELS[rate.group_key] || rate.group_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{rate.group_key}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingId === rate.id ? (
                      <div className="flex items-center gap-1 justify-center">
                        <Input
                          type="number" step="0.0001" min="0"
                          value={editRate} onChange={e => setEditRate(e.target.value)}
                          className="w-24 text-center h-7 text-sm"
                          onKeyDown={e => { if (e.key === "Enter") saveMut.mutate({ id: rate.id, rate: editRate }); if (e.key === "Escape") setEditingId(null); }}
                          autoFocus
                        />
                        <button onClick={() => saveMut.mutate({ id: rate.id, rate: editRate })} className="text-emerald-600 hover:text-emerald-700">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-mono font-semibold text-indigo-700">{parseFloat(rate.rate_per_liter).toFixed(4)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {rate.requires_stamp ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5">🏷️ Обов'язкова</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">
                    {rate.updated_at ? new Date(rate.updated_at).toLocaleDateString("uk-UA") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setEditingId(rate.id); setEditRate(parseFloat(rate.rate_per_liter).toFixed(4)); }}
                      className="text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 text-center">Ставки акцизу діють з 01.01.2024 (Закон про Держбюджет). Для оновлення — натисніть ✏️ поруч з рядком.</p>
    </div>
  );
}

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
            <TabsTrigger value="ai-waiter" className="gap-1.5">
              <Bot className="w-4 h-4" /> AI Офіціант
            </TabsTrigger>
            <TabsTrigger value="excise" className="gap-1.5">
              <FlaskConical className="w-4 h-4" /> Акцизні ставки
            </TabsTrigger>
          </TabsList>
          <TabsContent value="printers"><PrintersTab /></TabsContent>
          <TabsContent value="discounts"><DiscountsTab /></TabsContent>
          <TabsContent value="ai-waiter"><AiWaiterTab /></TabsContent>
          <TabsContent value="excise"><ExciseRatesTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
