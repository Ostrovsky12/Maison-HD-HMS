import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Printer, Search, Check, X,
  Building2, Banknote, Eye, Pencil, Trash2,
  AlertCircle, ArrowRight, RefreshCw,
} from "lucide-react";

// ─── API helper ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || err.error || r.statusText);
  }
  return r.json();
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface LegalEntity {
  id: number; name: string; shortName?: string; fullName?: string; type: string;
  edrpou?: string; ipn?: string; vatNumber?: string; isVatPayer?: boolean;
  iban?: string; bank?: string; mfo?: string; director?: string; accountant?: string;
  phone?: string; email?: string; legalAddress?: string; actualAddress?: string;
}

interface Counterparty {
  id?: number; name: string; shortName?: string; edrpou?: string; ipn?: string;
  vatNumber?: string; isVatPayer?: boolean; legalAddress?: string; iban?: string;
  bankName?: string; bankMfo?: string; director?: string; accountant?: string;
}

interface InvoiceCounterparty {
  name: string; edrpou?: string; vatNumber?: string; address?: string;
  legalEntityId?: number; invoiceCount: number; totalAmount: number;
}

interface DocumentItem {
  id?: number; description: string; unit: string; quantity: number;
  unitPrice: number; vatRate: string; vatAmount: number; totalPrice: number;
}

interface Act {
  id: number; docNumber: string; docDate: string; status: string;
  counterpartyName?: string; counterpartyEdrpou?: string; subject?: string;
  subtotal: string; vatAmount: string; totalAmount: string; paidAmount: string;
  legalEntityId?: number; counterpartyId?: number; bookingId?: number;
  currency: string; notes?: string; signedAt?: string; paidAt?: string;
  legalEntityName?: string;
}

