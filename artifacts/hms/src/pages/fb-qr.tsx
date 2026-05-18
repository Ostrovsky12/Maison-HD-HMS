import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  QrCode, Download, Printer, Grid3X3, List, Plus, Pencil,
  Trash2, Settings2, CheckCircle2, Copy, ExternalLink, Layers,
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────
const API = "/api/fb";
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
function buildQrUrl(tableId: number): string {
  const base = window.location.origin;
  const rcBase = base + (import.meta.env.BASE_URL || "").replace(/hms\/?$/, "room-concierge");
  return `${rcBase}/guest-menu?tid=${tableId}`;
}

interface TableGroup {
  id: number; name: string; icon: string; color: string; isMinibar: boolean;
}

interface Table {
  id: number; number: string; capacity: number; location?: string;
  status: string; isActive: boolean; currentOrderId?: number;
  groupId?: number | null; groupName?: string; groupIcon?: string; groupColor?: string;
}

// ─── Group badge ──────────────────────────────────────────────────────────────
function GroupBadge({ icon, name, color }: { icon: string; name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white leading-none"
      style={{ backgroundColor: color }}>
      <span>{icon}</span>{name}
    </span>
  );
}

// ─── QR Card component ────────────────────────────────────────────────────────
function QrCard({
  table, size, showLabel, fgColor, onDownload, onEdit, onDelete,
}: {
  table: Table; size: number; showLabel: boolean; fgColor: string;
  onDownload: (table: Table) => void;
  onEdit: (table: Table) => void;
  onDelete: (id: number) => void;
}) {
  const { toast } = useToast();
  const url = buildQrUrl(table.id);

  function copyUrl() {
    navigator.clipboard.writeText(url);
    toast({ title: "URL скопійовано" });
  }

  return (
    <div className="border rounded-xl p-4 bg-card flex flex-col items-center gap-3 group hover:shadow-md transition-shadow relative">
      {/* Edit/delete overlay */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
        <button onClick={() => onEdit(table)} className="p-1 bg-white border rounded shadow-sm hover:bg-muted"><Pencil className="w-3 h-3 text-muted-foreground" /></button>
        <button onClick={() => onDelete(table.id)} className="p-1 bg-white border rounded shadow-sm hover:bg-destructive/10 text-destructive"><Trash2 className="w-3 h-3" /></button>
      </div>

      <div className="bg-white p-3 rounded-lg border">
        <QRCodeCanvas
          value={url}
          size={size}
          fgColor={fgColor}
          bgColor="#FFFFFF"
          level="M"
          includeMargin={false}
          id={`qr-table-${table.id}`}
        />
      </div>

      {showLabel && (
        <div className="text-center space-y-1">
          <div className="font-bold text-base">Стіл {table.number}</div>
          {table.location && <div className="text-xs text-muted-foreground">{table.location}</div>}
          <div className="text-xs text-muted-foreground">{table.capacity} місць</div>
          {table.groupName && (
            <div className="flex justify-center">
              <GroupBadge icon={table.groupIcon || "📍"} name={table.groupName} color={table.groupColor || "#6b7280"} />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
        <button onClick={copyUrl} title="Копіювати URL" className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" title="Відкрити меню" className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button onClick={() => onDownload(table)} title="Завантажити PNG" className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
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
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати стіл" : "Новий стіл"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Номер / Назва столу *</Label>
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
          {groups.length > 0 && (
            <div>
              <Label>QR-Група</Label>
              <Select value={form.groupId || "none"} onValueChange={v => set("groupId", v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Без групи" />
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
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => form.number?.trim() && onSave({
            ...form,
            groupId: form.groupId ? parseInt(form.groupId) : null,
          })} disabled={!form.number?.trim()}>Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────
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
            className={`mt-1 h-8 w-full rounded-md border text-xs flex items-center justify-center gap-1.5 transition-colors ${showLabel ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {showLabel ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
            {showLabel ? "Показується" : "Приховано"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FbQrCodes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [qrSize, setQrSize] = useState(140);
  const [fgColor, setFgColor] = useState("#1a1a2e");
  const [showLabel, setShowLabel] = useState(true);
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterLoc, setFilterLoc] = useState("all");
  const [tableDialog, setTableDialog] = useState<{ open: boolean; initial?: Partial<Table> }>({ open: false });

  const { data, isLoading } = useQuery({
    queryKey: ["fb-tables"],
    queryFn: () => apiFetch("/tables"),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["fb-table-groups"],
    queryFn: () => apiFetch("/settings/table-groups"),
  });

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

  const groups: TableGroup[] = (groupsData?.groups || []).map((g: any) => ({
    id: g.id, name: g.name, icon: g.icon, color: g.color, isMinibar: g.is_minibar,
  }));

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
    const pad = 20;
    const labelH = showLabel ? 60 : 0;
    const out = document.createElement("canvas");
    out.width = qrSize + pad * 2;
    out.height = qrSize + pad * 2 + labelH;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    if (showLabel) {
      ctx.fillStyle = "#1a1a2e";
      ctx.font = `bold 16px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`Стіл ${table.number}`, out.width / 2, qrSize + pad + 22);
      if (table.location) {
        ctx.font = `12px sans-serif`;
        ctx.fillStyle = "#666";
        ctx.fillText(table.location, out.width / 2, qrSize + pad + 40);
      }
    }
    const link = document.createElement("a");
    link.download = `qr-table-${table.number}.png`;
    link.href = out.toDataURL("image/png");
    link.click();
  }

  function downloadAll() {
    filtered.forEach((t, i) => setTimeout(() => downloadQr(t), i * 200));
    toast({ title: `Завантажується ${filtered.length} QR-кодів...` });
  }

  function printAll() { window.print(); }

  const locations = Array.from(new Set(tables.map(t => t.location).filter(Boolean)));

  const filtered = tables.filter(t => {
    const byGroup = filterGroup === "all"
      ? true
      : filterGroup === "none"
        ? !t.groupId
        : String(t.groupId) === filterGroup;
    const byLoc = filterLoc === "all" ? true : t.location === filterLoc;
    return byGroup && byLoc;
  });

  // Group-based sections for grid view when filtering "all" and groups exist
  const showGroupSections = filterGroup === "all" && groups.length > 0 && viewMode === "grid";
  const ungroupedTables = filtered.filter(t => !t.groupId);
  const groupedSections = groups
    .map(g => ({ group: g, tables: filtered.filter(t => t.groupId === g.id) }))
    .filter(s => s.tables.length > 0);

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
        {/* Header */}
        <div className="px-5 py-4 border-b bg-background shrink-0 no-print">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <QrCode className="w-6 h-6 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-bold">QR-меню для столів</h1>
                <p className="text-xs text-muted-foreground">Генерація QR-кодів для гостей — швидкий доступ до меню</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={printAll}><Printer className="w-4 h-4 mr-1" /> Друкувати</Button>
              <Button variant="outline" size="sm" onClick={downloadAll}><Download className="w-4 h-4 mr-1" /> Завантажити всі</Button>
              <Button size="sm" onClick={() => setTableDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Додати стіл</Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Settings */}
          <div className="no-print">
            <QrSettings qrSize={qrSize} setQrSize={setQrSize} fgColor={fgColor} setFgColor={setFgColor} showLabel={showLabel} setShowLabel={setShowLabel} />
          </div>

          {/* Filters & view toggle */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            {/* Group filter */}
            {groups.length > 0 && (
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-48 h-8 text-sm">
                  <Layers className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
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

            {/* Zone filter */}
            <Select value={filterLoc} onValueChange={setFilterLoc}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі зони ({tables.length})</SelectItem>
                {locations.map(l => (
                  <SelectItem key={l!} value={l!}>{l} ({tables.filter(t => t.location === l).length})</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex border rounded-md overflow-hidden ml-auto">
              <button onClick={() => setViewMode("grid")} className={`p-1.5 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Grid3X3 className="w-4 h-4" /></button>
              <button onClick={() => setViewMode("list")} className={`p-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><List className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl">
              <QrCode className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground">Столів ще немає</p>
              <Button className="mt-3" size="sm" onClick={() => setTableDialog({ open: true })}><Plus className="w-4 h-4 mr-1" /> Додати перший стіл</Button>
            </div>
          ) : viewMode === "list" ? (
            /* ── List view ── */
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">QR</th>
                    <th className="text-left px-3 py-2 font-medium">Стіл</th>
                    <th className="text-left px-3 py-2 font-medium">Група</th>
                    <th className="text-left px-3 py-2 font-medium">Зона</th>
                    <th className="text-center px-3 py-2 font-medium">Місць</th>
                    <th className="text-left px-3 py-2 font-medium">URL для гостя</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(t => (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="bg-white p-1 inline-block border rounded">
                          <QRCodeCanvas value={buildQrUrl(t.id)} size={48} fgColor={fgColor} bgColor="#fff" level="M" id={`qr-table-${t.id}`} />
                        </div>
                      </td>
                      <td className="px-3 py-2 font-semibold">Стіл {t.number}</td>
                      <td className="px-3 py-2">
                        {t.groupName
                          ? <GroupBadge icon={t.groupIcon || "📍"} name={t.groupName} color={t.groupColor || "#6b7280"} />
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{t.location || "—"}</td>
                      <td className="px-3 py-2 text-center">{t.capacity}</td>
                      <td className="px-3 py-2 max-w-[200px]">
                        <span className="text-xs font-mono text-muted-foreground truncate block">{buildQrUrl(t.id)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => downloadQr(t)} className="p-1.5 hover:bg-muted rounded" title="Завантажити PNG"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>
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
            /* ── Grid view — grouped sections ── */
            <div className="space-y-6">
              {groupedSections.map(({ group, tables: gTables }) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{group.icon}</span>
                    <span className="font-semibold text-sm">{group.name}</span>
                    <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">{gTables.length} QR</span>
                    <div className="h-px flex-1 bg-border" />
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setTableDialog({ open: true, initial: { groupId: group.id } })}>
                      <Plus className="w-3 h-3 mr-1" /> Додати
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
            /* ── Grid view — flat ── */
            <div className="print-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map(t => (
                <div key={t.id} className="qr-card">
                  <QrCard table={t} size={qrSize} showLabel={showLabel} fgColor={fgColor}
                    onDownload={downloadQr} onEdit={t => setTableDialog({ open: true, initial: t })} onDelete={id => deleteTable.mutate(id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <TableDialog open={tableDialog.open} initial={tableDialog.initial} groups={groups}
        onClose={() => setTableDialog({ open: false })} onSave={saveTable.mutate} />
    </AppLayout>
  );
}
