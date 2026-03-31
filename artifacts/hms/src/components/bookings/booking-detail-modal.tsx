import { useState } from "react";
import { Badge, Button } from "@/components/ui/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import { QrCode, CreditCard, X, ExternalLink, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("hms_token") || "";

const STATUS_UA: Record<string, string> = {
  confirmed: "Підтверджено",
  pending: "Очікує",
  checked_in: "Заселено",
  checked_out: "Виїхав",
  cancelled: "Скасовано",
};

const PAYMENT_UA: Record<string, string> = {
  paid: "Оплачено",
  unpaid: "Не оплачено",
  partial: "Частково",
  refunded: "Повернено",
};

export type BookingModalData = {
  id: number;
  guestName?: string;
  unitName?: string;
  checkIn: string;
  checkOut: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  notes?: string;
  source?: string;
  guestsCount?: number;
};

export function BookingDetailModal({
  booking,
  onClose,
}: {
  booking: BookingModalData;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [liqpayLoading, setLiqpayLoading] = useState(false);
  const [liqpayError, setLiqpayError] = useState<string | null>(null);

  const remaining = booking.totalAmount - booking.paidAmount;

  const loadQR = async () => {
    setQrLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${booking.id}/qr`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      setQrDataUrl(json.qr);
    } finally {
      setQrLoading(false);
    }
  };

  const payWithLiqPay = async () => {
    setLiqpayLoading(true);
    setLiqpayError(null);
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${booking.id}/liqpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });
      const json = await res.json();
      if (!res.ok) {
        setLiqpayError(json.message || json.error || "Помилка");
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } finally {
      setLiqpayLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold">Бронювання #{booking.id}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{booking.guestName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Details */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs font-medium uppercase mb-1">Юніт</div>
              <div className="font-medium">{booking.unitName || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs font-medium uppercase mb-1">Гостей</div>
              <div className="font-medium">{booking.guestsCount || 1}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs font-medium uppercase mb-1">Заїзд</div>
              <div className="font-medium">{formatDate(booking.checkIn)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs font-medium uppercase mb-1">Виїзд</div>
              <div className="font-medium">{formatDate(booking.checkOut)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs font-medium uppercase mb-1">Статус</div>
              <Badge
                variant={
                  booking.status === "confirmed" ? "default" :
                  booking.status === "checked_in" ? "success" :
                  booking.status === "pending" ? "warning" : "secondary"
                }
              >
                {STATUS_UA[booking.status] || booking.status}
              </Badge>
            </div>
            <div>
              <div className="text-muted-foreground text-xs font-medium uppercase mb-1">Оплата</div>
              <Badge
                variant={
                  booking.paymentStatus === "paid" ? "success" :
                  booking.paymentStatus === "partial" ? "warning" : "destructive"
                }
              >
                {PAYMENT_UA[booking.paymentStatus] || booking.paymentStatus}
              </Badge>
            </div>
          </div>

          {/* Finance summary */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Загальна сума</span>
              <span className="font-semibold">{formatCurrency(booking.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Оплачено</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(booking.paidAmount)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Залишок</span>
                <span className="font-bold text-red-500">{formatCurrency(remaining)}</span>
              </div>
            )}
          </div>

          {booking.notes && (
            <div>
              <div className="text-muted-foreground text-xs font-medium uppercase mb-1">Примітки</div>
              <div className="text-sm bg-muted/30 p-3 rounded-lg">{booking.notes}</div>
            </div>
          )}

          {/* QR preview */}
          {qrDataUrl && (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-xs text-muted-foreground">QR-код для самостійного чек-іну</p>
              <img
                src={qrDataUrl}
                alt="QR код бронювання"
                className="w-48 h-48 rounded-xl border border-border"
              />
            </div>
          )}

          {liqpayError && (
            <div className="bg-red-500/10 text-red-600 text-sm p-3 rounded-lg">
              {liqpayError}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={loadQR}
            disabled={qrLoading}
            className="flex-1"
          >
            {qrLoading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <QrCode className="w-4 h-4 mr-2" />
            }
            {qrDataUrl ? "Оновити QR" : "QR для чек-іну"}
          </Button>

          {remaining > 0 && (
            <Button
              onClick={payWithLiqPay}
              disabled={liqpayLoading}
              className="flex-1 bg-[#27ae60] hover:bg-[#219150] text-white"
            >
              {liqpayLoading
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <CreditCard className="w-4 h-4 mr-2" />
              }
              Сплатити {formatCurrency(remaining)}
              <ExternalLink className="w-3 h-3 ml-1 opacity-70" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