interface Invoice {
  id: number; invoiceNumber: string; status: string; amount: string;
  counterpartyName?: string; counterpartyEdrpou?: string; description?: string;
  buyerAddress?: string; buyerVatNumber?: string;
  subtotal?: string; vatAmount?: string; taxAmount?: string;
  legalEntityId?: number; currency: string; createdAt: string; paidAt?: string;
  invoiceItems?: any[]; sellerSnapshot?: any; notes?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: string | number, currency = "UAH") {
  const v = parseFloat(String(n || 0));
  return v.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft:   { label: "Чернетка",  variant: "outline" },
    issued:  { label: "Виставлено", variant: "secondary" },
    sent:    { label: "Надіслано",  variant: "secondary" },
    signed:  { label: "Підписано",  variant: "default" },
    paid:    { label: "Оплачено",   variant: "default" },
    cancelled: { label: "Анульовано", variant: "destructive" },
  };
  const m = map[s] || { label: s, variant: "outline" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

// ─── Number to words (Ukrainian) ─────────────────────────────────────────────

function numberToUah(amount: number): string {
  const ones = ["", "одна", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять",
    "десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять",
    "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"];
  const tens = ["", "", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят", "сімдесят", "вісімдесят", "дев'яносто"];
  const hundreds = ["", "сто", "двісті", "триста", "чотириста", "п'ятсот", "шістсот", "сімсот", "вісімсот", "дев'ятсот"];
  const thousands = ["тисяча", "тисячі", "тисяч"];

  function decl(n: number, forms: string[]) {
    const n10 = n % 10, n100 = n % 100;
    if (n100 >= 11 && n100 <= 19) return forms[2];
    if (n10 === 1) return forms[0];
    if (n10 >= 2 && n10 <= 4) return forms[1];
    return forms[2];
  }

  function threeDigits(n: number, isThou = false): string {
    const h = Math.floor(n / 100);
    const t = n % 100;
    const parts: string[] = [];
    if (h) parts.push(hundreds[h]);
    if (t < 20) {
      if (t > 0) {
        if (isThou && t === 1) parts.push("одна");
        else if (isThou && t === 2) parts.push("дві");
        else parts.push(ones[t]);
      }
    } else {
      parts.push(tens[Math.floor(t / 10)]);
      if (t % 10) {
        if (isThou && t % 10 === 1) parts.push("одна");
        else if (isThou && t % 10 === 2) parts.push("дві");
        else parts.push(ones[t % 10]);
      }
    }
    return parts.filter(Boolean).join(" ");
  }

  const rounded = Math.round(amount * 100) / 100;
  const intPart = Math.floor(rounded);
  const kopPart = Math.round((rounded - intPart) * 100);

  let result = "";
  const thou = Math.floor(intPart / 1000);
  const rest = intPart % 1000;

  if (thou > 0) {
    result += threeDigits(thou, true) + " " + decl(thou % 10 === 0 ? 0 : thou % 100 >= 11 && thou % 100 <= 19 ? 5 : thou % 10, thousands) + " ";
  }
  if (rest > 0) {
    result += threeDigits(rest);
  } else if (thou === 0) {
    result = "нуль";
  }

  const kopStr = kopPart.toString().padStart(2, "0");
  return (result.trim() + " гривень " + kopStr + " копійок").replace(/\s+/g, " ").trim();
}

// ─── Print template ───────────────────────────────────────────────────────────

function ActPrintView({
  act, items, legalEntity, counterparty,
}: {
  act: Act;
  items: DocumentItem[];
  legalEntity?: LegalEntity | null;
  counterparty?: Counterparty | null;
}) {
  const total = parseFloat(act.totalAmount || "0");
  const vat = parseFloat(act.vatAmount || "0");
  const sub = parseFloat(act.subtotal || "0");
  const hasVat = vat > 0;

  return (
    <div className="act-print font-serif text-[12px] leading-snug text-black bg-white p-8 min-h-[297mm]" style={{ fontFamily: "Times New Roman, serif" }}>
      <style>{`
        @media print {
          .act-print { font-size: 12pt !important; }
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        .act-print table { border-collapse: collapse; width: 100%; }
        .act-print td, .act-print th { border: 1px solid #000; padding: 4px 6px; }
        .act-print .sig-line { border-top: 1px solid #000; margin-top: 2px; min-width: 120px; display: inline-block; }
      `}</style>

      {/* Title */}
      <div className="text-center mb-4">
        <div className="font-bold text-[14px] uppercase">АКТ №&nbsp;{act.docNumber}</div>
        <div className="font-bold">приймання-передачі наданих послуг</div>
        <div>від&nbsp;{act.docDate ? new Date(act.docDate).toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" }) : "____"}&nbsp;р.</div>
      </div>

      {/* Parties */}
      <table className="mb-4 text-[11px]" style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", verticalAlign: "top", border: "none", paddingRight: 12 }}>
              <div className="font-bold mb-1 uppercase">Виконавець:</div>
              <div><b>Назва:</b> {legalEntity?.name || "___________________"}</div>
              {legalEntity?.edrpou && <div><b>ЄДРПОУ:</b> {legalEntity.edrpou}</div>}
              {legalEntity?.ipn && <div><b>ІПН:</b> {legalEntity.ipn}</div>}
              {(legalEntity?.isVatPayer && legalEntity?.vatNumber) && <div><b>Свід. ПДВ:</b> {legalEntity.vatNumber}</div>}
              {(legalEntity?.legalAddress || legalEntity?.actualAddress) && <div><b>Адреса:</b> {legalEntity.legalAddress || legalEntity.actualAddress}</div>}
              {legalEntity?.iban && <div><b>IBAN:</b> {legalEntity.iban}</div>}
              {legalEntity?.bank && <div><b>Банк:</b> {legalEntity.bank}{legalEntity.mfo ? `, МФО ${legalEntity.mfo}` : ""}</div>}
            </td>
            <td style={{ width: "50%", verticalAlign: "top", border: "none", paddingLeft: 12 }}>
              <div className="font-bold mb-1 uppercase">Замовник:</div>
              <div><b>Назва:</b> {counterparty?.name || act.counterpartyName || "___________________"}</div>
              {(counterparty?.edrpou || act.counterpartyEdrpou) && <div><b>ЄДРПОУ:</b> {counterparty?.edrpou || act.counterpartyEdrpou}</div>}
              {counterparty?.ipn && <div><b>ІПН:</b> {counterparty.ipn}</div>}
              {(counterparty?.isVatPayer && counterparty?.vatNumber) && <div><b>Свід. ПДВ:</b> {counterparty.vatNumber}</div>}
              {counterparty?.legalAddress && <div><b>Адреса:</b> {counterparty.legalAddress}</div>}
              {counterparty?.iban && <div><b>IBAN:</b> {counterparty.iban}</div>}
              {counterparty?.bankName && <div><b>Банк:</b> {counterparty.bankName}{counterparty.bankMfo ? `, МФО ${counterparty.bankMfo}` : ""}</div>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Subject */}
      <div className="mb-3 text-[11px]">
        <b>Предмет:</b> {act.subject || "надані послуги згідно договору"}
      </div>

      {/* Items table */}
      <table className="mb-3 text-[10px]">
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <th style={{ width: "4%" }}>№</th>
            <th style={{ width: "34%" }}>Найменування послуги</th>
            <th style={{ width: "8%" }}>Од. вим.</th>
            <th style={{ width: "7%" }}>К-сть</th>
            <th style={{ width: "12%" }}>Ціна без ПДВ</th>
            <th style={{ width: "12%" }}>Сума без ПДВ</th>
            <th style={{ width: "7%" }}>ПДВ%</th>
            <th style={{ width: "8%" }}>ПДВ</th>
            <th style={{ width: "8%" }}>Разом</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const qty = parseFloat(String(item.quantity || 1));
            const price = parseFloat(String(item.unitPrice || 0));
            const vatAmt = parseFloat(String(item.vatAmount || 0));
            const total = parseFloat(String(item.totalPrice || 0));
            const vatR = item.vatRate === "exempt" ? "Без ПДВ" : `${item.vatRate}%`;
            return (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td>{item.description}</td>
                <td className="text-center">{item.unit}</td>
                <td className="text-center">{qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(3)}</td>
                <td className="text-right">{price.toFixed(2)}</td>
                <td className="text-right">{(price * qty).toFixed(2)}</td>
                <td className="text-center">{vatR}</td>
                <td className="text-right">{vatAmt.toFixed(2)}</td>
                <td className="text-right">{total.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="text-right font-bold">Усього без ПДВ:</td>
            <td className="text-right font-bold">{sub.toFixed(2)}</td>
            <td />
            <td colSpan={2} />
          </tr>
          {hasVat && (
            <tr>
              <td colSpan={5} className="text-right font-bold">ПДВ 20%:</td>
              <td />
              <td />
              <td className="text-right font-bold">{vat.toFixed(2)}</td>
              <td />
            </tr>
          )}
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <td colSpan={5} className="text-right font-bold">РАЗОМ{hasVat ? " з ПДВ" : ""}:</td>
            <td />
            <td />
            <td />
            <td className="text-right font-bold">{total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Sum in words */}
      <div className="mb-4 text-[11px]">
        <b>Сума прописом:</b> {numberToUah(total).replace(/^./, (c) => c.toUpperCase())}
      </div>

      {/* Signatures */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", border: "none", verticalAlign: "top", paddingRight: 12 }}>
              <div className="font-bold uppercase mb-2">Виконавець</div>
              <div className="text-[11px] mb-1">
                {legalEntity?.director ? (
                  <span>Директор: <span className="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
                ) : (
                  <span>Підпис: <span className="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
                )}
              </div>
              {legalEntity?.director && <div className="text-[11px]">({legalEntity.director})</div>}
              <div className="mt-2 text-[10px]">М.П.</div>
            </td>
            <td style={{ width: "50%", border: "none", verticalAlign: "top", paddingLeft: 12 }}>
              <div className="font-bold uppercase mb-2">Замовник</div>
              <div className="text-[11px] mb-1">
                {counterparty?.director ? (
                  <span>Директор: <span className="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
                ) : (
                  <span>Підпис: <span className="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
                )}
              </div>
              {counterparty?.director && <div className="text-[11px]">({counterparty.director})</div>}
              <div className="mt-2 text-[10px]">М.П.</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Create act from invoice dialog ──────────────────────────────────────────

function CreateFromInvoiceDialog({
  open, onClose, invoice, legalEntities,
}: {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  legalEntities: LegalEntity[];
  counterparties: InvoiceCounterparty[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [vatMode, setVatMode] = useState<"with_vat" | "no_vat">("with_vat");
  const [adjustedAmount, setAdjustedAmount] = useState("");
  const [subject, setSubject] = useState("");
  const [cpName, setCpName] = useState("");
  const [cpEdrpou, setCpEdrpou] = useState("");
  const [cpAddress, setCpAddress] = useState("");
  const [cpVat, setCpVat] = useState("");
  const [legalEntityId, setLegalEntityId] = useState<string>("");

  // Auto-fill ALL fields from invoice when invoice or dialog opens
  useEffect(() => {
    if (!invoice || !open) return;

    // Amount
    setAdjustedAmount(invoice.amount || "");

    // VAT mode — detect from invoice taxAmount/vatAmount
    const invoiceVat = parseFloat(invoice.vatAmount || invoice.taxAmount || "0");
    setVatMode(invoiceVat > 0 ? "with_vat" : "no_vat");

    // Subject: from first invoice item name, or description
    const firstItem = invoice.invoiceItems?.[0];
    const itemName = firstItem?.name || firstItem?.description || firstItem?.service || "";
    setSubject(itemName || invoice.description || invoice.notes || "");

    // Counterparty (Замовник)
    setCpName(invoice.counterpartyName || "");
    setCpEdrpou(invoice.counterpartyEdrpou || "");
    setCpAddress(invoice.buyerAddress || "");
    setCpVat(invoice.buyerVatNumber || "");

    // Legal entity (Виконавець): use invoice's legalEntityId or first available
    if (invoice.legalEntityId) {
      setLegalEntityId(String(invoice.legalEntityId));
    } else if (legalEntities.length > 0) {
      setLegalEntityId(String(legalEntities[0].id));
    }
  }, [invoice?.id, open]);

  const amount = parseFloat(adjustedAmount || invoice?.amount || "0");
  const sub = vatMode === "with_vat" ? amount / 1.2 : amount;
  const vat = vatMode === "with_vat" ? amount - sub : 0;

  const selectedLe = legalEntities.find(le => le.id === parseInt(legalEntityId));

  const mutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch(`/api/accounting/documents/from-invoice/${invoice?.id}`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (result: any) => {
      toast({ title: "Акт створено", description: `Акт ${result?.document?.docNumber || ""} збережено` });
      qc.invalidateQueries({ queryKey: ["/api/accounting/documents"] });
      qc.invalidateQueries({ queryKey: ["/api/accounting/documents", { type: "act" }] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    mutation.mutate({
      vatMode,
      adjustedAmount: amount,
      subject: subject || "Послуги з проживання",
      legalEntityIdOverride: legalEntityId ? parseInt(legalEntityId) : undefined,
      counterpartyOverride: {
        name: cpName || undefined,
        edrpou: cpEdrpou || undefined,
        address: cpAddress || undefined,
        vatNumber: cpVat || undefined,
      },
    });
  }

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Акт виконаних робіт — {invoice.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Виконавець ── */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Виконавець</div>
            <div>
              <Label>Юридична особа</Label>
              <Select value={legalEntityId} onValueChange={setLegalEntityId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Виберіть виконавця" />
                </SelectTrigger>
                <SelectContent>
                  {legalEntities.map(le => (
                    <SelectItem key={le.id} value={String(le.id)}>
                      {le.name}
                      {le.edrpou && <span className="text-muted-foreground ml-2 text-xs">ЄДРПОУ {le.edrpou}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLe && (
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5 bg-background rounded border p-2">
                  {selectedLe.edrpou && <div>ЄДРПОУ: <b>{selectedLe.edrpou}</b></div>}
                  {selectedLe.ipn && <div>ІПН: <b>{selectedLe.ipn}</b></div>}
                  {selectedLe.vatNumber && <div>Свід. ПДВ: <b>{selectedLe.vatNumber}</b></div>}
                  {(selectedLe.legalAddress || selectedLe.actualAddress) && (
                    <div>Адреса: {selectedLe.legalAddress || selectedLe.actualAddress}</div>
                  )}
                  {selectedLe.iban && <div>IBAN: {selectedLe.iban}</div>}
                  {selectedLe.bank && <div>Банк: {selectedLe.bank}</div>}
                </div>
              )}
            </div>
          </div>

          {/* ── Замовник ── */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="font-semibold text-sm uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Замовник
            </div>
            <div>
              <Label>Назва</Label>
              <Input className="mt-1" value={cpName} onChange={(e) => setCpName(e.target.value)} placeholder="ТОВ «Назва компанії»" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ЄДРПОУ / ІПН</Label>
                <Input className="mt-1" value={cpEdrpou} onChange={(e) => setCpEdrpou(e.target.value)} placeholder="12345678" />
              </div>
              <div>
                <Label>№ свід. ПДВ</Label>
                <Input className="mt-1" value={cpVat} onChange={(e) => setCpVat(e.target.value)} placeholder="необов'язково" />
              </div>
            </div>
            <div>
              <Label>Юридична адреса</Label>
              <Input className="mt-1" value={cpAddress} onChange={(e) => setCpAddress(e.target.value)} placeholder="м. Київ, вул. ..." />
            </div>
          </div>

          {/* ── Послуга та сума ── */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Послуга та сума</div>

            <div>
              <Label>Предмет / назва послуги</Label>
              <Input
                className="mt-1"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Послуги з проживання"
              />
            </div>

            {/* VAT toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-background px-4 py-3">
              <div>
                <div className="font-medium text-sm">З ПДВ (20%)</div>
                <div className="text-xs text-muted-foreground">
                  {vatMode === "with_vat" ? "Загальна сума включає ПДВ 20%" : "Послуги без ПДВ / звільнено"}
                </div>
              </div>
              <Switch
                checked={vatMode === "with_vat"}
                onCheckedChange={(c) => setVatMode(c ? "with_vat" : "no_vat")}
              />
            </div>

            {/* Amount */}
            <div>
              <Label>Загальна сума (грн)</Label>
              <Input
                className="mt-1"
                value={adjustedAmount}
                onChange={(e) => setAdjustedAmount(e.target.value)}
                type="number" step="0.01"
              />
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-2 bg-background rounded border p-3 text-sm">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Без ПДВ</div>
                <div className="font-mono font-medium">{sub.toFixed(2)}</div>
              </div>
              <div className="text-center border-x">
                <div className="text-xs text-muted-foreground mb-1">ПДВ {vatMode === "with_vat" ? "20%" : "0%"}</div>
                <div className="font-mono font-medium">{vat.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Разом</div>
                <div className="font-mono font-bold text-base">{amount.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || !cpName}>
            {mutation.isPending ? "Створення..." : "Створити акт"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create act manually dialog ───────────────────────────────────────────────

function CreateActDialog({
  open, onClose, legalEntities,
}: {
  open: boolean;
  onClose: () => void;
  legalEntities: LegalEntity[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [legalEntityId, setLegalEntityId] = useState<string>(legalEntities[0]?.id?.toString() || "");
  const [cpName, setCpName] = useState("");
  const [cpEdrpou, setCpEdrpou] = useState("");
  const [cpAddress, setCpAddress] = useState("");
  const [cpVat, setCpVat] = useState("");
  const [subject, setSubject] = useState("Послуги з проживання");
  const [vatMode, setVatMode] = useState<"with_vat" | "no_vat">("with_vat");
  const [items, setItems] = useState<Omit<DocumentItem, "id">[]>([
    { description: "Послуги з проживання", unit: "послуга", quantity: 1, unitPrice: 0, vatRate: "20", vatAmount: 0, totalPrice: 0 },
  ]);

  function updateItem(i: number, field: keyof typeof items[0], value: any) {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      const it = next[i];
      const price = parseFloat(String(it.unitPrice || 0));
      const qty = parseFloat(String(it.quantity || 1));
      const vatRate = vatMode === "no_vat" ? 0 : 0.2;
      const lineTotal = price * qty;
      const lineVat = lineTotal * vatRate;
      next[i].vatRate = vatMode === "no_vat" ? "exempt" : "20";
      next[i].vatAmount = lineVat;
      next[i].totalPrice = lineTotal + lineVat;
      return next;
    });
  }

  const totalAmount = items.reduce((s, it) => s + parseFloat(String(it.totalPrice || 0)), 0);
  const totalVat = items.reduce((s, it) => s + parseFloat(String(it.vatAmount || 0)), 0);
  const totalSub = totalAmount - totalVat;

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch("/api/accounting/documents", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Акт створено" });
      qc.invalidateQueries({ queryKey: ["/api/accounting/documents"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    mutation.mutate({
      docType: "act",
      docDate: new Date().toISOString().split("T")[0],
      legalEntityId: parseInt(legalEntityId) || null,
      counterpartyName: cpName || null,
      counterpartyEdrpou: cpEdrpou || null,
      subject,
      items: items.map(it => ({
        description: it.description,
        unit: it.unit,
        quantity: parseFloat(String(it.quantity)),
        unitPrice: parseFloat(String(it.unitPrice)),
        vatRate: vatMode === "no_vat" ? "exempt" : "20",
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новий акт виконаних робіт</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Legal entity */}
          <div>
            <Label>Виконавець (юридична особа)</Label>
            <Select value={legalEntityId} onValueChange={setLegalEntityId}>
              <SelectTrigger>
                <SelectValue placeholder="Виберіть виконавця" />
              </SelectTrigger>
              <SelectContent>
                {legalEntities.map(le => (
                  <SelectItem key={le.id} value={le.id.toString()}>
                    {le.name}
                    {le.edrpou && <span className="text-muted-foreground ml-2">ЄДРПОУ {le.edrpou}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* VAT mode */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium text-sm">З ПДВ (20%)</div>
              <div className="text-xs text-muted-foreground">
                {vatMode === "with_vat" ? "Послуги оподатковуються ПДВ 20%" : "Послуги без ПДВ / звільнено від оподаткування"}
              </div>
            </div>
            <Switch
              checked={vatMode === "with_vat"}
              onCheckedChange={(c) => {
                setVatMode(c ? "with_vat" : "no_vat");
                setItems(prev => prev.map(it => {
                  const price = parseFloat(String(it.unitPrice || 0));
                  const qty = parseFloat(String(it.quantity || 1));
                  const vatRate = c ? 0.2 : 0;
                  const lineTotal = price * qty;
                  return { ...it, vatRate: c ? "20" : "exempt", vatAmount: lineTotal * vatRate, totalPrice: lineTotal + lineTotal * vatRate };
                }));
              }}
            />
          </div>

          {/* Counterparty */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="font-medium text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Замовник
            </div>
            <div>
              <Label>Назва</Label>
              <Input value={cpName} onChange={(e) => setCpName(e.target.value)} placeholder="ТОВ «Назва»" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>ЄДРПОУ / ІПН</Label>
                <Input value={cpEdrpou} onChange={(e) => setCpEdrpou(e.target.value)} />
              </div>
              <div>
                <Label>Свід. ПДВ</Label>
                <Input value={cpVat} onChange={(e) => setCpVat(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Адреса</Label>
              <Input value={cpAddress} onChange={(e) => setCpAddress(e.target.value)} />
            </div>
          </div>

          {/* Subject */}
          <div>
            <Label>Предмет акту</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Послуги</Label>
              <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, {
                description: "", unit: "послуга", quantity: 1, unitPrice: 0,
                vatRate: vatMode === "no_vat" ? "exempt" : "20", vatAmount: 0, totalPrice: 0,
              }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Додати рядок
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 items-center">
                  <div className="col-span-5">
                    <Input
                      placeholder="Назва послуги"
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      placeholder="Од. вим."
                      value={item.unit}
                      onChange={(e) => updateItem(i, "unit", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="number" placeholder="К-сть" step="0.001"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, "quantity", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number" placeholder="Ціна" step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium">
                    {parseFloat(String(item.totalPrice || 0)).toFixed(2)}
                  </div>
                  {items.length > 1 && (
                    <button
                      onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}
                      className="col-span-12 sm:col-span-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-sm space-y-1 border-t pt-2">
              <div className="text-muted-foreground">Без ПДВ: <b>{totalSub.toFixed(2)} грн</b></div>
              {vatMode === "with_vat" && <div className="text-muted-foreground">ПДВ 20%: <b>{totalVat.toFixed(2)} грн</b></div>}
              <div>Разом: <b className="text-base">{totalAmount.toFixed(2)} грн</b></div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Скасувати</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Збереження..." : "Зберегти акт"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Act detail / print modal ─────────────────────────────────────────────────

function ActDetailModal({
  actId, open, onClose,
}: {
  actId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/accounting/documents", actId],
    queryFn: () => actId
      ? apiFetch(`/api/accounting/documents/${actId}`)
      : null,
    enabled: !!actId && open,
  });

  const signMutation = useMutation({
    mutationFn: () => apiFetch(`/api/accounting/documents/${actId}/sign`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      toast({ title: "Акт підписано" });
      qc.invalidateQueries({ queryKey: ["/api/accounting/documents"] });
      qc.invalidateQueries({ queryKey: ["/api/accounting/documents", actId] });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Акт виконаних робіт</title>
      <meta charset="utf-8"/>
      <style>
        body { margin: 10mm 15mm; font-family: "Times New Roman", serif; font-size: 12pt; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #000; padding: 4px 6px; }
        .no-print { display: none; }
        .sig-line { border-top: 1px solid #000; display: inline-block; min-width: 120px; }
        @page { size: A4; margin: 10mm 15mm; }
      </style>
      </head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }

  const act: Act | undefined = (data as any)?.document;
  const items: DocumentItem[] = (data as any)?.items || [];
  const legalEntity: LegalEntity | null = (data as any)?.legalEntity || null;
  const counterparty: Counterparty | null = (data as any)?.counterparty || null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between p-4 border-b no-print">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <div className="font-semibold">{act?.docNumber || "Завантаження..."}</div>
              {act && <div className="text-xs text-muted-foreground">{statusBadge(act.status)}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {act && act.status === "draft" && (
              <Button variant="outline" size="sm" onClick={() => signMutation.mutate()} disabled={signMutation.isPending}>
                <Check className="h-4 w-4 mr-1" /> Підписати
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Друк
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-2">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Завантаження...</div>
          ) : act ? (
            <div ref={printRef}>
              <ActPrintView act={act} items={items} legalEntity={legalEntity} counterparty={counterparty} />
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">Документ не знайдено</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"acts" | "invoices">("acts");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showFromInvoice, setShowFromInvoice] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedActId, setSelectedActId] = useState<number | null>(null);
  const [showActDetail, setShowActDetail] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const { data: actsData, isLoading: actsLoading } = useQuery({
    queryKey: ["/api/accounting/documents", { type: "act" }],
    queryFn: () => apiFetch("/api/accounting/documents?type=act&limit=200"),
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/invoices"],
    queryFn: () => apiFetch("/api/invoices"),
  });

  const { data: leData } = useQuery({
    queryKey: ["/api/accounting/legal-entities"],
    queryFn: () => apiFetch("/api/accounting/legal-entities"),
  });

  const { data: cpFromInvData } = useQuery({
    queryKey: ["/api/accounting/counterparties-from-invoices"],
    queryFn: () => apiFetch("/api/accounting/counterparties-from-invoices"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/accounting/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Акт видалено" });
      qc.invalidateQueries({ queryKey: ["/api/accounting/documents"] });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  const acts: Act[] = (actsData as any)?.documents || [];
  const invoices: Invoice[] = (invoicesData as any) || [];
  const legalEntities: LegalEntity[] = (leData as any)?.entities || [];
  const cpFromInvoices: InvoiceCounterparty[] = (cpFromInvData as any)?.counterparties || [];

  const filteredActs = acts.filter(a =>
    !search ||
    a.docNumber?.toLowerCase().includes(search.toLowerCase()) ||
    a.counterpartyName?.toLowerCase().includes(search.toLowerCase()) ||
    a.subject?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredInvoices = invoices.filter((inv: Invoice) =>
    !invoiceSearch ||
    inv.invoiceNumber?.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
    inv.counterpartyName?.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  // Stats
  const stats = {
    total: acts.length,
    signed: acts.filter(a => a.status === "signed").length,
    draft: acts.filter(a => a.status === "draft").length,
    totalAmount: acts.reduce((s, a) => s + parseFloat(a.totalAmount || "0"), 0),
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Бухгалтерія</h1>
            <p className="text-muted-foreground text-sm">Акти виконаних робіт та рахунки</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Новий акт
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Всього актів", value: stats.total, icon: FileText, color: "text-blue-600" },
            { label: "Підписано", value: stats.signed, icon: Check, color: "text-emerald-600" },
            { label: "Чернеток", value: stats.draft, icon: Pencil, color: "text-amber-600" },
            { label: "Сума актів", value: fmt(stats.totalAmount), icon: Banknote, color: "text-purple-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border bg-card p-4 flex items-start gap-3">
              <div className={`mt-0.5 ${color}`}><Icon className="h-5 w-5" /></div>
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-bold">{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b flex gap-0">
          {[
            { id: "acts", label: "Акти виконаних робіт" },
            { id: "invoices", label: "Рахунки → Акт" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Acts ── */}
        {tab === "acts" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Пошук за номером, контрагентом..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["/api/accounting/documents"] })}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {actsLoading ? (
              <div className="text-center py-12 text-muted-foreground">Завантаження...</div>
            ) : filteredActs.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/30" />
                <div className="text-muted-foreground">
                  {search ? "Нічого не знайдено" : "Актів ще немає"}
                </div>
                {!search && (
                  <div className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Новий акт
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setTab("invoices")}>
                      <ArrowRight className="h-4 w-4 mr-1" /> З рахунку
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-xs">
                      <th className="text-left px-4 py-3 font-medium">№ Акту</th>
                      <th className="text-left px-4 py-3 font-medium">Дата</th>
                      <th className="text-left px-4 py-3 font-medium">Замовник</th>
                      <th className="text-left px-4 py-3 font-medium">Предмет</th>
                      <th className="text-right px-4 py-3 font-medium">Сума</th>
                      <th className="text-center px-4 py-3 font-medium">Статус</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredActs.map(act => (
                      <tr key={act.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium">{act.docNumber}</td>
                        <td className="px-4 py-3 text-xs">
                          {act.docDate ? new Date(act.docDate).toLocaleDateString("uk-UA") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-[160px]">{act.counterpartyName || "—"}</div>
                          {act.counterpartyEdrpou && (
                            <div className="text-xs text-muted-foreground">ЄДРПОУ {act.counterpartyEdrpou}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[160px]">
                          {act.subject || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-medium">{fmt(act.totalAmount)}</div>
                          {parseFloat(act.vatAmount || "0") > 0 && (
                            <div className="text-xs text-muted-foreground">ПДВ {fmt(act.vatAmount)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">{statusBadge(act.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => { setSelectedActId(act.id); setShowActDetail(true); }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {act.status === "draft" && (
                              <Button
                                variant="ghost" size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Видалити акт?")) deleteMutation.mutate(act.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Invoices → Act ── */}
        {tab === "invoices" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Пошук рахунку..."
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              Виберіть рахунок та сформуйте Акт виконаних робіт
            </div>

            {invoicesLoading ? (
              <div className="text-center py-12 text-muted-foreground">Завантаження...</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">Рахунків не знайдено</div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-xs">
                      <th className="text-left px-4 py-3 font-medium">№ Рахунку</th>
                      <th className="text-left px-4 py-3 font-medium">Дата</th>
                      <th className="text-left px-4 py-3 font-medium">Контрагент</th>
                      <th className="text-left px-4 py-3 font-medium">Опис</th>
                      <th className="text-right px-4 py-3 font-medium">Сума</th>
                      <th className="text-center px-4 py-3 font-medium">Статус</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredInvoices.map((inv: Invoice) => (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-xs">
                          {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("uk-UA") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-[160px]">{inv.counterpartyName || "—"}</div>
                          {inv.counterpartyEdrpou && (
                            <div className="text-xs text-muted-foreground">ЄДРПОУ {inv.counterpartyEdrpou}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[140px]">
                          {inv.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(inv.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          {inv.status === "paid" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Оплачено</Badge>
                          ) : inv.status === "pending" ? (
                            <Badge variant="outline">Очікує</Badge>
                          ) : (
                            <Badge variant="secondary">{inv.status}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant={inv.status === "paid" ? "default" : "outline"}
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setShowFromInvoice(true);
                            }}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Акт
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateActDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        legalEntities={legalEntities}
      />
      <CreateFromInvoiceDialog
        open={showFromInvoice}
        onClose={() => { setShowFromInvoice(false); setSelectedInvoice(null); }}
        invoice={selectedInvoice}
        legalEntities={legalEntities}
        counterparties={cpFromInvoices}
      />
      <ActDetailModal
        actId={selectedActId}
        open={showActDetail}
        onClose={() => { setShowActDetail(false); setSelectedActId(null); }}
      />
    </AppLayout>
  );
}
