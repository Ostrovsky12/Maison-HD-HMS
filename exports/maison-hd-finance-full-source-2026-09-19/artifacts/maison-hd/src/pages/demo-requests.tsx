import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { Search, FileText, CheckCircle2, Phone, Mail, Building2, Users, MessageSquare, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";
const getToken = () => localStorage.getItem("hms_token");

interface DemoRequest {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  propertiesCount: number | null;
  message: string | null;
  status: "new" | "contacted" | "demo_scheduled" | "converted" | "declined";
  notes: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Нова", color: "bg-blue-100 text-blue-800 border-blue-200" },
  contacted: { label: "Зв'язались", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  demo_scheduled: { label: "Демо заплановано", color: "bg-purple-100 text-purple-800 border-purple-200" },
  converted: { label: "Конвертовано", color: "bg-green-100 text-green-800 border-green-200" },
  declined: { label: "Відмова", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

export default function DemoRequestsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReq, setSelectedReq] = useState<DemoRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ requests: DemoRequest[] }>({
    queryKey: ["demo-requests"],
    queryFn: async () => {
      const r = await fetch(`${API}/demo-requests`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error("Помилка завантаження");
      return r.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: string; notes: string }) => {
      const r = await fetch(`${API}/demo-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status, notes }),
      });
      if (!r.ok) throw new Error("Помилка оновлення");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-requests"] });
      setSelectedReq(null);
      toast({ title: "Заявку оновлено" });
    },
    onError: (err: any) => {
      toast({ title: "Помилка", description: err.message, variant: "destructive" });
    },
  });

  const allRequests = data?.requests ?? [];
  const filtered = allRequests.filter((r) => {
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      r.company.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = allRequests.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const openDialog = (req: DemoRequest) => {
    setSelectedReq(req);
    setNotes(req.notes || "");
    setNewStatus(req.status);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Demo Заявки</h1>
            <p className="text-muted-foreground mt-1 text-sm">Управління заявками на демонстрацію Maison HD</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Оновити
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
            >
              <div className="text-2xl font-bold">{statusCounts[key] || 0}</div>
              <Badge variant="outline" className={`mt-1.5 text-xs ${color}`}>{label}</Badge>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Пошук за ім'ям, email, компанією..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі статуси</SelectItem>
              {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Заявок не знайдено</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Контакт</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Компанія</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Об'єктів</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Статус</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Дата</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((req) => {
                  const s = STATUS_LABELS[req.status];
                  return (
                    <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{req.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{req.name}</div>
                        <div className="text-muted-foreground text-xs mt-0.5">{req.email}</div>
                        {req.phone && <div className="text-muted-foreground text-xs">{req.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{req.company}</span>
                      </td>
                      <td className="px-4 py-3 text-center">{req.propertiesCount ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${s.color}`}>{s.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(req.createdAt), "d MMM yyyy", { locale: uk })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => openDialog(req)}>
                          Деталі
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedReq} onOpenChange={(o) => !o && setSelectedReq(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Заявка #{selectedReq?.id}</DialogTitle>
          </DialogHeader>
          {selectedReq && (
            <div className="space-y-5">
              {/* Contact info */}
              <div className="rounded-lg bg-muted/30 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedReq.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${selectedReq.email}`} className="hover:text-foreground">{selectedReq.email}</a>
                </div>
                {selectedReq.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${selectedReq.phone}`} className="hover:text-foreground">{selectedReq.phone}</a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{selectedReq.company} · {selectedReq.propertiesCount ?? "?"} об'єктів</span>
                </div>
                {selectedReq.message && (
                  <div className="flex gap-2 text-sm text-muted-foreground mt-3 pt-3 border-t">
                    <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p className="leading-relaxed">{selectedReq.message}</p>
                  </div>
                )}
              </div>

              {/* Status update */}
              <div className="space-y-2">
                <Label>Статус заявки</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Внутрішні нотатки</Label>
                <Textarea
                  rows={3}
                  placeholder="Коментарі для внутрішнього використання..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setSelectedReq(null)}>Скасувати</Button>
                <Button
                  className="gap-2"
                  onClick={() => updateMutation.mutate({ id: selectedReq.id, status: newStatus, notes })}
                  disabled={updateMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Зберегти
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
