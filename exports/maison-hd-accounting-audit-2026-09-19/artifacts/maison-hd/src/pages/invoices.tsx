import { useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  FileText,
  Plus,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  CreditCard,
  Search,
  Filter,
} from "lucide-react";
import {
  useListInvoices,
  useCreateInvoice,
  usePayInvoice,
  getListInvoicesQueryKey,
  InvoiceStatus,
  InvoiceInvoiceType,
  PayInvoiceRequestPaymentMethod,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  draft: "Чернетка",
  pending: "Очікує оплати",
  paid: "Сплачено",
  overdue: "Прострочено",
  cancelled: "Скасовано",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const TYPE_LABELS: Record<string, string> = {
  accommodation: "Проживання",
  service: "Послуга",
  addon: "Додаткова послуга",
  deposit: "Завдаток",
  other: "Інше",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Готівка",
  card: "Картка",
  bank_transfer: "Банківський переказ",
  liqpay: "LiqPay",
  other: "Інше",
};

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount == null) return "0 ₴";
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    minimumFractionDigits: 0,
  }).format(Number(amount));
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateInvoiceDialog({ open, onClose, onSuccess }: CreateInvoiceDialogProps) {
  const [amount, setAmount] = useState("");
  const [invoiceType, setInvoiceType] = useState("accommodation");
  const [description, setDescription] = useState("");
  const createMutation = useCreateInvoice();

  const handleSubmit = () => {
    if (!amount) return;
    createMutation.mutate(
      {
        data: {
          amount: parseFloat(amount),
          invoiceType: invoiceType as InvoiceInvoiceType,
          description: description || undefined,
        },
      },
      {
        onSuccess: () => {
          onSuccess();
          onClose();
          setAmount("");
          setDescription("");
          setInvoiceType("accommodation");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Створити рахунок</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Тип рахунку</Label>
            <Select value={invoiceType} onValueChange={setInvoiceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Сума (₴)</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Опис</Label>
            <Input
              placeholder="Опис рахунку..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={!amount || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Створити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PayInvoiceDialogProps {
  invoice: any;
  onClose: () => void;
  onSuccess: () => void;
}

function PayInvoiceDialog({ invoice, onClose, onSuccess }: PayInvoiceDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const payMutation = usePayInvoice();

  const handlePay = () => {
    payMutation.mutate(
      {
        invoiceId: invoice.id,
        data: { paymentMethod: paymentMethod as PayInvoiceRequestPaymentMethod },
      },
      {
        onSuccess: () => {
          onSuccess();
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={!!invoice} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Прийняти оплату</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Рахунок #{invoice.invoiceNumber}</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(invoice.amount)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Спосіб оплати</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handlePay} disabled={payMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {payMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Підтвердити оплату
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: invoices, isLoading } = useListInvoices({});

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    toast({ title: "Успішно", description: "Рахунок оновлено" });
  };

  const filtered = (invoices || []).filter((inv) => {
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchSearch = !search || 
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.description?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalPending = (invoices || []).filter(i => i.status === "pending").length;
  const totalPaid = (invoices || []).filter(i => i.status === "paid").length;
  const totalOverdue = (invoices || []).filter(i => i.status === "overdue").length;
  const totalRevenue = (invoices || [])
    .filter(i => i.status === "paid")
    .reduce((sum, i) => sum + parseFloat(String(i.paidAmount || 0)), 0);

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Рахунки</h1>
            <p className="text-muted-foreground mt-1">Управління рахунками та оплатами</p>
          </div>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Новий рахунок
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Очікують</p>
                  <p className="text-xl font-bold">{totalPending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Сплачено</p>
                  <p className="text-xl font-bold">{totalPaid}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Прострочено</p>
                  <p className="text-xl font-bold">{totalOverdue}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Виручка</p>
                  <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Пошук за номером або описом..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Всі статуси" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі статуси</SelectItem>
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Invoice List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="text-muted-foreground">Рахунків не знайдено</p>
            <Button className="mt-4 gap-2" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Створити перший рахунок
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((invoice) => (
              <Card key={invoice.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-primary/10 rounded-lg">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{invoice.invoiceNumber}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[invoice.status]}`}>
                            {STATUS_LABELS[invoice.status] || invoice.status}
                          </span>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {TYPE_LABELS[invoice.invoiceType] || invoice.invoiceType}
                          </span>
                        </div>
                        {invoice.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{invoice.description}</p>
                        )}
                        {invoice.guestName && (
                          <p className="text-xs text-muted-foreground">Гість: {invoice.guestName}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(invoice.createdAt), "d MMM yyyy, HH:mm", { locale: uk })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xl font-bold">{formatCurrency(invoice.amount)}</p>
                        {invoice.paidAmount && invoice.paidAmount !== "0.00" && (
                          <p className="text-xs text-emerald-600">Сплачено: {formatCurrency(invoice.paidAmount)}</p>
                        )}
                        {invoice.paymentMethod && (
                          <p className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[invoice.paymentMethod]}</p>
                        )}
                      </div>
                      {invoice.status === "pending" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                          onClick={() => setPayTarget(invoice)}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Оплатити
                        </Button>
                      )}
                      {invoice.status === "paid" && (
                        <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          Сплачено
                        </div>
                      )}
                      {invoice.status === "overdue" && (
                        <div className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
                          <AlertCircle className="w-4 h-4" />
                          Прострочено
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateInvoiceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleSuccess}
      />

      {payTarget && (
        <PayInvoiceDialog
          invoice={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => {
            handleSuccess();
            setPayTarget(null);
          }}
        />
      )}
    </AppLayout>
  );
}
