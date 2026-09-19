import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Printer, Download, CheckCircle, Clock, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";

const fmtMoney = (n: any) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
const fmtDate = (d: any) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return String(d); }
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  paid:    { label: "Оплачено",    color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: CheckCircle },
  pending: { label: "Очікує оплати", color: "text-amber-700 bg-amber-50 border-amber-200",   icon: Clock },
  overdue: { label: "Прострочено", color: "text-red-700 bg-red-50 border-red-200",            icon: AlertCircle },
  draft:   { label: "Чернетка",   color: "text-gray-600 bg-gray-50 border-gray-200",          icon: Clock },
};

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/invoices/public/${token}`)
      .then(r => r.ok ? r.json() : r.json().then((d: any) => { throw new Error(d.error || "Not found"); }))
      .then(d => { setInv(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [token]);

  const handlePrint = () => window.print();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-gray-500">Завантаження рахунку…</p>
      </div>
    </div>
  );

  if (error || !inv) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-3 max-w-sm px-4">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
        <h1 className="text-lg font-bold text-gray-800">Рахунок не знайдено</h1>
        <p className="text-sm text-gray-500">Посилання недійсне або термін дії вичерпано.</p>
      </div>
    </div>
  );

  const items: any[] = inv.invoiceItems || [];
  const seller: any = inv.sellerSnapshot || {};
  const total = items.length > 0
    ? items.reduce((s: number, it: any) => s + Number(it.amount || 0), 0)
    : Number(inv.amount);
  const paid = Number(inv.paidAmount || 0);
  const due  = total - paid;
  const hasVat = items.some((it: any) => (it.vatRate || 0) > 0);
  const status = STATUS_MAP[inv.status] || STATUS_MAP.pending;
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4 print:bg-white print:py-0 print:px-0">
      {/* Action bar — hidden on print */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="text-sm font-semibold text-gray-700">Maison HD</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 h-9 px-4 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Printer className="h-4 w-4" />
            Друк / PDF
          </button>
        </div>
      </div>

      {/* Invoice card */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:rounded-none print:border-0">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              {seller.logoUrl && (
                <img src={seller.logoUrl} alt="logo" className="h-12 mb-3 object-contain" />
              )}
              <h1 className="text-2xl font-bold text-gray-900">Рахунок № {inv.invoiceNumber}</h1>
              <p className="text-sm text-gray-500 mt-1">від {fmtDate(inv.createdAt)}</p>
            </div>
            <div className="text-right space-y-1 flex-shrink-0">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold ${status.color}`}>
                <StatusIcon className="h-4 w-4" />
                {status.label}
              </div>
              {inv.dueDate && (
                <p className="text-xs text-gray-500">Термін: {fmtDate(inv.dueDate)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-6 px-8 py-6 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Продавець</p>
            {seller.name && <p className="font-semibold text-gray-900">{seller.name}</p>}
            {seller.type === "fop" && <p className="text-sm text-gray-600">ФОП</p>}
            {seller.taxCode && <p className="text-sm text-gray-600">{seller.type === "fop" ? "ІПН" : "ЄДРПОУ"}: <strong>{seller.taxCode}</strong></p>}
            {seller.vatNumber && <p className="text-sm text-gray-600">Свідоцтво ПДВ: {seller.vatNumber}</p>}
            {seller.address && <p className="text-sm text-gray-600">{seller.address}</p>}
            {seller.iban && <p className="text-sm text-gray-600">IBAN: <strong>{seller.iban}</strong></p>}
            {seller.bankName && <p className="text-sm text-gray-600">Банк: {seller.bankName}{seller.mfo ? ` · МФО ${seller.mfo}` : ""}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Покупець</p>
            {inv.counterpartyName && <p className="font-semibold text-gray-900">{inv.counterpartyName}</p>}
            {inv.counterpartyEdrpou && <p className="text-sm text-gray-600">ЄДРПОУ/ІПН: <strong>{inv.counterpartyEdrpou}</strong></p>}
            {inv.buyerVatNumber && <p className="text-sm text-gray-600">Свідоцтво ПДВ: {inv.buyerVatNumber}</p>}
            {inv.buyerAddress && <p className="text-sm text-gray-600">{inv.buyerAddress}</p>}
          </div>
        </div>

        {/* Description */}
        {inv.description && (
          <div className="px-8 py-4 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm text-gray-700">{inv.description}</p>
          </div>
        )}

        {/* Items table */}
        {items.length > 0 && (
          <div className="px-8 py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
                  <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Послуга / товар</th>
                  <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Кіл.</th>
                  <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ціна</th>
                  {hasVat && <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">ПДВ %</th>}
                  <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Сума</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 text-gray-400">{i + 1}</td>
                    <td className="py-2.5 text-gray-800">{it.name}</td>
                    <td className="py-2.5 text-right text-gray-700">{it.quantity ?? 1}</td>
                    <td className="py-2.5 text-right text-gray-700">{fmtMoney(it.unitPrice ?? it.amount)} грн</td>
                    {hasVat && <td className="py-2.5 text-right text-gray-500">{it.vatRate || 0}%</td>}
                    <td className="py-2.5 text-right font-medium text-gray-900">{fmtMoney(it.amount)} грн</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="px-8 pb-8">
          <div className="ml-auto max-w-xs space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Всього:</span>
              <span className="font-medium">{fmtMoney(total)} грн</span>
            </div>
            {Number(inv.taxAmount) > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>у т.ч. ПДВ:</span>
                <span>{fmtMoney(inv.taxAmount)} грн</span>
              </div>
            )}
            {paid > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Сплачено:</span>
                <span className="text-emerald-600">− {fmtMoney(paid)} грн</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>До сплати:</span>
              <span>{fmtMoney(due)} грн</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="px-8 pb-8 text-sm text-gray-500 border-t border-gray-100 pt-4">
            <p className="font-medium text-gray-700 mb-1">Примітки:</p>
            <p className="whitespace-pre-line">{inv.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between print:hidden">
          <p className="text-xs text-gray-400">Сформовано через Maison HD · maison-hd.com</p>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Зберегти як PDF
          </button>
        </div>
      </div>
    </div>
  );
}
