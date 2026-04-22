import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  X, Printer, Edit3, Save, Plus, Trash2, ChevronDown, Building2,
  FileText, Check, Send, MessageCircle, Phone, Link2, CheckCircle2, CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SplitBillingDialog } from "@/components/split-billing-dialog";

// ─── Types ─────────────────────────────────────────────────────────────────

interface InvoiceItem {
  description: string;
  detail?: string;
  qty: number;
  unit: string;
  price: number;
  discount?: number;
  vatRate?: number;
  amount: number;
}

interface InvoiceSeller {
  name: string;
  type: string;
  taxCode?: string;
  vatNumber?: string;
  iban?: string;
  bankName?: string;
  mfo?: string;
  address?: string;
  directorName?: string;
  accountantName?: string;
  logoUrl?: string;
  stamp?: string;
  signature?: string;
}

interface InvoiceBuyer {
  name: string;
  taxCode: string;
  vatNumber: string;
  address: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  note?: string;
  booking: {
    id: number;
    checkIn: string;
    checkOut: string;
    checkinTime?: string;
    checkoutTime?: string;
    nights: number;
    unitName: string;
    guestName: string;
    phone?: string;
    adults?: number;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
  };
  seller: InvoiceSeller | null;
  buyer: InvoiceBuyer | null;
  items: InvoiceItem[];
  legalEntities?: { id: number; name: string; isDefault: boolean }[];
  legalEntityId?: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token");
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmtDate = (d: string) => {
  try { return format(new Date(d), "dd.MM.yyyy"); } catch { return d; }
};
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const uah = (n: number) => `${fmtMoney(n)} грн`;

// ─── Editable field ─────────────────────────────────────────────────────────

function EditableField({
  value, onChange, editing, placeholder, className = "", multiline = false,
}: {
  value: string; onChange: (v: string) => void; editing: boolean;
  placeholder?: string; className?: string; multiline?: boolean;
}) {
  if (!editing) {
    return (
      <span className={className}>
        {value || <span className="text-gray-300 italic">{placeholder}</span>}
      </span>
    );
  }
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className={`w-full border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none focus:border-indigo-500 resize-none text-inherit font-inherit ${className}`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none focus:border-indigo-500 text-inherit font-inherit ${className}`}
    />
  );
}

// ─── Print helper ───────────────────────────────────────────────────────────

export function buildPrintHtml(inv: InvoiceData, buyer: InvoiceBuyer, items: InvoiceItem[]): string {
  const total = items.reduce((s, it) => s + it.amount, 0);
  const paid  = inv.booking.paidAmount || 0;
  const due   = total - paid;

  // ── VAT calculation ───────────────────────────────────────────────────────
  const hasVat = items.some(it => (it.vatRate || 0) > 0);
  const vatGroups: Record<number, number> = {};
  items.forEach(it => {
    const rate = it.vatRate || 0;
    const net  = it.amount / (1 + rate / 100);
    const vat  = it.amount - net;
    vatGroups[rate] = (vatGroups[rate] || 0) + vat;
  });

  const vatRows = Object.entries(vatGroups).map(([rate, vatAmt]) => {
    const r = Number(rate);
    const base = items.filter(i => (i.vatRate || 0) === r).reduce((s, i) => s + i.amount / (1 + r / 100), 0);
    return r === 0
      ? `<div class="vat-row"><span>Без ПДВ:</span><span>${fmtMoney(base)} грн</span></div>`
      : `<div class="vat-row"><span>ПДВ ${r}%:</span><span>${fmtMoney(vatAmt)} грн</span></div>`;
  }).join("");

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoHtml = inv.seller?.logoUrl
    ? `<img src="${inv.seller.logoUrl}" alt="logo" class="logo" />`
    : "";

  // ── Seller block ──────────────────────────────────────────────────────────
  const sellerBlock = inv.seller ? `
    <div class="party">
      <div class="party-label">Продавець</div>
      <div class="party-name">${inv.seller.name}</div>
      ${inv.seller.type === "fop" ? `<div class="party-row">ФОП</div>` : ""}
      ${inv.seller.taxCode ? `<div class="party-row">${inv.seller.type === "fop" ? "ІПН" : "ЄДРПОУ"}: <strong>${inv.seller.taxCode}</strong></div>` : ""}
      ${inv.seller.vatNumber ? `<div class="party-row">Свідоцтво ПДВ: ${inv.seller.vatNumber}</div>` : ""}
      ${inv.seller.address ? `<div class="party-row">${inv.seller.address}</div>` : ""}
      ${inv.seller.iban ? `<div class="party-row">IBAN: <strong>${inv.seller.iban}</strong></div>` : ""}
      ${inv.seller.bankName ? `<div class="party-row">Банк: ${inv.seller.bankName}${inv.seller.mfo ? ` · МФО ${inv.seller.mfo}` : ""}</div>` : ""}
    </div>` : `<div class="party"></div>`;

  // ── Buyer block ──────────────────────────────────────────────────────────
  const buyerBlock = `
    <div class="party">
      <div class="party-label">Покупець</div>
      <div class="party-name">${buyer.name || "—"}</div>
      ${buyer.taxCode ? `<div class="party-row">${buyer.taxCode.length <= 10 ? "ІПН/ЄДРПОУ" : "Код"}: <strong>${buyer.taxCode}</strong></div>` : ""}
      ${buyer.vatNumber ? `<div class="party-row">Свідоцтво ПДВ: ${buyer.vatNumber}</div>` : ""}
      ${buyer.address ? `<div class="party-row">${buyer.address}</div>` : ""}
    </div>`;

  // ── Items rows ────────────────────────────────────────────────────────────
  const itemRows = items.map((it, i) => {
    const disc    = it.discount || 0;
    const vatRate = it.vatRate  || 0;
    const netAmt  = vatRate > 0 ? it.amount / (1 + vatRate / 100) : it.amount;
    const vatAmt  = it.amount - netAmt;
    return `
    <tr>
      <td class="center">${i + 1}</td>
      <td>
        <div>${it.description}</div>
        ${it.detail ? `<div class="detail">${it.detail}</div>` : ""}
      </td>
      <td class="center">${it.qty}&nbsp;${it.unit}</td>
      <td class="right">${fmtMoney(it.price)}</td>
      <td class="right">${disc > 0 ? fmtMoney(disc) : "—"}</td>
      <td class="right">${fmtMoney(netAmt)}</td>
      <td class="center">${vatRate > 0 ? vatRate + "%" : "Без ПДВ"}</td>
      <td class="right"><strong>${fmtMoney(it.amount)}</strong></td>
    </tr>`;
  }).join("");

  // ── Bank details ──────────────────────────────────────────────────────────
  const bankHtml = inv.seller?.iban ? `
    <div class="bank-block">
      <div class="bank-label">Банківські реквізити</div>
      <div><strong>IBAN:</strong> ${inv.seller.iban}</div>
      ${inv.seller.bankName ? `<div><strong>Банк:</strong> ${inv.seller.bankName}${inv.seller.mfo ? ` · МФО ${inv.seller.mfo}` : ""}</div>` : ""}
    </div>` : "";

  // ── Note ─────────────────────────────────────────────────────────────────
  const noteHtml = inv.note ? `
    <div class="note-block">
      <span class="note-label">Примітка:</span> ${inv.note}
    </div>` : "";

  // ── Signatures ────────────────────────────────────────────────────────────
  const directorName  = inv.seller?.directorName  || "________________";
  const accountantName = inv.seller?.accountantName || "________________";

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<title>Рахунок ${inv.invoiceNumber}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans', Arial, 'Helvetica Neue', sans-serif; font-size: 12px; color: #111; background: #fff; padding: 24px 32px; max-width: 900px; margin: 0 auto; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 24px; }
  .logo { max-height: 60px; max-width: 160px; object-fit: contain; }
  .title-block h1 { font-size: 22px; font-weight: 800; color: #1e3a5f; }
  .title-block .inv-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .meta-boxes { display: flex; gap: 12px; margin-bottom: 20px; }
  .meta-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; min-width: 110px; }
  .meta-box.highlight { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
  .meta-box .ml { font-size: 10px; text-transform: uppercase; color: #9ca3af; margin-bottom: 2px; }
  .meta-box.highlight .ml { color: #93c5fd; }
  .meta-box .mv { font-size: 14px; font-weight: 700; }
  .bank-block { background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; line-height: 1.6; }
  .bank-label { font-size: 10px; text-transform: uppercase; color: #4f46e5; font-weight: 700; margin-bottom: 4px; }
  .parties { display: flex; gap: 24px; margin-bottom: 20px; border-top: 2px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 14px 0; }
  .party { flex: 1; }
  .party-label { font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 700; margin-bottom: 6px; letter-spacing: .5px; }
  .party-name { font-size: 13px; font-weight: 700; margin-bottom: 4px; color: #111827; }
  .party-row { margin-bottom: 2px; color: #374151; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  thead tr { background: #1e3a5f; color: #fff; }
  th { padding: 7px 8px; font-size: 10px; text-transform: uppercase; font-weight: 600; letter-spacing: .3px; }
  td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .center { text-align: center; }
  .right { text-align: right; }
  .detail { font-size: 10px; color: #9ca3af; margin-top: 2px; }
  .vat-section { margin-bottom: 16px; }
  .vat-section-label { font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 700; margin-bottom: 6px; }
  .vat-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; color: #374151; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { min-width: 240px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
  .totals-row:last-child { border-bottom: none; }
  .totals-row.big { background: #1e3a5f; color: #fff; font-weight: 700; font-size: 14px; padding: 8px 12px; }
  .note-block { font-size: 11px; color: #6b7280; margin-bottom: 20px; padding: 8px 12px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; }
  .note-label { font-weight: 700; color: #92400e; }
  .footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; gap: 16px; }
  .sig-block { flex: 1; }
  .sig-role { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 32px; }
  .sig-line { border-top: 1px solid #374151; padding-top: 4px; font-size: 11px; color: #374151; font-weight: 600; }
  @media print { body { padding: 0; } }
</style></head><body>

  <div class="header">
    <div class="title-block">
      ${logoHtml}
      <h1>Рахунок-фактура</h1>
      <div class="inv-sub">№ ${inv.invoiceNumber}</div>
    </div>
    ${inv.seller ? `<div style="text-align:right;font-size:11px;color:#6b7280;line-height:1.6">
      <div style="font-weight:700;color:#111;font-size:13px">${inv.seller.name}</div>
      ${inv.seller.taxCode ? `<div>${inv.seller.type === "fop" ? "ІПН" : "ЄДРПОУ"}: ${inv.seller.taxCode}</div>` : ""}
      ${inv.seller.vatNumber ? `<div>ПДВ: ${inv.seller.vatNumber}</div>` : ""}
    </div>` : ""}
  </div>

  <div class="meta-boxes">
    <div class="meta-box">
      <div class="ml">Дата</div>
      <div class="mv">${fmtDate(inv.date)}</div>
    </div>
    <div class="meta-box">
      <div class="ml">Номер</div>
      <div class="mv">${inv.invoiceNumber}</div>
    </div>
    ${inv.dueDate ? `<div class="meta-box">
      <div class="ml">Дата оплати</div>
      <div class="mv">${fmtDate(inv.dueDate)}</div>
    </div>` : ""}
    <div class="meta-box highlight">
      <div class="ml">До сплати</div>
      <div class="mv">${fmtMoney(due)} грн</div>
    </div>
  </div>

  ${bankHtml}

  <div class="parties">${sellerBlock}${buyerBlock}</div>

  <table>
    <thead><tr>
      <th class="center">#</th>
      <th>Послуга / Товар</th>
      <th class="center">К-сть / Од.</th>
      <th class="right">Ціна, грн</th>
      <th class="right">Знижка, грн</th>
      <th class="right">Сума без ПДВ</th>
      <th class="center">Ставка ПДВ</th>
      <th class="right">Сума, грн</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${hasVat ? `<div class="vat-section">
    <div class="vat-section-label">Розшифровка ПДВ</div>
    ${vatRows}
  </div>` : ""}

  <div class="totals"><div class="totals-box">
    ${paid > 0 ? `<div class="totals-row"><span>Оплачено раніше:</span><span>${fmtMoney(paid)} грн</span></div>` : ""}
    <div class="totals-row"><span>Разом:</span><span>${fmtMoney(total)} грн</span></div>
    <div class="totals-row big"><span>До сплати:</span><span>${fmtMoney(due)} грн</span></div>
  </div></div>

  ${noteHtml}

  <div class="footer">
    <div class="sig-block">
      <div class="sig-role">Керівник / Директор</div>
      <div class="sig-line">${inv.seller?.directorName || "________________"}</div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Головний бухгалтер</div>
      <div class="sig-line">${accountantName}</div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Покупець</div>
      <div class="sig-line">________________</div>
    </div>
  </div>

</body></html>`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface InvoiceModalProps {
  data: InvoiceData;
  bookingId: number;
  onClose: () => void;
  onReload?: (entityId?: number) => void;
}

export function InvoiceModal({ data, bookingId, onClose, onReload }: InvoiceModalProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [buyer, setBuyer] = useState<InvoiceBuyer>(
    data.buyer || { name: data.booking.guestName || "", taxCode: "", vatNumber: "", address: "" }
  );
  const [items, setItems] = useState<InvoiceItem[]>(data.items);
  const [note, setNote] = useState<string>(data.note || "");
  const [entityMenuOpen, setEntityMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedInvoiceId, setSavedInvoiceId] = useState<number | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSplitBilling, setShowSplitBilling] = useState(false);

  const total = items.reduce((s, it) => s + it.amount, 0);
  const due = total - (data.booking.paidAmount || 0);

  const handlePrint = () => {
    const html = buildPrintHtml({ ...data, buyer, note }, buyer, items);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast({ title: "Дозвольте спливаючі вікна для друку", variant: "destructive" }); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    // Wait for Google Fonts to load before printing
    w.onload = () => setTimeout(() => w.print(), 600);
    setTimeout(() => { if (!w.closed) w.print(); }, 2500);
  };

  const updateItem = (i: number, field: keyof InvoiceItem, val: any) => {
    setItems(prev => {
      const next = [...prev];
      const numFields = ["qty", "price", "discount", "vatRate"];
      const it = { ...next[i], [field]: numFields.includes(field) ? Number(val) : val };
      const base = Math.round(it.qty * it.price * 100) / 100;
      const disc = it.discount || 0;
      it.amount = Math.max(0, Math.round((base - disc) * 100) / 100);
      next[i] = it;
      return next;
    });
  };

  const addItem = () => {
    const defaultVat = items[0]?.vatRate ?? 0;
    setItems(prev => [...prev, { description: "Додаткова послуга", detail: "", qty: 1, unit: "шт", price: 0, discount: 0, vatRate: defaultVat, amount: 0 }]);
  };

  const removeItem = (i: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        invoiceNumber: data.invoiceNumber,
        date: data.date,
        dueDate: data.dueDate,
        legalEntityId: data.legalEntityId,
        note,
        buyer,
        items,
        seller: data.seller,
      };
      const resp = await fetch(`${API}/bookings/${bookingId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || "save failed");
      const saved = await resp.json();
      setSavedInvoiceId(saved.id);
      toast({ title: "Рахунок збережено", description: `№ ${data.invoiceNumber}` });
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Помилка збереження", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasEntities = data.legalEntities && data.legalEntities.length > 1;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">Рахунок-фактура</div>
              <div className="text-xs text-gray-400">№ {data.invoiceNumber} · {fmtDate(data.date)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasEntities && (
              <div className="relative">
                <button
                  onClick={() => setEntityMenuOpen(v => !v)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  {data.seller?.name || "Юр особа"}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {entityMenuOpen && (
                  <div className="absolute right-0 top-10 z-10 bg-white border border-gray-100 rounded-xl shadow-xl py-1 min-w-[200px]">
                    {data.legalEntities!.map(e => (
                      <button
                        key={e.id}
                        onClick={() => { setEntityMenuOpen(false); onReload?.(e.id); }}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                      >
                        {e.isDefault && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                        {e.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Зберегти
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Скасувати
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Редагувати
              </button>
            )}
            {savedInvoiceId && (
              <>
                <button
                  onClick={() => setShowSplitBilling(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
                  title="Сформувати LiqPay посилання по юридичних особах"
                >
                  <CreditCard className="w-3.5 h-3.5" /> Оплата
                </button>
                <button
                  onClick={() => setShowSendModal(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                >
                  <Send className="w-3.5 h-3.5" /> Надіслати
                </button>
              </>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Друкувати
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Invoice Body ── */}
        <div className="p-6 space-y-6">

          {/* Header row */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">РАХУНОК-ФАКТУРА</h1>
              <p className="text-sm text-gray-400 mt-0.5">№ {data.invoiceNumber}</p>
            </div>
            <div className="text-right space-y-1">
              <div className="text-xs text-gray-400">Дата</div>
              <div className="font-bold text-gray-900">{fmtDate(data.date)}</div>
              {data.dueDate && (
                <>
                  <div className="text-xs text-gray-400 mt-1">Дата оплати</div>
                  <div className="font-semibold text-gray-700">{fmtDate(data.dueDate)}</div>
                </>
              )}
            </div>
          </div>

          {/* Seller + Buyer */}
          <div className="grid grid-cols-2 gap-6 py-5 border-y border-gray-100">
            {/* Seller */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Продавець</div>
              {data.seller ? (
                <div className="space-y-1 text-sm">
                  <div className="font-bold text-gray-900">{data.seller.name}</div>
                  {data.seller.type === "fop" && <div className="text-xs text-gray-500">ФОП</div>}
                  {data.seller.taxCode && (
                    <div className="text-xs text-gray-600">
                      {data.seller.type === "fop" ? "ІПН" : "ЄДРПОУ"}: <span className="font-semibold">{data.seller.taxCode}</span>
                    </div>
                  )}
                  {data.seller.vatNumber && (
                    <div className="text-xs text-gray-600">Платник ПДВ: <span className="font-semibold">{data.seller.vatNumber}</span></div>
                  )}
                  {data.seller.address && <div className="text-xs text-gray-500">{data.seller.address}</div>}
                  {data.seller.iban && (
                    <div className="text-xs text-gray-600 mt-1">IBAN: <span className="font-mono font-semibold">{data.seller.iban}</span></div>
                  )}
                  {data.seller.bankName && (
                    <div className="text-xs text-gray-500">
                      {data.seller.bankName}{data.seller.mfo ? ` · МФО ${data.seller.mfo}` : ""}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic">
                  Додайте юридичну особу в Налаштування → Юридичні особи
                </div>
              )}
            </div>

            {/* Buyer — editable */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Покупець
                {editing && <span className="ml-1 text-indigo-400 normal-case font-normal">(редагується)</span>}
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Назва / ПІБ</div>
                  <EditableField
                    value={buyer.name}
                    onChange={v => setBuyer(b => ({ ...b, name: v }))}
                    editing={editing}
                    placeholder="Введіть ПІБ або назву компанії"
                    className="font-bold text-gray-900 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">ЄДРПОУ / ІПН</div>
                  <EditableField
                    value={buyer.taxCode}
                    onChange={v => setBuyer(b => ({ ...b, taxCode: v }))}
                    editing={editing}
                    placeholder="—"
                    className="text-xs text-gray-600"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Номер ПДВ</div>
                  <EditableField
                    value={buyer.vatNumber}
                    onChange={v => setBuyer(b => ({ ...b, vatNumber: v }))}
                    editing={editing}
                    placeholder="—"
                    className="text-xs text-gray-600"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Адреса</div>
                  <EditableField
                    value={buyer.address}
                    onChange={v => setBuyer(b => ({ ...b, address: v }))}
                    editing={editing}
                    placeholder="—"
                    multiline
                    className="text-xs text-gray-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 pr-3 w-6">#</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2">Послуга</th>
                  <th className="text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-14">К-сть</th>
                  <th className="text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-10">Од.</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-24">Ціна</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-20">Знижка</th>
                  <th className="text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-20">ПДВ %</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-24">Сума</th>
                  {editing && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-3 pr-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-3 pr-3">
                      {editing ? (
                        <div className="space-y-1">
                          <input
                            value={it.description}
                            onChange={e => updateItem(i, "description", e.target.value)}
                            className="w-full border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none focus:border-indigo-500 text-sm font-medium text-gray-800"
                          />
                          <input
                            value={it.detail || ""}
                            onChange={e => updateItem(i, "detail", e.target.value)}
                            placeholder="Деталі (не обов'язково)"
                            className="w-full border-b border-dashed border-gray-200 bg-transparent focus:outline-none focus:border-gray-400 text-xs text-gray-400"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-gray-800">{it.description}</div>
                          {it.detail && <div className="text-xs text-gray-400 mt-0.5">{it.detail}</div>}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {editing ? (
                        <input
                          type="number"
                          value={it.qty}
                          onChange={e => updateItem(i, "qty", e.target.value)}
                          className="w-12 text-center border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none"
                          min={1}
                        />
                      ) : (
                        <span className="text-gray-700">{it.qty}</span>
                      )}
                    </td>
                    <td className="py-3 text-center text-gray-500 text-xs">{it.unit}</td>
                    <td className="py-3 text-right">
                      {editing ? (
                        <input
                          type="number"
                          value={it.price}
                          onChange={e => updateItem(i, "price", e.target.value)}
                          className="w-20 text-right border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none"
                          min={0}
                          step={0.01}
                        />
                      ) : (
                        <span className="text-gray-700">{fmtMoney(it.price)}</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {editing ? (
                        <input
                          type="number"
                          value={it.discount || 0}
                          onChange={e => updateItem(i, "discount", e.target.value)}
                          className="w-16 text-right border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none"
                          min={0}
                          step={0.01}
                        />
                      ) : (
                        <span className="text-gray-500">{(it.discount || 0) > 0 ? fmtMoney(it.discount!) : "—"}</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {editing ? (
                        <select
                          value={it.vatRate ?? 0}
                          onChange={e => updateItem(i, "vatRate", e.target.value)}
                          className="w-16 text-center border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none text-xs"
                        >
                          <option value={0}>Без ПДВ</option>
                          <option value={7}>7%</option>
                          <option value={20}>20%</option>
                        </select>
                      ) : (
                        <span className="text-gray-500 text-xs">{(it.vatRate || 0) > 0 ? `${it.vatRate}%` : "Без ПДВ"}</span>
                      )}
                    </td>
                    <td className="py-3 text-right font-semibold text-gray-900">{fmtMoney(it.amount)}</td>
                    {editing && (
                      <td className="py-3 pl-2">
                        <button
                          onClick={() => removeItem(i)}
                          disabled={items.length === 1}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {editing && (
              <button
                onClick={addItem}
                className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Додати рядок
              </button>
            )}
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="min-w-[220px] space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Всього:</span>
                <span className="font-semibold text-gray-800">{uah(total)}</span>
              </div>
              {data.booking.paidAmount > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Оплачено:</span>
                  <span className="font-semibold text-emerald-600">{uah(data.booking.paidAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t-2 border-gray-800">
                <span className="font-bold text-gray-900">До сплати:</span>
                <span className="font-black text-gray-900 text-base">{uah(Math.max(0, due))}</span>
              </div>
            </div>
          </div>

          {/* Bank details callout */}
          {data.seller?.iban && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 space-y-0.5">
              <div className="font-semibold text-gray-700 mb-1">Реквізити для оплати</div>
              <div>IBAN: <span className="font-mono font-semibold text-gray-800">{data.seller.iban}</span></div>
              {data.seller.bankName && <div>Банк: {data.seller.bankName}{data.seller.mfo ? ` · МФО ${data.seller.mfo}` : ""}</div>}
              <div>Одержувач: {data.seller.name}</div>
            </div>
          )}

          {/* Note */}
          {(editing || !!note) && (
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Примітка {editing && <span className="text-indigo-400 normal-case font-normal">(необов'язково)</span>}
              </div>
              {editing ? (
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Наприклад: Без ПДВ / ФОП на спрощеній системі / умови оплати..."
                  rows={2}
                  className="w-full border border-dashed border-indigo-300 bg-indigo-50/40 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-indigo-500 resize-none"
                />
              ) : (
                <div className="text-xs text-gray-500 bg-amber-50 border-l-2 border-amber-300 px-3 py-2 rounded">{note}</div>
              )}
            </div>
          )}

          {/* Signature area */}
          <div className="flex justify-between gap-4 pt-4 border-t border-gray-100">
            <div className="flex-1 space-y-6">
              <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Керівник / Директор</div>
              <div className="border-t border-gray-300 pt-1 text-[10px] text-gray-500 font-medium">
                {data.seller?.directorName || "________________"}
              </div>
            </div>
            {data.seller?.accountantName && (
              <div className="flex-1 space-y-6">
                <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Гол. бухгалтер</div>
                <div className="border-t border-gray-300 pt-1 text-[10px] text-gray-500 font-medium">
                  {data.seller.accountantName}
                </div>
              </div>
            )}
            <div className="flex-1 space-y-6">
              <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Покупець</div>
              <div className="border-t border-gray-300 pt-1 text-[10px] text-gray-400">
                ________________
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Send Invoice Modal ─────────────────────────────────── */}
      {showSendModal && savedInvoiceId && (
        <SendInvoiceModal
          invoiceId={savedInvoiceId}
          invoiceNumber={data.invoiceNumber}
          total={total}
          guestName={buyer.name || data.booking.guestName || ""}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {/* ── Split Billing Dialog ─────────────────────────────────── */}
      {showSplitBilling && savedInvoiceId && (
        <SplitBillingDialog
          invoiceId={savedInvoiceId}
          invoiceNumber={data.invoiceNumber}
          totalAmount={total}
          guestName={buyer.name || data.booking.guestName || ""}
          guestEmail={buyer.name ? undefined : undefined}
          guestPhone={data.booking.phone}
          onClose={() => setShowSplitBilling(false)}
        />
      )}
    </div>,
    document.body
  );
}

// ─── Send Invoice Modal ──────────────────────────────────────────────────────

interface SendInvoiceModalProps {
  invoiceId: number;
  invoiceNumber: string;
  total: number;
  guestName: string;
  onClose: () => void;
}

function SendInvoiceModal({ invoiceId, invoiceNumber, total, guestName, onClose }: SendInvoiceModalProps) {
  const { toast } = useToast();
  const [channel, setChannel] = useState<"telegram" | "sms" | "link">("telegram");
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const uah = (n: number) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", minimumFractionDigits: 2 }).format(n);
  const defaultMessage = `Рахунок № ${invoiceNumber} на суму ${uah(total)}.\nОтримувач: ${guestName}`;

  const handleSend = async () => {
    if (channel !== "link" && !recipient.trim()) {
      toast({ title: "Вкажіть отримувача", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const resp = await fetch(`${API}/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ channel, recipient: recipient.trim(), message: defaultMessage }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.message || data.error || "send failed");
      }
      setSent(true);
      if (data.invoiceUrl) setInvoiceUrl(data.invoiceUrl);
      if (channel === "telegram") {
        toast({ title: "✅ Надіслано через Telegram!", description: "Гість отримав посилання на рахунок." });
      } else {
        toast({ title: "✅ Посилання готове", description: "Скопіюйте посилання та надішліть гостю." });
      }
    } catch (e: any) {
      toast({ title: "Помилка надсилання", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const channels = [
    { id: "telegram" as const, label: "Telegram", icon: MessageCircle, hint: "@username гостя" },
    { id: "link" as const, label: "Скопіювати лінк", icon: Link2, hint: "Посилання для гостя" },
    { id: "sms" as const, label: "SMS", icon: Phone, hint: "+380XXXXXXXXX (незабаром)" },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">Надіслати рахунок</div>
              <div className="text-xs text-gray-400">№ {invoiceNumber} · {uah(total)}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <div className="text-lg font-bold text-gray-900">
                {channel === "telegram" ? "Надіслано через Telegram!" : "Посилання готове!"}
              </div>
              {invoiceUrl && (
                <div className="w-full space-y-2">
                  <p className="text-xs text-center text-gray-500">Посилання на рахунок для гостя:</p>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                    <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-700 font-mono truncate flex-1">{invoiceUrl}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(invoiceUrl); toast({ title: "Скопійовано!" }); }}
                      className="shrink-0 text-xs text-indigo-600 font-semibold hover:text-indigo-800"
                    >
                      Копіювати
                    </button>
                  </div>
                  <p className="text-xs text-center text-gray-400">Гість бачить рахунок без входу в систему · може роздрукувати як PDF</p>
                </div>
              )}
              <button onClick={onClose} className="mt-2 text-sm text-gray-400 hover:text-gray-600">Закрити</button>
            </div>
          ) : (
            <>
              {/* Channel selection */}
              <div className="grid grid-cols-3 gap-2">
                {channels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => setChannel(ch.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                      channel === ch.id
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <ch.icon className="w-5 h-5" />
                    {ch.label}
                  </button>
                ))}
              </div>

              {/* Recipient */}
              {channel !== "link" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    {channels.find(c => c.id === channel)?.hint || "Отримувач"}
                  </label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    placeholder={channels.find(c => c.id === channel)?.hint}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Message preview */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {channel === "link" ? "Що отримає гість" : "Що отримає гість (Telegram)"}
                </label>
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600 space-y-1">
                  <p className="whitespace-pre-wrap">{channel === "telegram"
                    ? `🧾 Рахунок № ${invoiceNumber}\n${guestName ? `👤 ${guestName}\n` : ""}💰 До сплати: ${uah(total)}\n\n👉 [Переглянути рахунок] ← посилання`
                    : `Посилання на рахунок, яке можна відкрити в браузері, переглянути всі деталі та роздрукувати як PDF.`
                  }</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {sending ? "Надсилання..." : "Надіслати"}
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Скасувати
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
