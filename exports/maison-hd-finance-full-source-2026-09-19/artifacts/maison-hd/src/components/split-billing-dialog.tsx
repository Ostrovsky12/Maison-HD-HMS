/**
 * Split Billing Dialog
 * Generates and displays separate LiqPay payment links per legal entity.
 * Shows when invoice items span 2+ legal entities.
 */
import { useState, useEffect } from "react";
import {
  X, Link2, Copy, CheckCircle2, AlertTriangle, Building2,
  RefreshCw, ExternalLink, Loader2, CreditCard, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = BASE.replace("/maison-hd", "") + "/api";
const tok  = () => localStorage.getItem("hms_token");
const apiFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const uah = (n: number) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " грн";

interface SplitEntry {
  splitId: number;
  legalEntityId: number;
  entityName: string;
  amount: number;
  currency: string;
  paymentLink: string | null;
  orderId: string;
  status: string;
  items: Array<{ description: string; amount: number }>;
}

interface SplitResult {
  splits: SplitEntry[];
  total: number;
  isSplit: boolean;
  missingKeys: string[];
}

interface Props {
  invoiceId: number;
  invoiceNumber: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  totalAmount: number;
  onClose: () => void;
}

export function SplitBillingDialog({
  invoiceId, invoiceNumber, guestName, guestEmail, guestPhone, totalAmount, onClose,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<SplitResult | null>(null);
  const [copiedId, setCopiedId]     = useState<number | null>(null);
  const [allCopied, setAllCopied]   = useState(false);

  const generate = async (regenerate = false) => {
    setLoading(true);
    try {
      const resp = await apiFetch(`${API}/payment-layer/invoices/${invoiceId}/splits`, {
        method: "POST",
        body: JSON.stringify({ guestName, guestEmail, guestPhone, regenerate }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || "Помилка генерації");
      const data: SplitResult = await resp.json();
      setResult(data);
      if (data.missingKeys.length > 0) {
        toast({
          title: "Деякі ключі не налаштовані",
          description: data.missingKeys.join("; "),
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Помилка", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Auto-load existing splits on open
  useEffect(() => {
    (async () => {
      try {
        const resp = await apiFetch(`${API}/payment-layer/invoices/${invoiceId}/splits`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.splits?.length > 0) {
            setResult({
              splits: data.splits.map((s: any) => ({
                splitId: s.id,
                legalEntityId: s.legal_entity_id,
                entityName: s.entity_name,
                amount: Number(s.amount),
                currency: s.currency,
                paymentLink: s.payment_link,
                orderId: s.order_id,
                status: s.status,
                items: s.items_snapshot || [],
              })),
              total: data.splits.reduce((s: number, r: any) => s + Number(r.amount), 0),
              isSplit: data.isSplit,
              missingKeys: [],
            });
            return;
          }
        }
      } catch {}
      // No existing splits — auto-generate
      generate();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = async (entry: SplitEntry) => {
    if (!entry.paymentLink) return;
    await navigator.clipboard.writeText(entry.paymentLink);
    setCopiedId(entry.splitId);
    setTimeout(() => setCopiedId(null), 2500);
    toast({ title: "Скопійовано!", description: `Посилання для ${entry.entityName}` });
  };

  const copyAll = async () => {
    if (!result) return;
    const lines = result.splits
      .filter(s => s.paymentLink)
      .map((s, i) => `${i + 1}. ${s.entityName} — ${uah(s.amount)}\n${s.paymentLink}`)
      .join("\n\n");
    await navigator.clipboard.writeText(lines);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 3000);
    toast({ title: "Всі посилання скопійовані!" });
  };

  const entityTypeLabel = (type?: string) =>
    type === "tov" ? "ТОВ" : type === "fop" ? "ФОП" : "";

  const statusColor = (status: string) => {
    if (status === "paid") return "bg-emerald-100 text-emerald-700";
    if (status === "failed" || status === "expired") return "bg-red-100 text-red-600";
    return "bg-amber-100 text-amber-700";
  };

  const statusLabel = (status: string) => {
    if (status === "paid") return "Оплачено";
    if (status === "failed") return "Помилка";
    if (status === "expired") return "Прострочено";
    return "Очікує";
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">Оплата по юридичних особах</div>
              <div className="text-xs text-gray-400">Рахунок № {invoiceNumber} · {uah(totalAmount)}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
              <div className="text-sm text-gray-500 text-center">
                Генеруємо окремі посилання<br />для кожної юридичної особи...
              </div>
            </div>
          ) : result ? (
            <>
              {/* Info banner */}
              {result.isSplit ? (
                <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl p-3">
                  <Building2 className="w-5 h-5 text-violet-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-violet-800">
                    <span className="font-semibold">Розщеплена оплата — {result.splits.length} юр. особи.</span>
                    {" "}Кожна юридична особа отримає кошти безпосередньо на свій рахунок LiqPay.
                    Гість сплачує {result.splits.length} окремих посилання.
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-emerald-800">
                    <span className="font-semibold">Єдина юр. особа.</span>
                    {" "}Всі послуги належать одній юридичній особі — одне посилання.
                  </div>
                </div>
              )}

              {/* Missing keys warning */}
              {result.missingKeys.length > 0 && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-red-700">
                    <span className="font-semibold">LiqPay ключі не налаштовані:</span>
                    <ul className="mt-1 space-y-0.5">
                      {result.missingKeys.map((m, i) => <li key={i}>• {m}</li>)}
                    </ul>
                    <div className="mt-1">Перейдіть: Фінанси → Юридичні особи → налаштуйте LiqPay ключі</div>
                  </div>
                </div>
              )}

              {/* Splits */}
              <div className="space-y-3">
                {result.splits.map((entry) => (
                  <div key={entry.splitId} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Entity header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{entry.entityName}</div>
                          <div className="text-xs text-gray-400">{uah(entry.amount)}</div>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(entry.status)}`}>
                        {statusLabel(entry.status)}
                      </span>
                    </div>

                    {/* Items */}
                    {entry.items.length > 0 && (
                      <div className="px-4 py-2 border-b border-gray-100">
                        {entry.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs text-gray-500 py-0.5">
                            <span className="truncate mr-2">{item.description}</span>
                            <span className="flex-shrink-0 font-medium">{uah(Number(item.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Payment link */}
                    <div className="px-4 py-3">
                      {entry.paymentLink ? (
                        <div className="flex gap-2">
                          <div className="flex-1 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 truncate font-mono">
                            {entry.paymentLink.slice(0, 55)}...
                          </div>
                          <button
                            onClick={() => copyLink(entry)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors flex-shrink-0"
                          >
                            {copiedId === entry.splitId
                              ? <CheckCircle2 className="w-3.5 h-3.5" />
                              : <Copy className="w-3.5 h-3.5" />
                            }
                            {copiedId === entry.splitId ? "Скопійовано" : "Копіювати"}
                          </button>
                          <a
                            href={entry.paymentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center w-9 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-red-500">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          LiqPay ключі не налаштовані для цієї юр. особи
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {!loading && result && (
          <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            {result.splits.some(s => s.paymentLink) && (
              <button
                onClick={copyAll}
                className="flex items-center gap-2 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
              >
                {allCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {allCopied ? "Скопійовано!" : "Копіювати всі"}
              </button>
            )}
            <button
              onClick={() => generate(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Оновити
            </button>
            <button
              onClick={onClose}
              className="ml-auto h-9 px-4 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Закрити
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
