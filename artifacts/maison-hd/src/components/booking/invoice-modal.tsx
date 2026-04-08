import { useState, useRef } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  X, Printer, Edit3, Save, Plus, Trash2, ChevronDown, Building2,
  FileText, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────

interface InvoiceItem {
  description: string;
  detail?: string;
  qty: number;
  unit: string;
  price: number;
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

function buildPrintHtml(inv: InvoiceData, buyer: InvoiceBuyer, items: InvoiceItem[]): string {
  const total = items.reduce((s, it) => s + it.amount, 0);
  const sellerBlock = inv.seller ? `
    <div class="party">
      <div class="party-label">Продавець</div>
      <div class="party-name">${inv.seller.name}</div>
      ${inv.seller.type === "fop" ? "<div>ФОП</div>" : ""}
      ${inv.seller.taxCode ? `<div>${inv.seller.type === "fop" ? "ІПН" : "ЄДРПОУ"}: <strong>${inv.seller.taxCode}</strong></div>` : ""}
      ${inv.seller.vatNumber ? `<div>ПДВ: ${inv.seller.vatNumber}</div>` : ""}
      ${inv.seller.address ? `<div>${inv.seller.address}</div>` : ""}
      ${inv.seller.iban ? `<div>IBAN: <strong>${inv.seller.iban}</strong></div>` : ""}
      ${inv.seller.bankName ? `<div>Банк: ${inv.seller.bankName}${inv.seller.mfo ? `, МФО ${inv.seller.mfo}` : ""}</div>` : ""}
    </div>` : "";
  const buyerBlock = `
    <div class="party">
      <div class="party-label">Покупець</div>
      <div class="party-name">${buyer.name || "—"}</div>
      ${buyer.taxCode ? `<div>${buyer.taxCode.length <= 10 ? "ІПН/ЄДРПОУ" : "Код"}: <strong>${buyer.taxCode}</strong></div>` : ""}
      ${buyer.vatNumber ? `<div>ПДВ: ${buyer.vatNumber}</div>` : ""}
      ${buyer.address ? `<div>${buyer.address}</div>` : ""}
    </div>`;
  const itemRows = items.map((it, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>
        <div>${it.description}</div>
        ${it.detail ? `<div class="detail">${it.detail}</div>` : ""}
      </td>
      <td class="center">${it.qty}</td>
      <td class="center">${it.unit}</td>
      <td class="right">${fmtMoney(it.price)}</td>
      <td class="right"><strong>${fmtMoney(it.amount)}</strong></td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<title>Рахунок ${inv.invoiceNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 24px 32px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .sub { color: #555; font-size: 11px; margin-bottom: 24px; }
  .meta { display: flex; gap: 40px; margin-bottom: 24px; }
  .meta-item { }
  .meta-label { font-size: 10px; text-transform: uppercase; color: #888; }
  .meta-val { font-weight: 600; font-size: 13px; }
  .parties { display: flex; gap: 32px; margin-bottom: 24px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 16px 0; }
  .party { flex: 1; }
  .party-label { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
  .party-name { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
  .party div { margin-bottom: 2px; color: #374151; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead tr { background: #f3f4f6; }
  th { padding: 8px; font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .center { text-align: center; }
  .right { text-align: right; }
  .detail { font-size: 10px; color: #888; margin-top: 2px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals-box { min-width: 220px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals-row.big { border-top: 2px solid #111; padding-top: 8px; font-weight: 700; font-size: 14px; }
  .footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  .sig-line { border-top: 1px solid #999; min-width: 160px; margin-top: 32px; padding-top: 4px; font-size: 10px; color: #888; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>Рахунок-фактура № ${inv.invoiceNumber}</h1>
  <div class="sub">Дата: ${fmtDate(inv.date)}${inv.dueDate ? ` · Дата оплати: ${fmtDate(inv.dueDate)}` : ""}</div>
  <div class="parties">${sellerBlock}${buyerBlock}</div>
  <table>
    <thead><tr>
      <th>#</th><th style="text-align:left">Послуга</th>
      <th>К-сть</th><th>Од.</th><th class="right">Ціна</th><th class="right">Сума</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals"><div class="totals-box">
    ${inv.booking.paidAmount > 0 ? `<div class="totals-row"><span>Оплачено:</span><span>${uah(inv.booking.paidAmount)}</span></div>` : ""}
    <div class="totals-row big"><span>До сплати:</span><span>${uah(total - inv.booking.paidAmount)}</span></div>
  </div></div>
  ${inv.seller?.iban ? `<div style="font-size:11px;color:#555;margin-bottom:24px">Реквізити для оплати: IBAN <strong>${inv.seller.iban}</strong>${inv.seller.bankName ? ` · ${inv.seller.bankName}` : ""}${inv.seller.mfo ? ` · МФО ${inv.seller.mfo}` : ""}</div>` : ""}
  <div class="footer">
    <div><div class="sig-line">Продавець / ${inv.seller?.directorName || "________________"}</div></div>
    <div><div class="sig-line">Покупець / ________________</div></div>
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
  const [entityMenuOpen, setEntityMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const total = items.reduce((s, it) => s + it.amount, 0);
  const due = total - (data.booking.paidAmount || 0);

  const handlePrint = () => {
    const html = buildPrintHtml({ ...data, buyer }, buyer, items);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast({ title: "Дозвольте спливаючі вікна для друку", variant: "destructive" }); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  const updateItem = (i: number, field: keyof InvoiceItem, val: any) => {
    setItems(prev => {
      const next = [...prev];
      const it = { ...next[i], [field]: field === "qty" || field === "price" ? Number(val) : val };
      it.amount = Math.round(it.qty * it.price * 100) / 100;
      next[i] = it;
      return next;
    });
  };

  const addItem = () => {
    setItems(prev => [...prev, { description: "Додаткова послуга", detail: "", qty: 1, unit: "шт", price: 0, amount: 0 }]);
  };

  const removeItem = (i: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      toast({ title: "Збережено", description: "Реквізити покупця оновлено" });
      setEditing(false);
    } catch {
      toast({ title: "Помилка збереження", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasEntities = data.legalEntities && data.legalEntities.length > 1;

  return (
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
                  <th className="text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-16">К-сть</th>
                  <th className="text-center text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-12">Од.</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-28">Ціна</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-2 w-28">Сума</th>
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
                          className="w-24 text-right border-b border-dashed border-indigo-300 bg-indigo-50/40 focus:outline-none"
                          min={0}
                          step={0.01}
                        />
                      ) : (
                        <span className="text-gray-700">{fmtMoney(it.price)}</span>
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

          {/* Signature area */}
          <div className="flex justify-between pt-4 border-t border-gray-100">
            <div className="space-y-8">
              <div className="text-xs text-gray-500">Від постачальника:</div>
              <div className="border-t border-gray-300 pt-1 text-[10px] text-gray-400 min-w-[180px]">
                {data.seller?.directorName ? `${data.seller.directorName} / підпис` : "ПІБ / підпис"}
              </div>
            </div>
            <div className="space-y-8 text-right">
              <div className="text-xs text-gray-500">Від покупця:</div>
              <div className="border-t border-gray-300 pt-1 text-[10px] text-gray-400 min-w-[180px] text-left">
                ПІБ / підпис
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
