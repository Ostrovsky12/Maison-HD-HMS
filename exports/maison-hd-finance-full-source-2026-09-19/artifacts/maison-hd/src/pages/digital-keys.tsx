import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Smartphone, Key, CheckCircle2, Clock, XCircle, Plus,
  ShieldCheck, RefreshCw, User, Building2, Ban, Eye, Hash,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api/digital-keys";
const tok = () => localStorage.getItem("hms_token") || "";
const headers = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    active:   { label: "Активний",  className: "bg-green-100 text-green-700",  icon: CheckCircle2 },
    pending:  { label: "Очікування",className: "bg-yellow-100 text-yellow-700",icon: Clock },
    expired:  { label: "Завершений",className: "bg-gray-100 text-gray-600",    icon: XCircle },
    revoked:  { label: "Відкликаний",className: "bg-red-100 text-red-700",     icon: Ban },
  };
  const m = MAP[status] || { label: status, className: "bg-gray-100 text-gray-600", icon: Key };
  const Icon = m.icon;
  return <Badge className={`gap-1 ${m.className}`}><Icon size={10} />{m.label}</Badge>;
}

function CheckinBadge({ status }: { status: string }) {
  const MAP: Record<string, { label: string; className: string }> = {
    pending:  { label: "Очікує",   className: "bg-yellow-100 text-yellow-700" },
    approved: { label: "Підтверджено", className: "bg-green-100 text-green-700" },
    rejected: { label: "Відхилено", className: "bg-red-100 text-red-700" },
  };
  const m = MAP[status] || { label: status, className: "bg-gray-100 text-gray-600" };
  return <Badge className={`${m.className}`}>{m.label}</Badge>;
}

const EMPTY_KEY_FORM = {
  guestName: "", guestEmail: "", guestPhone: "",
  unitName: "", validFrom: "", validUntil: "", checkinType: "traditional", notes: "",
};

