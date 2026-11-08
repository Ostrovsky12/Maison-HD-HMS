import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  QrCode, Download, Printer, Grid3X3, List, Plus, Pencil,
  Trash2, Settings2, CheckCircle2, Copy, ExternalLink, Layers,
  Clock, Wine, Store,
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────
const API = "/api/fb";
const MAISON_BASE = (import.meta.env.BASE_URL || "/maison-hd/").replace(/\/$/, "");
const ROOT_BASE = MAISON_BASE.replace(/\/maison-hd$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

// ─── QR URL builder ───────────────────────────────────────────────────────────
function buildQrUrl(tableId: number, orgSlug: string): string {
  if (!orgSlug) return "";
  return `${window.location.origin}${MAISON_BASE}/qr-menu/${encodeURIComponent(orgSlug)}/${tableId}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface TableGroup {
  id: number; name: string; description?: string;
  icon: string; color: string;
  is_24h: boolean; open_time: string; close_time: string;
  is_minibar: boolean; sort_order: number; is_active: boolean;
  table_count: number;
}

interface Table {
  id: number; number: string; capacity: number; location?: string;
  status: string; isActive: boolean; currentOrderId?: number;
  groupId?: number | null; groupName?: string; groupIcon?: string; groupColor?: string;
}

// ─── Group constants ──────────────────────────────────────────────────────────
const GROUP_ICONS = ["🍽", "🍸", "🍹", "🍻", "🛏", "🏊", "🌿", "☕", "🎭", "🍕", "🥩", "🍣"];
const GROUP_COLORS = [
  "#6b7280", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316",
];

// ─── Group badge ──────────────────────────────────────────────────────────────
function GroupBadge({ icon, name, color }: { icon: string; name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white leading-none"
      style={{ backgroundColor: color }}>
      <span>{icon}</span>{name}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: GROUPS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
function GroupsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TableGroup | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", icon: "🍽", color: "#6b7280",
    is24h: false, openTime: "08:00", closeTime: "22:00",
    isMinibar: false, sortOrder: "0",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["fb-table-groups"],
    queryFn: () => apiFetch("/settings/table-groups"),
  });

  const save = useMutation({
    mutationFn: (body: any) => editing
      ? apiFetch(`/settings/table-groups/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : apiFetch("/settings/table-groups", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-table-groups"] });
      qc.invalidateQueries({ queryKey: ["fb-tables"] });
      setOpen(false);
      toast({ title: "Збережено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/settings/table-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-table-groups"] });
      qc.invalidateQueries({ queryKey: ["fb-tables"] });
    },
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", description: "", icon: "🍽", color: "#6b7280", is24h: false, openTime: "08:00", closeTime: "22:00", isMinibar: false, sortOrder: "0" });
    setOpen(true);
  }

  function openEdit(g: TableGroup) {
    setEditing(g);
    setForm({
      name: g.name, description: g.description || "", icon: g.icon, color: g.color,
      is24h: g.is_24h, openTime: g.open_time, closeTime: g.close_time,
      isMinibar: g.is_minibar, sortOrder: String(g.sort_order),
    });
    setOpen(true);
  }

  const groups: TableGroup[] = data?.tableGroups || [];

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Групи QR-кодів столів</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Об'єднайте столи у групи з розкладом роботи. Міні-бар — 24/7, без зміни касира.
          </p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Нова група</Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Завантаження...</div>
      ) : groups.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-10 text-center text-muted-foreground">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium mb-1">Ще немає жодної групи</p>
          <p className="text-xs mb-4">Групи дозволяють задати розклад роботи, виділити міні-бар або VIP-зону</p>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Створити першу групу</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ background: g.color }}>
                {g.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{g.name}</span>
                  {g.is_minibar && (
                    <Badge className="text-[10px] h-4 gap-0.5 bg-purple-100 text-purple-700 border-purple-200 border">
                      <Wine className="w-2.5 h-2.5" />Міні-бар
                    </Badge>
                  )}
                  {g.is_24h ? (
                    <Badge variant="secondary" className="text-[10px] h-4">24/7</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
                      <Clock className="w-2.5 h-2.5" />{g.open_time}–{g.close_time}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] h-4">{g.table_count} столів</Badge>
                </div>
                {g.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.description}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => { if (confirm(`Видалити групу «${g.name}»?`)) remove.mutate(g.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 flex gap-2.5">
        <Wine className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
        <p className="text-xs text-purple-700 dark:text-purple-400">
          <span className="font-semibold">Міні-бар після 22:00:</span> Закон України забороняє продаж алкоголю з 22:00 до 08:00.
          LiqPay автоматично переключиться на передавторизацію (hold), кошти підтвердяться після 08:00.
        </p>
      </div>

      {/* Group dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Редагувати групу" : "Нова група QR-кодів"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Назва *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ресторан, Бар, Міні-бар..." autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Порядок</Label>
                <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Опис (необов'язково)</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Короткий опис групи..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Іконка</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_ICONS.map(ic => (
                    <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all
                        ${form.icon === ic ? "ring-2 ring-primary scale-110" : "bg-muted hover:bg-muted/80"}`}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Колір</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-all ${form.color === c ? "ring-2 ring-offset-1 ring-foreground/40 scale-110" : ""}`}
                      style={{ background: c }} />
                  ))}
                </div>
                {/* Preview */}
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium"
                  style={{ background: form.color }}>
                  <span>{form.icon}</span>{form.name || "Назва групи"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Switch id="is24h" checked={form.is24h} onCheckedChange={v => setForm(f => ({ ...f, is24h: v }))} />
                <Label htmlFor="is24h" className="cursor-pointer text-sm">Цілодобово (24/7)</Label>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Switch id="isMinibar" checked={form.isMinibar} onCheckedChange={v => setForm(f => ({ ...f, isMinibar: v }))} />
                <Label htmlFor="isMinibar" className="cursor-pointer text-sm flex items-center gap-1.5">
                  <Wine className="w-3.5 h-3.5 text-purple-500" />Міні-бар
                </Label>
              </div>
            </div>

            {!form.is24h && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Відкривається</Label>
                  <Input type="time" value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Закривається</Label>
                  <Input type="time" value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} />
                </div>
              </div>
            )}

            {form.isMinibar && (
              <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-700 dark:text-purple-300">
                Міні-бар завжди приймає замовлення (обходить перевірку зміни каси).
                Після 22:00 LiqPay автоматично використовує hold-авторизацію.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
            <Button onClick={() => save.mutate({
              name: form.name, description: form.description || undefined,
              icon: form.icon, color: form.color,
              is24h: form.is24h, openTime: form.openTime, closeTime: form.closeTime,
              isMinibar: form.isMinibar, sortOrder: parseInt(form.sortOrder) || 0,
            })} disabled={!form.name || save.isPending}>
              {save.isPending ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: QR CODES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── QR Card ──────────────────────────────────────────────────────────────────
function QrCard({ table, orgSlug, size, showLabel, fgColor, onDownload, onEdit, onDelete }: {
  table: Table; size: number; showLabel: boolean; fgColor: string;
  orgSlug: string;
  onDownload: (t: Table) => void; onEdit: (t: Table) => void; onDelete: (id: number) => void;
}) {
  const { toast } = useToast();
  const url = buildQrUrl(table.id, orgSlug);
  return (
    <div className="border rounded-xl p-4 bg-card flex flex-col items-center gap-3 group hover:shadow-md transition-shadow relative">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
        <button onClick={() => onEdit(table)} className="p-1 bg-white dark:bg-card border rounded shadow-sm hover:bg-muted"><Pencil className="w-3 h-3 text-muted-foreground" /></button>
        <button onClick={() => onDelete(table.id)} className="p-1 bg-white dark:bg-card border rounded shadow-sm hover:bg-destructive/10 text-destructive"><Trash2 className="w-3 h-3" /></button>
      </div>
      <div className="bg-white p-3 rounded-lg border">
        <QRCodeCanvas value={url} size={size} fgColor={fgColor} bgColor="#FFFFFF" level="M" includeMargin={false} id={`qr-table-${table.id}`} />
      </div>
      {showLabel && (
        <div className="text-center space-y-1">
          <div className="font-bold text-base">{table.number}</div>
          {table.location && <div className="text-xs text-muted-foreground">{table.location}</div>}
          <div className="text-xs text-muted-foreground">{table.capacity} місць</div>
          {table.groupName && (
            <div className="flex justify-center pt-0.5">
              <GroupBadge icon={table.groupIcon || "📍"} name={table.groupName} color={table.groupColor || "#6b7280"} />
            </div>
          )}
        </div>
      )}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
        <button onClick={() => { navigator.clipboard.writeText(url); toast({ title: "URL скопійовано" }); }}
          title="Копіювати URL" className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" title="Відкрити меню"
          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button onClick={() => onDownload(table)} title="Завантажити PNG"
          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Table dialog ─────────────────────────────────────────────────────────────
function TableDialog({ open, onClose, initial, onSave, groups }: {
  open: boolean; onClose: () => void;
  initial?: Partial<Table>; onSave: (d: any) => void;
  groups: TableGroup[];
}) {
  const blank = { number: "", capacity: 2, location: "", groupId: "" };
  const [form, setForm] = useState<any>(blank);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (open) setForm(initial
      ? { ...initial, groupId: initial.groupId ? String(initial.groupId) : "" }
      : { ...blank });
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати стіл" : "Новий стіл / QR-код"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Номер / Назва *</Label>
            <Input value={form.number || ""} onChange={e => set("number", e.target.value)}
              className="mt-1" placeholder="1, VIP-1, Тераса..." autoFocus />
          </div>
          <div>
            <Label>Кількість місць</Label>
            <Input type="number" min="1" max="30" value={form.capacity || 2}
              onChange={e => set("capacity", parseInt(e.target.value) || 2)} className="mt-1" />
          </div>
          <div>
            <Label>Зона / Локація</Label>
            <Input value={form.location || ""} onChange={e => set("location", e.target.value)}
              className="mt-1" placeholder="Основний зал, Тераса, VIP..." />
          </div>
          <div>
            <Label>QR-Група</Label>
            <Select value={form.groupId || "none"} onValueChange={v => set("groupId", v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="— Без групи —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Без групи —</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.icon} {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Спочатку створіть групи у вкладці «Групи»</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => form.number?.trim() && onSave({
            ...form, groupId: form.groupId ? parseInt(form.groupId) : null,
          })} disabled={!form.number?.trim()}>Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── QR Settings panel ────────────────────────────────────────────────────────
function QrSettings({ qrSize, setQrSize, fgColor, setFgColor, showLabel, setShowLabel }: {
  qrSize: number; setQrSize: (v: number) => void;
  fgColor: string; setFgColor: (v: string) => void;
  showLabel: boolean; setShowLabel: (v: boolean) => void;
}) {
  return (
    <div className="border rounded-xl p-4 bg-card space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4" /> Параметри QR</div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Розмір</Label>
          <Select value={String(qrSize)} onValueChange={v => setQrSize(parseInt(v))}>
            <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="100">Малий (100px)</SelectItem>
              <SelectItem value="140">Середній (140px)</SelectItem>
              <SelectItem value="180">Великий (180px)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Колір QR</Label>
          <div className="flex items-center gap-2 mt-1">
            <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)}
              className="h-8 w-10 rounded border cursor-pointer p-0.5" />
            <span className="text-xs text-muted-foreground font-mono">{fgColor}</span>
          </div>
        </div>
        <div>
          <Label className="text-xs">Підпис столу</Label>
          <button onClick={() => setShowLabel(!showLabel)}
            className={`mt-1 h-8 w-full rounded-md border text-xs flex items-center justify-center gap-1.5 transition-colors
              ${showLabel ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {showLabel ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
            {showLabel ? "Показується" : "Приховано"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QR Codes tab ─────────────────────────────────────────────────────────────
function QrCodesTab({ orgSlug }: { orgSlug: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [qrSize, setQrSize] = useState(140);
  const [fgColor, setFgColor] = useState("#1a1a2e");
  const [showLabel, setShowLabel] = useState(true);
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterLoc, setFilterLoc] = useState("all");
  const [tableDialog, setTableDialog] = useState<{ open: boolean; initial?: Partial<Table> }>({ open: false });

  const { data, isLoading } = useQuery({ queryKey: ["fb-tables"], queryFn: () => apiFetch("/tables") });
  const { data: groupsData } = useQuery({ queryKey: ["fb-table-groups"], queryFn: () => apiFetch("/settings/table-groups") });

  const tables: Table[] = (data?.tables || [])
    .filter((t: any) => t.is_active !== false)
    .map((t: any) => ({
      id: t.id,
      number: t.table_number ?? t.number,
      capacity: t.capacity,
      location: t.section ?? t.location,
      status: t.status,
      isActive: t.is_active,
      currentOrderId: t.current_order_id,
      groupId: t.group_id ?? null,
      groupName: t.group_name ?? null,
      groupIcon: t.group_icon ?? null,
      groupColor: t.group_color ?? null,
    }));

  const groups: TableGroup[] = groupsData?.tableGroups || [];

  const saveTable = useMutation({
    mutationFn: (d: any) => d.id
      ? apiFetch(`/tables/${d.id}`, { method: "PATCH", body: JSON.stringify({ number: d.number, capacity: d.capacity, location: d.location, groupId: d.groupId }) })
      : apiFetch("/tables", { method: "POST", body: JSON.stringify({ number: d.number, capacity: d.capacity, location: d.location, groupId: d.groupId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tables"] }); setTableDialog({ open: false }); toast({ title: "Збережено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteTable = useMutation({
    mutationFn: (id: number) => apiFetch(`/tables/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-tables"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  function downloadQr(table: Table) {
    const canvas = document.getElementById(`qr-table-${table.id}`) as HTMLCanvasElement;
    if (!canvas) return;
    const pad = 20; const labelH = showLabel ? 60 : 0;
    const out = document.createElement("canvas");
    out.width = qrSize + pad * 2; out.height = qrSize + pad * 2 + labelH;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    if (showLabel) {
      ctx.fillStyle = "#1a1a2e"; ctx.font = `bold 16px sans-serif`; ctx.textAlign = "center";
      ctx.fillText(table.number, out.width / 2, qrSize + pad + 22);
      const groupLabel = table.groupName || table.location;
      if (groupLabel) { ctx.font = `12px sans-serif`; ctx.fillStyle = "#666"; ctx.fillText(groupLabel, out.width / 2, qrSize + pad + 40); }
    }
    const link = document.createElement("a");
    link.download = `qr-${table.groupName || table.location || "point"}-${table.number}.png`; link.href = out.toDataURL("image/png"); link.click();
  }

  const locations = Array.from(new Set(tables.map(t => t.location).filter(Boolean)));
  const filtered = tables.filter(t => {
    const byGroup = filterGroup === "all" ? true : filterGroup === "none" ? !t.groupId : String(t.groupId) === filterGroup;
    const byLoc = filterLoc === "all" ? true : t.location === filterLoc;
    return byGroup && byLoc;
  });

  const showGroupSections = filterGroup === "all" && groups.length > 0 && viewMode === "grid";
  const ungroupedTables = filtered.filter(t => !t.groupId);
  const groupedSections = groups.map(g => ({ group: g, tables: filtered.filter(t => t.groupId === g.id) })).filter(s => s.tables.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b bg-background shrink-0 no-print flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {groups.length > 0 && (
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <Layers className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі групи ({tables.length})</SelectItem>
                <SelectItem value="none">— Без групи ({tables.filter(t => !t.groupId).length})</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.icon} {g.name} ({tables.filter(t => t.groupId === g.id).length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterLoc} onValueChange={setFilterLoc}>
            <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі зони ({tables.length})</SelectItem>
              {locations.map(l => <SelectItem key={l!} value={l!}>{l} ({tables.filter(t => t.location === l).length})</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex border rounded-md overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`p-1.5 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Grid3X3 className="w-4 h-4" /></button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><List className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" />Друк</Button>
          <Button variant="outline" size="sm" onClick={() => { filtered.forEach((t, i) => setTimeout(() => downloadQr(t), i * 200)); toast({ title: `Завантажується ${filtered.length} QR...` }); }}>
            <Download className="w-4 h-4 mr-1" />Всі
          </Button>
          <Button size="sm" onClick={() => setTableDialog({ open: true })}><Plus className="w-4 h-4 mr-1" />Новий QR</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="no-print"><QrSettings qrSize={qrSize} setQrSize={setQrSize} fgColor={fgColor} setFgColor={setFgColor} showLabel={showLabel} setShowLabel={setShowLabel} /></div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Завантаження...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-xl">
            <QrCode className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-muted-foreground text-sm">QR-кодів ще немає</p>
            <Button className="mt-3" size="sm" onClick={() => setTableDialog({ open: true })}><Plus className="w-4 h-4 mr-1" />Додати перший</Button>
          </div>
        ) : viewMode === "list" ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">QR</th>
                  <th className="text-left px-3 py-2 font-medium">Стіл</th>
                  <th className="text-left px-3 py-2 font-medium">Група</th>
                  <th className="text-left px-3 py-2 font-medium">Зона</th>
                  <th className="text-center px-3 py-2 font-medium">Місць</th>
                  <th className="text-left px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <div className="bg-white p-1 inline-block border rounded">
                        <QRCodeCanvas value={buildQrUrl(t.id, orgSlug)} size={48} fgColor={fgColor} bgColor="#fff" level="H" id={`qr-table-${t.id}`} />
                      </div>
                    </td>
                    <td className="px-3 py-2 font-semibold">{t.number}</td>
                    <td className="px-3 py-2">
                      {t.groupName
                        ? <GroupBadge icon={t.groupIcon || "📍"} name={t.groupName} color={t.groupColor || "#6b7280"} />
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t.location || "—"}</td>
                    <td className="px-3 py-2 text-center">{t.capacity}</td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <span className="text-xs font-mono text-muted-foreground truncate block">{buildQrUrl(t.id, orgSlug)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => downloadQr(t)} className="p-1.5 hover:bg-muted rounded"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => setTableDialog({ open: true, initial: t })} className="p-1.5 hover:bg-muted rounded"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => deleteTable.mutate(t.id)} className="p-1.5 hover:bg-destructive/10 rounded text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : showGroupSections ? (
          <div className="space-y-6">
            {groupedSections.map(({ group, tables: gTables }) => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{group.icon}</span>
                  <span className="font-semibold text-sm">{group.name}</span>
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">{gTables.length} QR</span>
                  {!group.is_24h && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />{group.open_time}–{group.close_time}
                    </span>
                  )}
                  <div className="h-px flex-1 bg-border" />
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                    onClick={() => setTableDialog({ open: true, initial: { groupId: group.id, groupName: group.name, groupIcon: group.icon, groupColor: group.color } })}>
                    <Plus className="w-3 h-3 mr-1" />Додати QR
                  </Button>
                </div>
                <div className="print-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {gTables.map(t => (
                    <div key={t.id} className="qr-card">
                      <QrCard table={t} size={qrSize} showLabel={showLabel} fgColor={fgColor}
                        onDownload={downloadQr} onEdit={t => setTableDialog({ open: true, initial: t })} onDelete={id => deleteTable.mutate(id)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {ungroupedTables.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📋</span>
                  <span className="font-semibold text-sm">Без групи</span>
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">{ungroupedTables.length} QR</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="print-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {ungroupedTables.map(t => (
                    <div key={t.id} className="qr-card">
                      <QrCard table={t} size={qrSize} showLabel={showLabel} fgColor={fgColor}
                        onDownload={downloadQr} onEdit={t => setTableDialog({ open: true, initial: t })} onDelete={id => deleteTable.mutate(id)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="print-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(t => (
              <div key={t.id} className="qr-card">
                <QrCard table={t} orgSlug={orgSlug} size={qrSize} showLabel={showLabel} fgColor={fgColor}
                  onDownload={downloadQr} onEdit={t => setTableDialog({ open: true, initial: t })} onDelete={id => deleteTable.mutate(id)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <TableDialog open={tableDialog.open} initial={tableDialog.initial} groups={groups}
        onClose={() => setTableDialog({ open: false })} onSave={saveTable.mutate} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: OUTLET QR CODES
// ═══════════════════════════════════════════════════════════════════════════════

interface Outlet {
  id: number; name: string; slug: string; icon: string; color: string;
  description?: string; is_active: boolean;
}

function buildOutletQrUrl(slug: string): string {
  return `${window.location.origin}${ROOT_BASE}/room-concierge/guest-menu?outlet=${encodeURIComponent(slug)}`;
}

function OutletQrCard({ outlet, size, fgColor }: {
  outlet: Outlet; size: number; fgColor: string;
}) {
  const { toast } = useToast();
  const url = buildOutletQrUrl(outlet.slug);
  const canvasId = `qr-outlet-${outlet.id}`;

  function downloadQr() {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-outlet-${outlet.slug}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="border rounded-xl p-4 bg-card flex flex-col items-center gap-3 group hover:shadow-md transition-shadow">
      <div className="bg-white p-3 rounded-lg border">
        <QRCodeCanvas value={url} size={size} fgColor={fgColor} bgColor="#FFFFFF" level="M" includeMargin={false} id={canvasId} />
      </div>
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-lg">{outlet.icon}</span>
          <span className="font-bold text-base">{outlet.name}</span>
        </div>
        {outlet.description && <div className="text-xs text-muted-foreground">{outlet.description}</div>}
        <div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${outlet.is_active ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-400"}`}>
            {outlet.is_active ? "Активний" : "Неактивний"}
          </span>
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => { navigator.clipboard.writeText(url); toast({ title: "URL скопійовано" }); }}
          title="Копіювати URL" className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" title="Відкрити меню"
          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button onClick={downloadQr} title="Завантажити PNG"
          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function OutletsQrTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["fb-outlets"],
    queryFn: () => apiFetch("/outlets"),
  });
  const [qrSize, setQrSize] = useState(140);
  const [fgColor, setFgColor] = useState("#1c1917");

  const outlets: Outlet[] = data?.outlets || [];

  return (
    <div className="space-y-4 p-5">
      <div>
        <h3 className="font-semibold text-sm">QR-коди точок продажу</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Розмістіть ці QR-коди у відповідних зонах закладу (ресторан, бар, тераса). Гість сканує і бачить меню своєї зони.
        </p>
      </div>

      <div className="border rounded-xl p-4 bg-card space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4" /> Параметри QR</div>
        <div className="flex items-center gap-6">
          <div>
            <Label className="text-xs">Розмір</Label>
            <Select value={String(qrSize)} onValueChange={v => setQrSize(parseInt(v))}>
              <SelectTrigger className="h-8 mt-1 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="100">Малий (100px)</SelectItem>
                <SelectItem value="140">Середній (140px)</SelectItem>
                <SelectItem value="180">Великий (180px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Колір QR</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)}
                className="h-8 w-10 rounded border cursor-pointer p-0.5" />
              <span className="text-xs text-muted-foreground font-mono">{fgColor}</span>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Завантаження...</div>
      ) : outlets.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-10 text-center text-muted-foreground">
          <Store className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium mb-1">Точок продажу ще немає</p>
          <p className="text-xs mb-4">Спочатку створіть точки продажу у розділі «Ресторан → Точки продажу»</p>
          <Button size="sm" variant="outline" onClick={() => { window.location.href = (import.meta.env.BASE_URL || "/") + "fb/outlets"; }}>
            <Store className="w-4 h-4 mr-1" />Перейти до точок продажу
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {outlets.map(o => (
            <OutletQrCard key={o.id} outlet={o} size={qrSize} fgColor={fgColor} />
          ))}
        </div>
      )}

      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 flex gap-2.5">
        <Store className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-400">
          <span className="font-semibold">Відмінність від QR столів:</span> QR точки продажу — зональний (один на всю зону).
          QR столу — персональний для кожного столу. Обидва відкривають меню у гостя на смартфоні.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function FbQrCodes() {
  const { data: meData, isLoading: isLoadingOrganization, isError: organizationError } = useQuery({
    queryKey: ["me-fb-qr"],
    queryFn: async () => {
      const token = localStorage.getItem("hms_token");
      const response = await fetch(`${ROOT_BASE}/api/organizations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Не вдалося визначити заклад");
      return response.json();
    },
  });
  const orgSlug = meData?.slug || "";

  return (
    <AppLayout>
      <style>{`
        @media print {
          header, nav, aside, [data-sidebar], button, .no-print { display: none !important; }
          .print-grid { display: grid !important; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .qr-card { break-inside: avoid; }
          body { background: white; }
        }
      `}</style>

      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Page header */}
        <div className="px-5 py-4 border-b bg-background shrink-0 no-print">
          <div className="flex items-center gap-3">
            <QrCode className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-bold">QR-меню для столів</h1>
              <p className="text-xs text-muted-foreground">Управління QR-кодами та групами столів</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="qr" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 w-fit shrink-0 no-print">
            <TabsTrigger value="qr" className="gap-1.5">
              <QrCode className="w-3.5 h-3.5" />QR-коди
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" />Групи
            </TabsTrigger>
            <TabsTrigger value="outlets" className="gap-1.5">
              <Store className="w-3.5 h-3.5" />Точки продажу
            </TabsTrigger>
          </TabsList>

          <TabsContent value="qr" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            {organizationError ? (
              <div className="m-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Не вдалося визначити ваш заклад. Оновіть сторінку та увійдіть знову.
              </div>
            ) : isLoadingOrganization || !orgSlug ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Визначаємо заклад і готуємо QR-коди…</div>
            ) : (
              <QrCodesTab orgSlug={orgSlug} />
            )}
          </TabsContent>

          <TabsContent value="groups" className="flex-1 overflow-y-auto mt-0">
            <GroupsTab />
          </TabsContent>

          <TabsContent value="outlets" className="flex-1 overflow-y-auto mt-0">
            <OutletsQrTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
