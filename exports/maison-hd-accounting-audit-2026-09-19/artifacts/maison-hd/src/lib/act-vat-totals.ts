export type ActInvoiceItem = {
  vatRate?: number | string | null;
  vatAmount?: number | string | null;
  hasStoredVatAmount?: boolean;
  amount?: number | string | null;
  totalPrice?: number | string | null;
};

/**
 * Groups invoice-item VAT for the Act preview. New accounting invoices retain
 * their separately rounded, persisted VAT amounts; legacy invoice items fall
 * back to calculating VAT from their gross totals.
 */
export function calculateActVatByRate(items: readonly ActInvoiceItem[]): Record<number, number> {
  const vatByRate: Record<number, number> = {};

  for (const item of items) {
    const rate = Number(item.vatRate ?? 0);
    const hasStoredVatAmount = item.hasStoredVatAmount ?? item.vatAmount != null;
    const lineTotal = Number(item.amount ?? item.totalPrice ?? 0);
    const lineVat = hasStoredVatAmount
      ? Number(item.vatAmount)
      : rate > 0 ? lineTotal - lineTotal / (1 + rate / 100) : 0;

    vatByRate[rate] = (vatByRate[rate] || 0) + lineVat;
  }

  return vatByRate;
}