export default function DigitalKeysPage() {
  const [tab, setTab] = useState("keys");
  const [keys, setKeys] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [keyModal, setKeyModal] = useState(false);
  const [keyForm, setKeyForm] = useState<any>(EMPTY_KEY_FORM);
  const [savingKey, setSavingKey] = useState(false);

  const [pinModal, setPinModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [kRes, cRes, sRes] = await Promise.all([
        fetch(`${API}/keys`, { headers: headers() }),
        fetch(`${API}/checkins`, { headers: headers() }),
        fetch(`${API}/stats`, { headers: headers() }),
      ]);
      const [k, c, s] = await Promise.all([kRes.json(), cRes.json(), sRes.json()]);
      setKeys(Array.isArray(k) ? k : []);
      setCheckins(Array.isArray(c) ? c : []);
      setStats(s);
    } catch { toast({ title: "Помилка завантаження", variant: "destructive" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreateKey() {
    if (!keyForm.guestName || !keyForm.validFrom || !keyForm.validUntil) return;
    setSavingKey(true);
    try {
      const res = await fetch(`${API}/keys`, {
        method: "POST", headers: headers(), body: JSON.stringify(keyForm),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Ключ створено" });
      setKeyModal(false);
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
    setSavingKey(false);
  }

  async function handleRevoke(id: number) {
    if (!confirm("Відкликати цей ключ?")) return;
    try {
      await fetch(`${API}/keys/${id}`, {
        method: "PATCH", headers: headers(), body: JSON.stringify({ status: "revoked" }),
      });
      toast({ title: "Ключ відкликано" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  async function handleCheckinAction(id: number, status: string) {
    try {
      await fetch(`${API}/checkins/${id}`, {
        method: "PATCH", headers: headers(), body: JSON.stringify({ status }),
      });
      toast({ title: status === "approved" ? "Check-in підтверджено" : "Check-in відхилено" });
      load();
    } catch { toast({ title: "Помилка", variant: "destructive" }); }
  }

  const pendingCheckins = checkins.filter(c => c.status === "pending");

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Digital Key & Mobile Check-in</h1>
            <p className="text-muted-foreground text-sm">Цифрові ключі та онлайн реєстрація гостей</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} className="mr-1" /> Оновити</Button>
            <Button size="sm" onClick={() => { setKeyForm(EMPTY_KEY_FORM); setKeyModal(true); }}>
              <Plus size={14} className="mr-1" /> Видати ключ
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Всього ключів</p>
                <p className="text-2xl font-bold">{stats.totalKeys}</p>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Активних</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeKeys}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Mobile check-in</p>
                <p className="text-2xl font-bold text-blue-600">{stats.mobileCheckins}</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-200">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Очікує підтв.</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingCheckins}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Підтверджено</p>
                <p className="text-2xl font-bold text-green-600">{stats.approvedCheckins}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Pending check-ins alert */}
        {pendingCheckins.length > 0 && (
          <Card className="border-yellow-300 bg-yellow-50">
            <CardContent className="p-3 flex items-center gap-2">
              <Clock size={16} className="text-yellow-600" />
              <p className="text-sm text-yellow-800 font-medium">
                {pendingCheckins.length} {pendingCheckins.length === 1 ? "запит на" : "запити на"} mobile check-in очікує підтвердження
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="keys">
              <Key size={13} className="mr-1" /> Цифрові ключі
            </TabsTrigger>
            <TabsTrigger value="checkins">
              <Smartphone size={13} className="mr-1" /> Mobile Check-in
              {pendingCheckins.length > 0 && (
                <Badge className="ml-1 bg-yellow-500 text-white text-xs px-1.5 py-0">{pendingCheckins.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Keys list ── */}
          <TabsContent value="keys" className="mt-4">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground">Завантаження...</div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Гість</TableHead>
                      <TableHead>Номер</TableHead>
                      <TableHead>PIN</TableHead>
                      <TableHead>Дійсний</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Дії</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map(key => (
                      <TableRow key={key.id}>
                        <TableCell>
                          <div className="font-medium">{key.guestName}</div>
                          {key.guestEmail && <div className="text-xs text-muted-foreground">{key.guestEmail}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Building2 size={13} className="text-muted-foreground" />
                            {key.unitName || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="font-mono text-xs"
                            onClick={() => { setSelectedKey(key); setPinModal(true); }}>
                            <Hash size={11} className="mr-1" /> ••••
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{format(new Date(key.validFrom), "d MMM", { locale: uk })}</div>
                          <div className="text-muted-foreground">→ {format(new Date(key.validUntil), "d MMM yyyy", { locale: uk })}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {key.isMobileCheckin ? "Mobile" : "Традиційний"}
                          </Badge>
                        </TableCell>
                        <TableCell><StatusBadge status={key.status} /></TableCell>
                        <TableCell className="text-right">
                          {key.status === "active" && (
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600"
                              onClick={() => handleRevoke(key.id)}>
                              <Ban size={13} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {keys.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-10">Немає ключів</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Mobile check-ins ── */}
          <TabsContent value="checkins" className="mt-4">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Гість</TableHead>
                    <TableHead>Документ</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Прохання</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата подачі</TableHead>
                    <TableHead className="text-right">Дії</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkins.map(ci => (
                    <TableRow key={ci.id}>
                      <TableCell>
                        <div className="font-medium">{ci.guestName}</div>
                        {ci.guestEmail && <div className="text-xs text-muted-foreground">{ci.guestEmail}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ci.idDocumentType && (
                          <div>{ci.idDocumentType === "passport" ? "Паспорт" : "ID карта"}</div>
                        )}
                        {ci.idDocumentNumber && <div className="text-muted-foreground font-mono text-xs">{ci.idDocumentNumber}</div>}
                      </TableCell>
                      <TableCell>{ci.eta || "—"}</TableCell>
                      <TableCell className="max-w-[200px] text-sm">
                        <p className="truncate">{ci.specialRequests || "—"}</p>
                      </TableCell>
                      <TableCell><CheckinBadge status={ci.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(ci.submittedAt), "d MMM HH:mm", { locale: uk })}
                      </TableCell>
                      <TableCell className="text-right">
                        {ci.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleCheckinAction(ci.id, "approved")}>
                              <CheckCircle2 size={13} className="mr-1" /> Підтвердити
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-500"
                              onClick={() => handleCheckinAction(ci.id, "rejected")}>
                              <XCircle size={13} />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {checkins.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                        Немає записів mobile check-in
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Create key modal ── */}
      <Dialog open={keyModal} onOpenChange={setKeyModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Видати цифровий ключ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Ім'я гостя *</Label>
              <Input placeholder="Іван Петренко" value={keyForm.guestName} onChange={e => setKeyForm({ ...keyForm, guestName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input placeholder="guest@email.com" value={keyForm.guestEmail} onChange={e => setKeyForm({ ...keyForm, guestEmail: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Телефон</Label>
                <Input placeholder="+380..." value={keyForm.guestPhone} onChange={e => setKeyForm({ ...keyForm, guestPhone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Номер / Котедж</Label>
              <Input placeholder="Котедж №3" value={keyForm.unitName} onChange={e => setKeyForm({ ...keyForm, unitName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Дата заїзду *</Label>
                <Input type="datetime-local" value={keyForm.validFrom} onChange={e => setKeyForm({ ...keyForm, validFrom: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Дата виїзду *</Label>
                <Input type="datetime-local" value={keyForm.validUntil} onChange={e => setKeyForm({ ...keyForm, validUntil: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Тип реєстрації</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={keyForm.checkinType} onChange={e => setKeyForm({ ...keyForm, checkinType: e.target.value })}>
                <option value="traditional">Традиційний</option>
                <option value="mobile">Mobile Check-in</option>
                <option value="self">Self Check-in</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Нотатки</Label>
              <Input placeholder="Особливі побажання..." value={keyForm.notes} onChange={e => setKeyForm({ ...keyForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyModal(false)}>Скасувати</Button>
            <Button onClick={handleCreateKey} disabled={savingKey || !keyForm.guestName || !keyForm.validFrom || !keyForm.validUntil}>
              {savingKey ? "Генерація..." : "Видати ключ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PIN reveal modal ── */}
      <Dialog open={pinModal} onOpenChange={setPinModal}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-500" />
              Код доступу
            </DialogTitle>
          </DialogHeader>
          {selectedKey && (
            <div className="py-4 space-y-3 text-center">
              <p className="text-muted-foreground text-sm">{selectedKey.guestName}</p>
              <p className="text-4xl font-bold tracking-[0.3em] font-mono text-blue-600">{selectedKey.pinCode}</p>
              <p className="text-xs text-muted-foreground font-mono break-all bg-gray-50 rounded p-2">
                {selectedKey.qrPayload}
              </p>
              <p className="text-xs text-muted-foreground">
                Дійсний: {format(new Date(selectedKey.validFrom), "d MMM", { locale: uk })} —{" "}
                {format(new Date(selectedKey.validUntil), "d MMM yyyy", { locale: uk })}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setPinModal(false)}>Закрити</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
