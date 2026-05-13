import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Plus, Pencil, Trash2, Loader2, Search, Mail, Phone,
  KeyRound, Eye, EyeOff, UserCheck, UserX, Send,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { uk } from "date-fns/locale";

const API = "/api/fb/access";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const POS_COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", orange: "bg-orange-100 text-orange-800",
  slate: "bg-slate-100 text-slate-700",
};

// ─── Staff Dialog ─────────────────────────────────────────────────────────────
function StaffDialog({ open, onClose, initial, positions }: {
  open: boolean; onClose: () => void; initial?: any; positions: any[];
}) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [login, setLogin] = useState(initial?.login || initial?.email || "");
  const [pin, setPin] = useState(initial?.pin_plain || "");
  const [positionId, setPositionId] = useState(String(initial?.position_id || ""));
  const [showPin, setShowPin] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => {
      const body: any = { name, phone: phone || null, login: login || null, email: login || null, position_id: positionId ? parseInt(positionId) : null };
      if (pin !== (initial?.pin_plain || "")) body.pin = pin || null;
      if (initial?.id) return apiFetch(`/staff/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch("/staff", { method: "POST", body: JSON.stringify({ ...body, pin: pin || null, role: "waiter" }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-staff-access"] }); toast({ title: "Збережено" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial?.id ? "Редагувати працівника" : "Новий працівник"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>ПІБ *</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Телефон</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380..." className="mt-1" /></div>
            <div><Label>Логін (email)</Label><Input value={login} onChange={e => setLogin(e.target.value)} type="email" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ПІН-код</Label>
              <div className="relative mt-1">
                <Input type={showPin ? "text" : "password"} value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="0000" maxLength={6} className="pr-8" />
                <button type="button" onClick={() => setShowPin(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Посада</Label>
              <select value={positionId} onChange={e => setPositionId(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
                <option value="">— без посади —</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite Dialog ─────────────────────────────────────────────────────────────
function InviteDialog({ open, onClose, positions }: { open: boolean; onClose: () => void; positions: any[] }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [positionId, setPositionId] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const invite = useMutation({
    mutationFn: () => apiFetch("/invitations", {
      method: "POST",
      body: JSON.stringify({ email, name: name || email, position_id: positionId ? parseInt(positionId) : null }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-invitations"] }); toast({ title: "Запрошення надіслано" }); onClose(); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Надіслати запрошення</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Email *</Label><Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="worker@example.com" className="mt-1" /></div>
          <div><Label>Ім'я</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
          <div>
            <Label>Посада</Label>
            <select value={positionId} onChange={e => setPositionId(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background">
              <option value="">— без посади —</option>
              {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={() => invite.mutate()} disabled={!email.trim() || invite.isPending}>
            {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />} Надіслати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function FbStaffAccess() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fb-staff-access"],
    queryFn: () => apiFetch("/staff"),
  });
  const { data: invData } = useQuery({
    queryKey: ["fb-invitations"],
    queryFn: () => apiFetch("/invitations"),
  });
  const { data: posData } = useQuery({
    queryKey: ["fb-positions"],
    queryFn: () => apiFetch("/positions"),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-staff-access"] }); toast({ title: "Видалено" }); },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, val }: { id: number; val: boolean }) =>
      apiFetch(`/staff/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: val }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-staff-access"] }),
  });

  const staff: any[] = (data?.staff || []).filter((s: any) =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.login?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  );
  const invitations: any[] = invData?.invitations || [];
  const positions: any[] = posData?.positions || [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-slate-600" />
              <div>
                <h1 className="text-lg font-bold">Працівники</h1>
                <p className="text-xs text-muted-foreground">{(data?.staff || []).length} працівників</p>
              </div>
            </div>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Додати
            </Button>
          </div>
        </div>

        <Tabs defaultValue="staff" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b bg-background">
            <TabsList className="h-9 gap-1 bg-transparent p-0">
              <TabsTrigger value="staff" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-3 h-9 text-sm">
                Працівники
              </TabsTrigger>
              <TabsTrigger value="invitations" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-3 h-9 text-sm">
                Запрошення {invitations.length > 0 && <span className="ml-1 bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">{invitations.length}</span>}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ─── Staff tab ─────────────────────────────────────────────────── */}
          <TabsContent value="staff" className="flex-1 overflow-auto m-0">
            <div className="px-6 py-3 border-b">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Швидкий пошук..." value={search}
                  onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b sticky top-0">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Ім'я</th>
                    <th className="text-left px-4 py-3 font-medium">Телефон</th>
                    <th className="text-left px-4 py-3 font-medium">Логін</th>
                    <th className="text-center px-4 py-3 font-medium">ПІН-код</th>
                    <th className="text-left px-4 py-3 font-medium">Посада</th>
                    <th className="text-left px-4 py-3 font-medium">Останній вхід</th>
                    <th className="text-right px-4 py-3 font-medium">Дії</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {staff.map((s: any) => {
                    const lastLogin = s.last_login_at ? parseISO(s.last_login_at) : null;
                    return (
                      <tr key={s.id} className={`hover:bg-muted/20 ${!s.is_active ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3 font-medium">{s.name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{s.phone || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{s.login || s.email || "—"}</td>
                        <td className="px-4 py-3 text-center font-mono font-medium">{s.pin_plain || "—"}</td>
                        <td className="px-4 py-3">
                          {s.position_name ? (
                            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${POS_COLOR_MAP[s.position_color] || "bg-slate-100 text-slate-700"}`}>
                              {s.position_name}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {lastLogin ? format(lastLogin, "d MMMM, HH:mm", { locale: uk }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => toggleActive.mutate({ id: s.id, val: !s.is_active })}
                              className="p-1.5 text-muted-foreground hover:text-primary rounded"
                              title={s.is_active ? "Деактивувати" : "Активувати"}>
                              {s.is_active ? <UserCheck className="w-4 h-4 text-green-600" /> : <UserX className="w-4 h-4" />}
                            </button>
                            <button onClick={() => { setEditing(s); setDialogOpen(true); }}
                              className="p-1.5 text-muted-foreground hover:text-primary rounded">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => del.mutate(s.id)}
                              className="p-1.5 text-muted-foreground hover:text-destructive rounded">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {staff.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Працівників не знайдено</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </TabsContent>

          {/* ─── Invitations tab ──────────────────────────────────────────── */}
          <TabsContent value="invitations" className="flex-1 overflow-auto m-0">
            <div className="px-6 py-3 border-b flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                <Send className="w-3.5 h-3.5 mr-1" /> Надіслати запрошення
              </Button>
            </div>
            {invitations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Mail className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="font-medium">Запрошень немає</p>
                <p className="text-sm text-muted-foreground mt-1">Надішліть запрошення новому працівнику на email</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b sticky top-0">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Ім'я</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Роль</th>
                    <th className="text-left px-4 py-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invitations.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{inv.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.role}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Очікується</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <StaffDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} initial={editing} positions={positions} />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} positions={positions} />
    </AppLayout>
  );
}
