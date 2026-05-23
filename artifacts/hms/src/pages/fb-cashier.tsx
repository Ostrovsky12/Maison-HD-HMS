import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Bell, CheckCircle2, XCircle, Clock, ShoppingBag, RefreshCw,
  Wifi, Printer, ChefHat, Wine, ChevronDown, ChevronUp,
  Plus, CreditCard, Banknote, Search, X, UtensilsCrossed,
  FileText, Gift, Wallet, Layers, Users, Hash, Calendar,
  TrendingUp, Archive, DollarSign, Power, RotateCcw, Send,
  Receipt as ReceiptIcon,
} from "lucide-react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "/api/fb";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

// ─── Sound ────────────────────────────────────────────────────────────────────
function playAlert() {
  try {
    const ctx = new AudioContext();
    const freqs = [880, 1100, 880, 1100];
    freqs.forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = "square";
      g.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.14);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.14);
    });
  } catch {}
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff} сек тому`;
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  return `${Math.floor(diff / 3600)} год тому`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface TableNotification {
  id: number;
  table_number: string;
  table_location: string;
  type: "waiter_call" | "payment_cash" | "payment_terminal";
  payload: { total?: string; orderId?: number } | null;
  created_at: string;
}
interface OrderItem { id: number; name: string; quantity: number; price: string; total_price: string; notes?: string; is_alcohol?: boolean; status?: string; }
interface GuestOrder {
  id: number; status: string; guest_name: string; guest_count: number;
  notes?: string; total_amount: string; opened_at: string;
  table_number?: string; table_location?: string;
  items: OrderItem[];
}
interface ActiveOrder {
  id: number; status: string; order_type: string; guest_name: string;
  total_amount: string; opened_at: string;
  tableNumber?: string | null; tableId?: number | null;
  tipPct?: number | null;
  items?: OrderItem[];
}
interface MenuItem { id: number; name: string; price: string; categoryName: string; }
interface PrintJob {
  id: number; printer_type: string; station: string; status: string;
  printer_name?: string; error_msg?: string; printed_at?: string;
}
interface AcceptedOrder extends GuestOrder { printJobs?: PrintJob[]; acceptedAt: Date; }

// ─── Print Badge ──────────────────────────────────────────────────────────────
const PTYPE: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  kitchen: { label: "Кухня", icon: <ChefHat className="w-3 h-3" />, color: "orange" },
  bar:     { label: "Бар",   icon: <Wine     className="w-3 h-3" />, color: "purple" },
  receipt: { label: "Чек",   icon: <Printer  className="w-3 h-3" />, color: "blue"   },
};
const PSTYLE: Record<string, string> = {
  queued: "bg-yellow-50 text-yellow-700 border-yellow-200",
  printing: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};
function PrintJobBadge({ job }: { job: PrintJob }) {
  const info = PTYPE[job.printer_type] || { label: job.printer_type, icon: <Printer className="w-3 h-3" />, color: "gray" };
  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${PSTYLE[job.status] || PSTYLE.queued}`}>
      {info.icon}<span>{info.label}</span><span className="opacity-60">·</span>
      <span>{{ queued: "очікує", printing: "друкує", done: "надруковано", failed: "помилка" }[job.status] || job.status}</span>
    </div>
  );
}

// ─── New Order Modal ───────────────────────────────────────────────────────────
function NewOrderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tableNumber, setTableNumber] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!tableNumber.trim() && orderType === "dine_in") { setError("Введіть номер столу"); return; }
    setCreating(true); setError("");
    try {
      // Fetch tables to resolve number → id
      const td = await apiFetch("/tables").catch(() => ({ tables: [] }));
      const tables: any[] = td.tables || [];
      const matched = tables.find(
        t => String(t.table_number ?? t.number ?? "").toLowerCase() === tableNumber.trim().toLowerCase()
      );
      await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: matched?.id || null,
          orderType,
          guestName: orderType === "takeaway" ? "Takeaway" : `Стіл ${tableNumber.trim() || "?"}`,
          guestCount,
          notes: notes || undefined,
        }),
      });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-base flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-blue-600" /> Нове замовлення
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Order type */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Тип замовлення</label>
            <div className="grid grid-cols-2 gap-2">
              {([["dine_in", "В залі"], ["takeaway", "Takeaway"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setOrderType(val)}
                  className={`py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${orderType === val ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table number */}
          {orderType === "dine_in" && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-1.5">
                <Hash className="w-4 h-4" /> Номер столу
              </label>
              <input
                type="text"
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                placeholder="напр. 5, VIP-1, Т-2"
                autoFocus
                className="w-full px-4 py-3 text-2xl font-black text-center border-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          {/* Guest count */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Кількість гостей
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4,5,6,7,8].map(n => (
                <button key={n} onClick={() => setGuestCount(n)}
                  className={`py-2.5 rounded-xl font-bold text-base border-2 transition-colors ${guestCount === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Примітки</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Алергії, побажання..."
              className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={handleCreate} disabled={creating}
            className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-md text-base flex items-center justify-center gap-2">
            {creating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {creating ? "Створення..." : "Відкрити замовлення"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Print Bill — internal printer first, browser fallback ───────────────────
async function printBill(order: ActiveOrder): Promise<{ ok: boolean; msg: string }> {
  try {
    const result = await apiFetch(`/orders/${order.id}/print-receipt`, { method: "POST" });
    return { ok: true, msg: `Надруковано на ${result.printerName || "принтер чеків"}` };
  } catch (apiErr: any) {
    if ((apiErr.message || "").includes("не налаштований") || (apiErr.message || "").includes("404")) {
      await printBillBrowser(order);
      return { ok: true, msg: "Відкрито діалог друку браузера" };
    }
    throw apiErr;
  }
}

// ─── Pre-check (передрахунок) — 4-column table format ────────────────────────
async function printBillBrowser(order: ActiveOrder) {
  let cfg: any = {};
  try { const d = await apiFetch("/config/section/receipt"); cfg = d.data || {}; } catch {}

  const estName = cfg.establishment_name || "Maison HD";
  const fmtNum = (n: number) =>
    n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDateTime = (d: Date) =>
    d.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" }) + " " +
    d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  const now = new Date();
  const openedAt = order.opened_at ? fmtDateTime(new Date(order.opened_at)) : "—";
  const printedAt = fmtDateTime(now);
  const tableLabel = [
    order.tableNumber ? String(order.tableNumber) : "",
    (order as any).tableLocation ? `(${(order as any).tableLocation})` : "",
  ].filter(Boolean).join("") || "—";

  const items = order.items || [];
  const total = items.reduce((s: number, i: any) => s + parseFloat(i.total_price || "0"), 0);
  const vatTotal = items.reduce((s: number, i: any) => {
    const tp = parseFloat(i.total_price || "0");
    const rate = parseFloat((i as any).vat_rate || "0");
    return s + (rate > 0 ? tp - tp / (1 + rate / 100) : 0);
  }, 0);

  const logoHtml = cfg.logo_url
    ? `<div style="text-align:center;margin-bottom:5px"><img src="${cfg.logo_url}" style="max-height:60px;max-width:200px" onerror="this.remove()"/></div>`
    : "";

  const itemsHtml = items.map((it: any) => {
    const qty = parseFloat(it.quantity || 1);
    const tp = parseFloat(it.total_price || "0");
    const unit = qty > 0 ? tp / qty : 0;
    const qtyLabel = qty % 1 !== 0 ? qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(qty);
    return `<tr>
      <td style="word-break:break-word;padding-right:6px;vertical-align:top">${it.name}</td>
      <td style="text-align:right;white-space:nowrap;vertical-align:top">${qtyLabel}</td>
      <td style="text-align:right;white-space:nowrap;vertical-align:top">${fmtNum(unit)}</td>
      <td style="text-align:right;white-space:nowrap;vertical-align:top">${fmtNum(tp)}</td>
    </tr>`;
  }).join("");

  const win = window.open("", "_blank", "width=420,height=820");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Передрахунок</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:11px;padding:12px 14px;max-width:302px;margin:0 auto;color:#111}
  .c{text-align:center}
  hr{border:none;border-top:1px dashed #777;margin:7px 0}
  .m{display:flex;margin:2px 0;font-size:10px;line-height:1.4}
  .ml{color:#444;min-width:86px;flex-shrink:0}
  table{width:100%;border-collapse:collapse}
  th{font-size:9px;padding:2px 2px 3px;color:#333;border-bottom:1px solid #888;font-weight:normal}
  th:first-child{text-align:left}
  th:not(:first-child){text-align:right}
  td{font-size:10px;padding:2.5px 2px;line-height:1.35}
  .tr{display:flex;align-items:flex-end;margin:3px 0;font-size:10px}
  .tl{flex-shrink:0}
  .td{flex:1;border-bottom:1px dotted #999;margin:0 3px;min-width:8px;height:9px}
  .tv{flex-shrink:0;font-weight:bold}
  .sm{font-size:9px;color:#555}
  @media print{body{padding:3px 5px}@page{margin:4mm}}
</style></head><body>
${logoHtml}
<div class="c" style="font-size:15px;font-weight:bold;letter-spacing:1px">${estName}</div>
<hr/>
${cfg.print_number !== false && (order as any).receiptNumber ? `<div class="m"><span class="ml">Чек №</span><span>${(order as any).receiptNumber}</span></div>` : ""}
<div class="m"><span class="ml">Відкрито</span><span>${openedAt}</span></div>
<div class="m"><span class="ml">Надруковано</span><span>${printedAt}</span></div>
<div class="m"><span class="ml">Стіл №</span><span>${tableLabel}</span></div>
<div class="m"><span class="ml">К-сть гостей</span><span>${(order as any).guestCount || 1}</span></div>
${order.guest_name ? `<div class="m"><span class="ml">Гість</span><span>${order.guest_name}</span></div>` : ""}
<hr/>
<table>
  <thead><tr>
    <th>Найменування</th><th>К-сть</th><th>Ціна</th><th>Загалом</th>
  </tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<hr/>
<div class="tr">
  <span class="tl" style="font-weight:bold">До оплати</span>
  <span class="td"></span>
  <span class="tv">${fmtNum(total)}&nbsp;грн</span>
</div>
<div class="tr">
  <span class="tl sm">в т.ч. ПДВ</span>
  <span class="td"></span>
  <span class="tv sm">${fmtNum(vatTotal)}&nbsp;грн</span>
</div>
${cfg.guest_message ? `<hr/><div class="c sm" style="font-style:italic;margin:3px 0">${cfg.guest_message}</div>` : ""}
${cfg.footer_text ? `<hr/><div class="c sm">${cfg.footer_text}</div>` : ""}
<hr/>
<div class="c sm">Дякуємо за відвідування!</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`);
  win.document.close();
}

// ─── Final receipt (фіскальний чек) — printed after payment ──────────────────
async function printFinalReceiptBrowser(order: any) {
  let cfg: any = {};
  try { const d = await apiFetch("/config/section/receipt"); cfg = d.data || {}; } catch {}

  const estName = cfg.establishment_name || "Maison HD";
  const legalName  = cfg.legal_name    || "";
  const legalAddr  = cfg.legal_address || "";
  const taxId      = cfg.tax_id        || "";

  const fmtNum = (n: number) =>
    n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDT = (d: Date) => {
    const date = d.toLocaleDateString("uk-UA");
    const time = d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${date}, ${time}`;
  };

  const now = new Date();
  const openedRaw  = order.opened_at  || order.openedAt;
  const closedRaw  = order.closed_at  || order.closedAt;
  const openedAt   = openedRaw  ? fmtDT(new Date(openedRaw))  : "—";
  const closedAt   = closedRaw  ? fmtDT(new Date(closedRaw))  : fmtDT(now);

  const tableLabel = [
    order.tableNumber || order.table_number ? String(order.tableNumber || order.table_number) : "",
    order.tableLocation || order.table_location ? `(${order.tableLocation || order.table_location})` : "",
  ].filter(Boolean).join("") || "—";

  const items: any[] = order.items || [];
  const total          = parseFloat(order.total_amount  || order.totalAmount  || "0");
  const discountAmount = parseFloat(order.discount_amount || order.discountAmount || "0");
  const tipAmount      = parseFloat(order.tip_amount    || order.tipAmount    || "0");
  const guestCount     = order.guest_count || order.guestCount || 1;
  const receiptNum     = order.receipt_number || order.receiptNumber || "";

  const PM_LABELS: Record<string, string> = {
    cash: "Готівка", card: "Безготівкова", mixed: "Змішана",
    invoice: "Безготівкова", qr: "Безготівкова",
    certificate: "Сертифікат", deposit: "Депозит",
  };
  const PM_SUB: Record<string, string> = {
    card: "Картка", invoice: "Рахунок", qr: "Інтернет еквайринг",
  };
  const pm       = order.payment_method || order.paymentMethod || "cash";
  const pmLabel  = PM_LABELS[pm] || pm;
  const pmSub    = PM_SUB[pm] || "";

  const fiscalStatus = order.fiscal_status || order.fiscalStatus;
  const fiscalUrl    = order.fiscal_receipt_url || order.fiscalReceiptUrl || "";
  const fiscalQrUrl  = order.fiscal_qr_url     || order.fiscalQrUrl      || fiscalUrl;
  const isFiscal     = fiscalStatus === "done" && !!fiscalUrl;

  const logoHtml = cfg.logo_url
    ? `<div style="text-align:center;margin-bottom:5px"><img src="${cfg.logo_url}" style="max-height:60px;max-width:200px" onerror="this.remove()"/></div>`
    : "";

  const itemsHtml = items.map((it: any) => {
    const qty = parseFloat(it.quantity || 1);
    const tp  = parseFloat(it.total_price || "0");
    const unit = qty > 0 ? tp / qty : 0;
    if (qty === 1) {
      return `<div style="display:flex;justify-content:space-between;margin:3px 0;font-size:10px">
        <span style="flex:1;margin-right:4px">${it.name}</span>
        <span style="white-space:nowrap">${fmtNum(tp)}&nbsp;₴</span>
      </div>`;
    }
    const qtyLabel = qty % 1 !== 0 ? qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(qty);
    return `<div style="margin:3px 0;font-size:10px">
      <div style="color:#555;font-size:9px">${qtyLabel}&nbsp;x&nbsp;${fmtNum(unit)}</div>
      <div style="display:flex;justify-content:space-between">
        <span style="flex:1;margin-right:4px">${it.name}</span>
        <span style="white-space:nowrap">${fmtNum(tp)}&nbsp;₴</span>
      </div>
    </div>`;
  }).join("");

  const win = window.open("", "_blank", "width=420,height=960");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Чек</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:11px;padding:12px 14px;max-width:302px;margin:0 auto;color:#111}
  .c{text-align:center}
  hr{border:none;border-top:1px dashed #777;margin:6px 0}
  .m{display:flex;margin:2px 0;font-size:10px;line-height:1.4}
  .ml{color:#444;min-width:90px;flex-shrink:0}
  .row{display:flex;justify-content:space-between;margin:2.5px 0;font-size:10px}
  .bold{font-weight:bold}
  .sm{font-size:9px;color:#555}
  @media print{body{padding:3px 5px}@page{margin:4mm}}
</style></head><body>
${logoHtml}
<div class="c bold" style="font-size:15px;letter-spacing:1px">${estName}</div>
${legalName || legalAddr || taxId ? `<div style="height:5px"></div>
${legalName ? `<div class="c" style="font-size:10px">${legalName}</div>` : ""}
${legalAddr ? `<div class="c" style="font-size:9px;color:#444;margin-top:2px">${legalAddr}</div>` : ""}
${taxId ? `<div class="c" style="font-size:9px;color:#444">ІД ${taxId}</div>` : ""}` : ""}
<hr/>
${receiptNum && cfg.print_number !== false ? `<div class="m"><span class="ml">Чек №</span><span>${receiptNum}</span></div>` : ""}
<div class="m"><span class="ml">Відкрито</span><span>${openedAt}</span></div>
<div class="m"><span class="ml">Надруковано</span><span>${closedAt}</span></div>
<div class="m"><span class="ml">Стіл №</span><span>${tableLabel}</span></div>
<div class="m"><span class="ml">К-сть гостей</span><span>${guestCount}</span></div>
${order.guest_name || order.guestName ? `<div class="m"><span class="ml">Гість</span><span>${order.guest_name || order.guestName}</span></div>` : ""}
<hr/>
${itemsHtml}
<hr/>
<div style="font-size:10px;margin:2px 0">Оплата</div>
<hr/>
<div class="row"><span class="bold">${pmLabel}</span><span class="bold">${fmtNum(total)}&nbsp;грн</span></div>
${pmSub ? `<div style="font-size:9px;color:#555;margin:1px 0 0 8px">${pmSub}</div>` : ""}
${discountAmount > 0 ? `<div class="row sm"><span>Знижка</span><span>-${fmtNum(discountAmount)}&nbsp;грн</span></div>` : ""}
${tipAmount > 0 ? `<div class="row sm"><span>Сервісний збір</span><span>+${fmtNum(tipAmount)}&nbsp;грн</span></div>` : ""}
<hr/>
<div class="row"><span>Сума</span><span>${fmtNum(total)}&nbsp;грн</span></div>
<div class="row sm"><span>Без ПДВ ₴</span><span>0,00</span></div>
<div class="row bold"><span>До сплати</span><span>${fmtNum(total)}&nbsp;грн</span></div>
${isFiscal ? `<hr/>
<div class="c sm" style="line-height:1.7">
  ${receiptNum ? `<div>Чек № ${receiptNum}</div>` : ""}
  <div>${closedAt}</div>
  <div>ОНЛАЙН</div>
  <div class="bold">ФІСКАЛЬНИЙ ЧЕК</div>
  <div>Maison HD</div>
</div>
<hr/>
<div class="c"><img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(fiscalQrUrl)}" style="width:120px;height:120px;margin:4px auto;display:block"/></div>` : ""}
${cfg.guest_message ? `<hr/><div class="c sm" style="font-style:italic;margin:3px 0">${cfg.guest_message}</div>` : ""}
${cfg.print_wifi && cfg.wifi_name ? `<hr/><div class="c sm">Wi-Fi: <b>${cfg.wifi_name}</b>${cfg.wifi_password ? `<br/>Пароль: ${cfg.wifi_password}` : ""}</div>` : ""}
${cfg.footer_text ? `<hr/><div class="c sm">${cfg.footer_text}</div>` : ""}
<hr/>
<div class="c sm">Дякуємо за відвідування!</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`);
  win.document.close();
}

// ─── Add Item Modal (full menu with categories) ────────────────────────────────
function AddItemModal({ orderId, onClose, onDone }: { orderId: number; onClose: () => void; onDone: () => void }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [justAdded, setJustAdded] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [qtys, setQtys] = useState<Record<number, number>>({});

  useEffect(() => {
    Promise.all([
      apiFetch("/categories").catch(() => ({ categories: [] })),
      apiFetch("/items?available=true").catch(() => ({ items: [] })),
    ]).then(([cd, id]) => {
      setCategories(cd.categories || []);
      setItems(id.items || []);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(it => {
    if (search) return it.name.toLowerCase().includes(search.toLowerCase()) || (it.categoryName || "").toLowerCase().includes(search.toLowerCase());
    if (activeCat !== "all") return it.category_id === activeCat;
    return true;
  });

  function getQty(id: number) { return qtys[id] ?? 1; }
  function setQty(id: number, v: number) { setQtys(q => ({ ...q, [id]: Math.max(1, v) })); }

  async function handleAdd(item: any) {
    setAdding(item.id);
    try {
      await apiFetch(`/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, quantity: getQty(item.id) }),
      });
      setJustAdded(s => { const n = new Set(s); n.add(item.id); return n; });
      setTimeout(() => setJustAdded(s => { const n = new Set(s); n.delete(item.id); return n; }), 2000);
      onDone();
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setAdding(null); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
      <div className="bg-white flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 bg-amber-50">
          <div>
            <h3 className="font-bold text-base">Додати страву</h3>
            <p className="text-xs text-gray-500">Замовлення #{orderId}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveCat("all"); }}
              autoFocus placeholder="Пошук..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b shrink-0 bg-gray-50/60">
            <button
              onClick={() => setActiveCat("all")}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeCat === "all" ? "bg-amber-500 text-white shadow-sm" : "bg-white border text-gray-600 hover:bg-amber-50"}`}
            >
              Всі
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${activeCat === c.id ? "bg-amber-500 text-white shadow-sm" : "bg-white border text-gray-600 hover:bg-amber-50"}`}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Нічого не знайдено</div>
          ) : filtered.map(it => {
            const isAdded = justAdded.has(it.id);
            const isPending = adding === it.id;
            const qty = getQty(it.id);
            return (
              <div key={it.id} className="bg-white border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {it.image_url && (
                    <img src={it.image_url} alt={it.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-tight">{it.name}</div>
                    <div className="text-xs text-gray-400">{it.categoryName}</div>
                  </div>
                  <span className="font-bold text-amber-600 text-sm shrink-0 mr-1">
                    {(parseFloat(it.price) * qty).toFixed(0)} ₴
                  </span>
                  {/* Quantity */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setQty(it.id, qty - 1)}
                      className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 text-sm font-bold"
                    >−</button>
                    <span className="w-5 text-center text-xs font-bold">{qty}</span>
                    <button
                      onClick={() => setQty(it.id, qty + 1)}
                      className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 text-sm font-bold"
                    >+</button>
                  </div>
                  <button
                    onClick={() => handleAdd(it)}
                    disabled={isPending}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isAdded ? "bg-green-100 text-green-700" : "bg-amber-500 text-white hover:bg-amber-600"
                    }`}
                  >
                    {isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : isAdded ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : <Plus className="w-3.5 h-3.5" />}
                    {isAdded ? "Ок" : "Дод."}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t shrink-0 bg-gray-50">
          <button onClick={onClose}
            className="w-full py-2.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shift Bar ─────────────────────────────────────────────────────────────────
function ShiftBar({ onCashMovement, onXReport, onYReport, onPeriodReport }: {
  onCashMovement: () => void; onXReport: () => void; onYReport: () => void; onPeriodReport: () => void;
}) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [legalEntities, setLegalEntities] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/cashbox/session");
      setSessions(d.sessions || (d.session ? [d.session] : []));
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  async function handleShowOpen() {
    setShowOpenForm(true);
    try {
      const d = await apiFetch("/cashbox/legal-entities");
      const entities: any[] = d.legalEntities || [];
      setLegalEntities(entities);
      const init: Record<number, string> = {};
      entities.forEach(e => { if (!e.session_id) init[e.id] = ""; });
      setBalances(init);
    } catch {}
  }

  async function handleOpen() {
    setOpening(true);
    try {
      const unopened = legalEntities.filter(e => !e.session_id);
      if (unopened.length === 0) {
        await apiFetch("/cashbox/session", {
          method: "POST",
          body: JSON.stringify({ openingBalance: 0, cashboxName: "Каса 1" }),
        });
      } else {
        for (const e of unopened) {
          try {
            await apiFetch("/cashbox/session", {
              method: "POST",
              body: JSON.stringify({
                openingBalance: parseFloat(balances[e.id] || "0"),
                cashboxName: e.short_name || e.name,
                legalEntityId: e.id,
              }),
            });
          } catch (err: any) {
            if (!err.message?.includes("вже відкрита")) throw err;
          }
        }
      }
      setShowOpenForm(false);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setOpening(false); }
  }

  async function handleClose(sessionId: number) {
    if (!confirm("Закрити зміну? Переконайтесь що всі замовлення закриті.")) return;
    setClosingId(sessionId);
    try {
      await apiFetch(`/cashbox/session/${sessionId}/close`, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (e: any) { alert(e.message); }
    finally { setClosingId(null); }
  }

  if (loading) return <div className="h-8 border-b bg-gray-50 animate-pulse" />;

  if (sessions.length > 0) {
    return (
      <div className="border-b bg-green-50 shrink-0">
        {sessions.map((session, idx) => {
          const balance = parseFloat(session.expected_balance || "0");
          return (
            <div key={session.id} className="px-3 py-1.5 flex items-center gap-2 text-xs flex-wrap">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
              <span className="font-bold text-green-800">
                {session.entity_short_name || session.entity_name || "Зміна"} відкрита
              </span>
              <span className="text-green-600">
                з {new Date(session.opened_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-gray-400">·</span>
              <span className="font-semibold text-gray-700">Каса: {balance.toFixed(0)} ₴</span>
              <div className="flex gap-1 ml-auto flex-wrap justify-end">
                {idx === 0 && (
                  <>
                    <button onClick={onXReport}
                      className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold hover:bg-blue-200 transition-colors">
                      X-звіт
                    </button>
                    <button onClick={onYReport}
                      className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-bold hover:bg-purple-200 transition-colors">
                      Y-звіт
                    </button>
                    <button onClick={onPeriodReport}
                      className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold hover:bg-amber-200 transition-colors flex items-center gap-0.5">
                      <Calendar className="w-3 h-3" /> Период
                    </button>
                    <button onClick={onCashMovement}
                      className="px-2 py-0.5 rounded-md bg-green-100 text-green-700 font-bold hover:bg-green-200 transition-colors flex items-center gap-0.5">
                      <DollarSign className="w-3 h-3" /> Рух
                    </button>
                  </>
                )}
                <button onClick={() => handleClose(session.id)} disabled={closingId === session.id}
                  className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 font-bold hover:bg-red-200 transition-colors flex items-center gap-0.5">
                  <Power className="w-3 h-3" /> Закрити
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (showOpenForm) {
    const unopened = legalEntities.filter(e => !e.session_id);
    return (
      <div className="border-b bg-amber-50 shrink-0 px-3 py-2">
        <p className="text-xs font-semibold text-amber-800 mb-2">Внесення готівки при відкритті зміни:</p>
        {unopened.length > 0 ? unopened.map(e => (
          <div key={e.id} className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium text-gray-700 flex-1 truncate min-w-0">
              {e.short_name || e.name}
            </span>
            <input
              type="number"
              value={balances[e.id] ?? ""}
              onChange={ev => setBalances(prev => ({ ...prev, [e.id]: ev.target.value }))}
              placeholder="0.00" min={0} step={0.01}
              className="w-28 px-2 py-1 border rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-xs text-gray-500 shrink-0">₴</span>
          </div>
        )) : (
          <p className="text-xs text-gray-500 mb-1.5">Немає зареєстрованих юр. осіб</p>
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={handleOpen} disabled={opening}
            className="px-3 py-1 rounded-md bg-green-600 text-white text-xs font-bold hover:bg-green-700">
            {opening ? "Відкриваємо..." : "Відкрити зміни"}
          </button>
          <button onClick={() => setShowOpenForm(false)}
            className="px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-xs hover:bg-gray-200">
            Скасувати
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-1.5 border-b bg-amber-50 flex items-center gap-2 text-xs shrink-0">
      <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
      <span className="text-amber-800 font-semibold">Зміна не відкрита</span>
      <button onClick={handleShowOpen}
        className="ml-auto px-3 py-0.5 rounded-md bg-green-600 text-white font-bold hover:bg-green-700 flex items-center gap-1">
        <Power className="w-3 h-3" /> Відкрити зміну
      </button>
    </div>
  );
}

// ─── Cash Movement Modal ──────────────────────────────────────────────────────
type MovementType = "in" | "out" | "expense";
const MOVEMENT_TYPES: { id: MovementType; label: string; btn: string; cls: string; actionLabel: string }[] = [
  { id: "in",      label: "↓ Внесення",  btn: "Внести до каси",  cls: "bg-green-600 hover:bg-green-700",  actionLabel: "Внесення" },
  { id: "out",     label: "↑ Інкасація", btn: "Інкасувати",       cls: "bg-red-500 hover:bg-red-600",      actionLabel: "Інкасація" },
  { id: "expense", label: "↗ Витрата",   btn: "Провести витрату", cls: "bg-orange-500 hover:bg-orange-600", actionLabel: "Витрата" },
];

function CashMovementModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<MovementType>("in");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = MOVEMENT_TYPES.find(m => m.id === type)!;

  async function handleSave() {
    if (!amount || parseFloat(amount) <= 0) { setError("Введіть суму"); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/cashbox/movement", {
        method: "POST",
        body: JSON.stringify({ type: type === "expense" ? "out" : type, amount: parseFloat(amount), notes: notes || selected.actionLabel }),
      });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-500" /> Рух готівки
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex rounded-xl border overflow-hidden">
            {MOVEMENT_TYPES.map(m => (
              <button key={m.id} onClick={() => setType(m.id)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${type === m.id ? `${m.cls} text-white` : "hover:bg-gray-50 text-gray-600"}`}>
                {m.label}
              </button>
            ))}
          </div>
          <input
            type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="Сума, ₴" min={0} step={0.01} autoFocus
            className="w-full px-3 py-3 text-2xl font-black border-2 rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Примітка (необов'язково)"
            className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button
            onClick={handleSave} disabled={saving}
            className={`w-full py-3 font-bold rounded-xl text-white transition-colors ${selected.cls}`}
          >
            {saving ? "Зберігаємо..." : selected.btn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────
const PAY_LABELS: Record<string, string> = {
  cash: "Готівка", card: "Картка", mixed: "Змішана",
  invoice: "Рах. рахунок", certificate: "Сертифікат", deposit: "Депозит",
};

function ReportSalesBlock({ byPayment, byOutlet, totals, bgClass = "bg-green-50" }: {
  byPayment: any[]; byOutlet?: any[]; totals: any; bgClass?: string;
}) {
  const hasOutlets = byOutlet && byOutlet.length > 0;
  return (
    <div className="space-y-3">
      <div className={`${bgClass} rounded-xl p-3 flex justify-between items-center`}>
        <div>
          <div className="text-xs text-gray-500">Чеків: {totals?.checks || 0}</div>
          <div className="text-xs text-gray-500">Гостей: {totals?.guests || "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Виручка</div>
          <div className="font-black text-xl text-gray-900">{parseFloat(totals?.revenue || "0").toFixed(2)} ₴</div>
        </div>
      </div>

      {hasOutlets && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">По точках продажу</h4>
          <div className="space-y-1">
            {byOutlet!.map((r: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-100 items-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: r.outlet_color || "#6b7280" }}>
                    {r.outlet_icon}
                  </span>
                  <span className="text-gray-700">{r.outlet_name}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold">{parseFloat(r.amount).toFixed(2)} ₴</span>
                  <span className="text-gray-400 text-xs ml-2">({r.cnt} чек.)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {byPayment?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">По способу оплати</h4>
          <div className="space-y-1">
            {byPayment.map((r: any) => (
              <div key={r.method} className="flex justify-between text-sm py-1 border-b border-gray-100">
                <span className="text-gray-700">{PAY_LABELS[r.method] || r.method}</span>
                <div className="text-right">
                  <span className="font-bold">{parseFloat(r.amount).toFixed(2)} ₴</span>
                  <span className="text-gray-400 text-xs ml-2">({r.cnt} чек.)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!byPayment?.length && (
        <p className="text-sm text-gray-400 text-center py-3">Продажів немає</p>
      )}
    </div>
  );
}

// ─── X-Report Modal ───────────────────────────────────────────────────────────
function XReportModal({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/cashbox/session").then(d => {
      const sess: any[] = d.sessions || (d.session ? [d.session] : []);
      setSessions(sess);
      if (sess.length > 0) setSelectedId(sess[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setData(null);
    apiFetch(`/cashbox/x-report?sessionId=${selectedId}`).then(setData).catch(() => setData(null));
  }, [selectedId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" /> X-Звіт (поточна зміна)
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">Завантаження...</div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
            <Power className="w-8 h-8" />
            <p className="text-sm">Немає відкритих змін</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sessions.length > 1 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Юр. особа:</p>
                <div className="flex flex-wrap gap-2">
                  {sessions.map(s => (
                    <button key={s.id} onClick={() => setSelectedId(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${selectedId === s.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-600"}`}>
                      {s.entity_short_name || s.entity_name || `Зміна #${s.id}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!data ? (
              <div className="flex items-center justify-center h-20 text-gray-400 text-sm">Завантаження...</div>
            ) : (
              <>
                <div className="bg-green-50 rounded-xl p-3 space-y-1 text-sm">
                  {data.session?.entity_name && (
                    <div className="flex justify-between text-xs font-semibold text-blue-700 mb-1">
                      <span>Юр. особа:</span><span>{data.session.entity_short_name || data.session.entity_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Відкрито о:</span>
                    <span className="font-semibold">{new Date(data.session.opened_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Каса (готівка):</span>
                    <span className="font-bold text-green-700">{parseFloat(data.session.expected_balance || "0").toFixed(2)} ₴</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Внесено:</span><span>{parseFloat(data.session.cash_in || "0").toFixed(2)} ₴</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Інкасовано:</span><span>{parseFloat(data.session.cash_out || "0").toFixed(2)} ₴</span>
                  </div>
                </div>
                <ReportSalesBlock byPayment={data.byPayment || []} byOutlet={data.byOutlet} totals={data.totals} />
              </>
            )}
          </div>
        )}

        <div className="p-4 border-t shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Y-Report Modal ───────────────────────────────────────────────────────────
function YReportModal({ onClose }: { onClose: () => void }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback((d: string) => {
    setLoading(true); setData(null);
    apiFetch(`/cashbox/y-report?date=${d}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-500" /> Y-Звіт (закрита зміна)
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-4 pt-3 shrink-0">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Завантаження...</div>
          ) : !data?.sessions?.length ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
              <FileText className="w-8 h-8" />
              <p className="text-sm">Немає змін за {new Date(date + "T00:00").toLocaleDateString("uk-UA")}</p>
            </div>
          ) : (
            <div className="space-y-5">
              {data.sessions.map((entry: any, idx: number) => (
                <div key={idx} className="border rounded-xl overflow-hidden">
                  <div className={`px-3 py-2 text-xs font-bold flex justify-between ${entry.session.status === "closed" ? "bg-gray-100 text-gray-700" : "bg-green-50 text-green-700"}`}>
                    <span>{entry.session.entity_short_name || entry.session.entity_name || "Без юр. особи"}</span>
                    <span>
                      {new Date(entry.session.opened_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                      {entry.session.closed_at && ` → ${new Date(entry.session.closed_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`}
                      {" · "}{entry.session.cashier_name || "Касир"}
                      {" · "}<span className={entry.session.status === "closed" ? "text-gray-500" : "text-green-600"}>{entry.session.status === "closed" ? "Закрита" : "Відкрита"}</span>
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>Відкриваючий залишок: {parseFloat(entry.session.opening_balance || "0").toFixed(2)} ₴</span>
                      <span>Каса: {parseFloat(entry.session.expected_balance || "0").toFixed(2)} ₴</span>
                    </div>
                    <ReportSalesBlock byPayment={entry.byPayment || []} byOutlet={entry.byOutlet} totals={entry.totals} bgClass="bg-purple-50" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Periodic Report Modal ─────────────────────────────────────────────────────
function PeriodReportModal({ onClose }: { onClose: () => void }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(todayStr);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setData(null);
    apiFetch(`/cashbox/periodic-report?from=${from}&to=${to}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const fmt = (d: string) => new Date(d + "T00:00").toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-500" /> Періодичний звіт
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-4 pt-3 flex gap-2 items-center shrink-0">
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">З:</p>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">По:</p>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Завантаження...</div>
          ) : (
            <>
              <ReportSalesBlock byPayment={data?.byPayment || []} byOutlet={data?.byOutlet} totals={data?.totals} bgClass="bg-amber-50" />

              {data?.totals?.avg_check > 0 && (
                <div className="flex justify-between text-sm px-1">
                  <span className="text-gray-600">Середній чек:</span>
                  <span className="font-bold">{parseFloat(data.totals.avg_check).toFixed(2)} ₴</span>
                </div>
              )}
              {data?.totals?.discounts > 0 && (
                <div className="flex justify-between text-sm px-1 text-red-600">
                  <span>Знижки за період:</span>
                  <span className="font-bold">− {parseFloat(data.totals.discounts).toFixed(2)} ₴</span>
                </div>
              )}

              {(data?.byDay?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">По днях</h4>
                  <div className="space-y-1">
                    {data.byDay.map((d: any) => (
                      <div key={d.day} className="flex justify-between text-sm py-1 border-b border-gray-100">
                        <span className="text-gray-600">{fmt(d.day)}</span>
                        <div className="text-right">
                          <span className="font-bold">{parseFloat(d.revenue).toFixed(2)} ₴</span>
                          <span className="text-gray-400 text-xs ml-2">({d.checks} чек.)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Receipt Archive Panel ─────────────────────────────────────────────────────
function ReceiptArchive() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState<number | null>(null);
  const [printing, setPrinting] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  function fetchOrders() {
    setLoading(true);
    apiFetch(`/orders?status=billed&date_from=${dateFrom}&date_to=${dateTo}`)
      .then(d => setOrders((d.orders || []).slice(0, 200)))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchOrders(); }, [dateFrom, dateTo]);

  const filtered = orders.filter(o =>
    !search ||
    (o.guestName || o.guest_name || "").toLowerCase().includes(search.toLowerCase()) ||
    String(o.tableNumber || o.table_number || "").includes(search) ||
    String(o.id).includes(search)
  );

  async function handleReturn(order: any) {
    const reason = prompt(`Причина повернення для чеку ${order.receiptNumber || order.id}:`);
    if (reason === null) return;
    setReturning(order.id);
    try {
      await apiFetch(`/orders/${order.id}/return`, { method: "POST", body: JSON.stringify({ reason }) });
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (e: any) { alert("Помилка повернення: " + e.message); }
    finally { setReturning(null); }
  }

  async function handlePrint(order: any) {
    setPrinting(order.id);
    try {
      const fullData = await apiFetch(`/orders/${order.id}`);
      await printFinalReceiptBrowser({ ...fullData.order, items: fullData.items || [] });
    } catch (e: any) { alert("Помилка друку: " + (e as any).message); }
    finally { setPrinting(null); }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Date filter row */}
      <div className="px-3 pt-2 pb-1.5 border-b shrink-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500 font-semibold shrink-0">З</label>
          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <label className="text-[10px] text-gray-500 font-semibold shrink-0">До</label>
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button onClick={fetchOrders} disabled={loading}
            className="p-1.5 rounded-lg border hover:bg-gray-50 text-gray-500 shrink-0" title="Оновити">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по гостю, столу, ID..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Завантаження...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Archive className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Архів порожній</p>
          </div>
        ) : filtered.map(o => {
          const total = parseFloat(o.totalAmount || o.total_amount || "0");
          const closedAt = o.closedAt || o.closed_at;
          return (
            <div key={o.id} className="bg-white border rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm">
                    {o.tableNumber || o.table_number ? `Стіл ${o.tableNumber || o.table_number}` : o.orderType === "takeaway" ? "Takeaway" : "Замовлення"}
                  </div>
                  <div className="text-xs text-gray-500">{o.guestName || o.guest_name}</div>
                  {(o.receiptNumber || o.receipt_number) && (
                    <div className="text-[10px] text-gray-400 font-mono">{o.receiptNumber || o.receipt_number}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-black text-gray-900">{total.toFixed(0)} ₴</div>
                  {closedAt && (
                    <div className="text-[10px] text-gray-400">
                      {new Date(closedAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {{cash:"Готівка",card:"Картка",mixed:"Змішана",invoice:"Рахунок",certificate:"Сертифікат",deposit:"Депозит"}[o.paymentMethod || o.payment_method] || (o.paymentMethod || o.payment_method)}
                </span>
                <button
                  onClick={() => handlePrint(o)}
                  disabled={printing === o.id}
                  className="flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
                >
                  <Printer className="w-3 h-3" />
                  {printing === o.id ? "..." : "Чек"}
                </button>
                <button
                  onClick={() => handleReturn(o)}
                  disabled={returning === o.id}
                  className="ml-auto flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {returning === o.id ? "..." : "Повернення"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────
type PayMode = "cash" | "card" | "invoice" | "certificate" | "deposit" | "mixed";

const PAY_METHODS: { id: PayMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "cash",        label: "Готівка",      icon: <Banknote   className="w-5 h-5" />, hint: "Розрахунок готівкою" },
  { id: "card",        label: "Картка",       icon: <CreditCard className="w-5 h-5" />, hint: "Безготівковий розрахунок" },
  { id: "mixed",       label: "Змішана",      icon: <Layers     className="w-5 h-5" />, hint: "Готівка + картка" },
  { id: "invoice",     label: "Рах. рахунок", icon: <FileText   className="w-5 h-5" />, hint: "Безготівково через банк" },
  { id: "certificate", label: "Сертифікат",   icon: <Gift       className="w-5 h-5" />, hint: "Подарунковий сертифікат" },
  { id: "deposit",     label: "Депозит",      icon: <Wallet     className="w-5 h-5" />, hint: "З депозиту клієнта" },
];

function PaymentModal({ order, onClose, onDone }: { order: ActiveOrder; onClose: () => void; onDone: () => void }) {
  const orderTotal = parseFloat(order.total_amount || "0");

  const [mode, setMode] = useState<PayMode>("cash");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [isFiscal, setIsFiscal] = useState(true);

  // ── Uncorking (розкоркування пляшок) ──
  const alcoholItems = (order.items || []).filter(i => i.is_alcohol && i.status !== "cancelled");
  const [step, setStep] = useState<"uncork" | "pay">(alcoholItems.length > 0 ? "uncork" : "pay");
  const [uncorked, setUncorked] = useState<Set<number>>(new Set());

  // ── Discount ──
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"pct" | "fixed">("pct");
  const [discountValue, setDiscountValue] = useState("");

  // ── Service charge (чайові / надбавка) ──
  const guestTip = order.tipPct ? Number(order.tipPct) : 0;
  const [serviceEnabled, setServiceEnabled] = useState(guestTip > 0);
  const [serviceValue, setServiceValue] = useState(guestTip > 0 ? String(guestTip) : "10");

  // ── Computed totals ──
  const discountNum = parseFloat(discountValue || "0");
  const discountAmount = discountEnabled
    ? (discountType === "pct" ? Math.round(orderTotal * discountNum) / 100 : discountNum)
    : 0;
  const servicePct = serviceEnabled ? parseFloat(serviceValue || "0") : 0;
  const serviceAmount = Math.round((orderTotal - discountAmount) * servicePct) / 100;
  const finalTotal = Math.max(0, orderTotal - discountAmount + serviceAmount);

  // ── Cash fields ──
  const [cashReceived, setCashReceived] = useState("");
  useEffect(() => { setCashReceived(finalTotal.toFixed(2)); }, [finalTotal]);
  const cashChange = Math.max(0, parseFloat(cashReceived || "0") - finalTotal);

  // ── Mixed fields ──
  const [mixedCash, setMixedCash] = useState("");
  const [mixedCard, setMixedCard] = useState("");

  function onMixedCashChange(val: string) {
    setMixedCash(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= finalTotal) setMixedCard((finalTotal - n).toFixed(2));
    else setMixedCard("");
  }
  function onMixedCardChange(val: string) {
    setMixedCard(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0 && n <= finalTotal) setMixedCash((finalTotal - n).toFixed(2));
    else setMixedCash("");
  }

  const mixedCashNum = parseFloat(mixedCash || "0");
  const mixedCardNum = parseFloat(mixedCard || "0");
  const mixedPaidTotal = mixedCashNum + mixedCardNum;
  const mixedChange = Math.max(0, mixedCashNum - (finalTotal - mixedCardNum));

  function canPay() {
    if (paying) return false;
    if (mode === "cash") return parseFloat(cashReceived || "0") >= finalTotal - 0.01;
    if (mode === "mixed") return mixedPaidTotal >= finalTotal - 0.01 && (mixedCashNum > 0 || mixedCardNum > 0);
    return true;
  }

  async function handlePay() {
    if (!canPay()) return;
    setPaying(true); setError("");
    try {
      let body: any = {
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        discountLabel:  discountEnabled && discountAmount > 0
          ? (discountType === "pct" ? `Знижка ${discountNum}%` : `Знижка ${discountAmount.toFixed(2)} ₴`)
          : undefined,
        tipAmount: serviceAmount > 0 ? serviceAmount : undefined,
        tipPct:    servicePct > 0 ? servicePct : undefined,
        fiscal: isFiscal,
      };

      if (mode === "mixed") {
        const payments = [];
        if (mixedCashNum > 0) payments.push({ method: "cash", amount: mixedCashNum });
        if (mixedCardNum > 0) payments.push({ method: "card", amount: mixedCardNum });
        body = { ...body, payments };
      } else if (mode === "cash") {
        body = { ...body, paymentMethod: "cash", paidAmount: parseFloat(cashReceived || "0") };
      } else {
        body = { ...body, paymentMethod: mode, paidAmount: finalTotal };
      }
      await apiFetch(`/orders/${order.id}/pay`, { method: "POST", body: JSON.stringify(body) });

      // Auto-print final receipt after payment
      try {
        const fullData = await apiFetch(`/orders/${order.id}`);
        await printFinalReceiptBrowser({ ...fullData.order, items: fullData.items || [] });
      } catch {}

      onDone();
    } catch (e: any) { setError(e.message); setPaying(false); }
  }

  const selectedInfo = PAY_METHODS.find(m => m.id === mode)!;

  // ── Uncorking step ────────────────────────────────────────────────────────────
  if (step === "uncork") {
    const allUncorked = alcoholItems.every(i => uncorked.has(i.id));
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[95vh]">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div>
              <h3 className="font-bold text-base">🍾 Розкоркування пляшок</h3>
              <p className="text-xs text-gray-500">
                {order.tableNumber ? `Стіл ${order.tableNumber}` : "Замовлення"} · {order.guest_name}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-3">
              Підтвердіть розкоркування кожної алкогольної позиції перед оплатою
            </p>
            <div className="space-y-2">
              {alcoholItems.map(item => {
                const done = uncorked.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => setUncorked(prev => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                      return next;
                    })}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      done ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-amber-300 hover:bg-amber-50"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${done ? "bg-green-100" : "bg-amber-100"}`}>
                      {done ? "✅" : "🍾"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.quantity} × {parseFloat(item.price).toFixed(2)} ₴</p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${done ? "text-green-600" : "text-gray-400"}`}>
                      {done ? "Відкорковано" : "Натисніть"}
                    </span>
                  </button>
                );
              })}
            </div>
            {alcoholItems.length > 1 && (
              <button
                onClick={() => setUncorked(new Set(alcoholItems.map(i => i.id)))}
                className="mt-3 w-full py-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
              >
                Підтвердити всі ({alcoholItems.length})
              </button>
            )}
          </div>
          <div className="p-4 border-t shrink-0">
            <button
              disabled={!allUncorked}
              onClick={() => setStep("pay")}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                allUncorked
                  ? "bg-green-600 text-white hover:bg-green-700 shadow-md"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {allUncorked
                ? "Перейти до оплати →"
                : `Підтвердіть ще ${alcoholItems.length - uncorked.size} позиції`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment step ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[95vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h3 className="font-bold text-base">Оплата замовлення</h3>
            <p className="text-xs text-gray-500">
              {order.tableNumber ? `Стіл ${order.tableNumber}` : "Замовлення"} · {order.guest_name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Price summary ── */}
          <div className="bg-gray-50 border rounded-xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Сума замовлення:</span>
              <span className="font-semibold">{orderTotal.toFixed(2)} ₴</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>{discountType === "pct" ? `Знижка ${discountNum}%` : "Знижка"}:</span>
                <span className="font-semibold">− {discountAmount.toFixed(2)} ₴</span>
              </div>
            )}
            {serviceAmount > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>Сервісний збір {servicePct}%:</span>
                <span className="font-semibold">+ {serviceAmount.toFixed(2)} ₴</span>
              </div>
            )}
            <div className="border-t pt-1.5 flex justify-between font-black text-base text-green-800">
              <span>До сплати:</span>
              <span>{finalTotal.toFixed(2)} ₴</span>
            </div>
          </div>

          {/* ── Discount row ── */}
          <div className="border rounded-xl overflow-hidden">
            <button
              onClick={() => setDiscountEnabled(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${discountEnabled ? "bg-red-50 text-red-700" : "hover:bg-gray-50 text-gray-700"}`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">🏷</span> Знижка
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${discountEnabled ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-400"}`}>
                {discountEnabled ? (discountAmount > 0 ? `− ${discountAmount.toFixed(0)} ₴` : "вкл") : "вимк"}
              </span>
            </button>
            {discountEnabled && (
              <div className="px-4 pb-3 pt-1 border-t bg-red-50/40 flex gap-2 items-center">
                <div className="flex border rounded-lg overflow-hidden shrink-0">
                  {(["pct", "fixed"] as const).map(t => (
                    <button key={t} onClick={() => { setDiscountType(t); setDiscountValue(""); }}
                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${discountType === t ? "bg-red-500 text-white" : "hover:bg-gray-100 text-gray-600"}`}>
                      {t === "pct" ? "%" : "₴"}
                    </button>
                  ))}
                </div>
                <input
                  type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === "pct" ? "напр. 10" : "напр. 50"}
                  min={0} max={discountType === "pct" ? 100 : orderTotal} step="0.01" autoFocus
                  className="flex-1 px-3 py-1.5 text-sm font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-right"
                />
                <span className="text-sm text-gray-500 shrink-0">{discountType === "pct" ? "%" : "₴"}</span>
              </div>
            )}
          </div>

          {/* ── Service charge row ── */}
          <div className="border rounded-xl overflow-hidden">
            <button
              onClick={() => setServiceEnabled(v => !v)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${serviceEnabled ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">⭐</span> Сервісний збір
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${serviceEnabled ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                {serviceEnabled ? `+ ${serviceAmount.toFixed(0)} ₴` : "вимк"}
              </span>
            </button>
            {serviceEnabled && (
              <div className="px-4 pb-3 pt-1 border-t bg-blue-50/40 flex gap-2 items-center">
                <span className="text-xs text-gray-500 shrink-0">Відсоток:</span>
                <div className="flex gap-1.5">
                  {[5, 10, 15].map(pct => (
                    <button key={pct} onClick={() => setServiceValue(String(pct))}
                      className={`px-3 py-1.5 text-xs font-bold border-2 rounded-lg transition-colors ${serviceValue === String(pct) && serviceEnabled ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300"}`}>
                      {pct}%
                    </button>
                  ))}
                </div>
                <input
                  type="number" value={serviceValue} onChange={e => setServiceValue(e.target.value)}
                  min={0} max={50} step="1"
                  className="w-16 px-2 py-1.5 text-sm font-bold border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            )}
          </div>

          {/* ── Fiscal toggle ── */}
          <div className="flex items-center justify-between px-4 py-2.5 border rounded-xl">
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span className="text-base">🧾</span> Тип чека
            </span>
            <div className="flex border rounded-lg overflow-hidden text-xs font-bold">
              <button
                onClick={() => setIsFiscal(true)}
                className={`px-3 py-1.5 transition-colors ${isFiscal ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Фіскальний
              </button>
              <button
                onClick={() => setIsFiscal(false)}
                className={`px-3 py-1.5 transition-colors ${!isFiscal ? "bg-gray-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Нефіскальний
              </button>
            </div>
          </div>

          {/* ── Payment method grid ── */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Спосіб оплати</p>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.id} onClick={() => { setMode(m.id); setError(""); }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-xs transition-all ${
                    mode === m.id
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}>
                  {m.icon}
                  <span className="text-center leading-tight">{m.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mt-1.5">{selectedInfo.hint}</p>
          </div>

          {/* ── Cash fields ── */}
          {mode === "cash" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Отримано від гостя (₴)</label>
                <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                  step="0.01" min={0}
                  className="w-full px-4 py-3 text-2xl font-black border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-right" />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[Math.ceil(finalTotal / 50) * 50, Math.ceil(finalTotal / 100) * 100, Math.ceil(finalTotal / 200) * 200, Math.ceil(finalTotal / 500) * 500]
                  .filter((v, i, a) => v >= finalTotal && a.indexOf(v) === i)
                  .slice(0, 4)
                  .map(v => (
                    <button key={v} onClick={() => setCashReceived(v.toFixed(2))}
                      className="px-3 py-1.5 text-sm font-bold border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors">
                      {v} ₴
                    </button>
                  ))}
                <button onClick={() => setCashReceived(finalTotal.toFixed(2))}
                  className="px-3 py-1.5 text-sm font-bold border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors">
                  Точно
                </button>
              </div>
              {cashChange > 0.01 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center">
                  <span className="font-semibold text-amber-800 text-sm">Решта гостю:</span>
                  <span className="font-black text-xl text-amber-800">{cashChange.toFixed(2)} ₴</span>
                </div>
              )}
            </div>
          )}

          {/* ── Mixed fields ── */}
          {mode === "mixed" && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 text-center">Введіть суму готівкою — картка розрахується автоматично</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5" /> Готівкою (₴)
                  </label>
                  <input type="number" value={mixedCash} onChange={e => onMixedCashChange(e.target.value)}
                    placeholder="0.00" min={0} step="0.01"
                    className="w-full px-3 py-2.5 text-lg font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-right" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Карткою (₴)
                  </label>
                  <input type="number" value={mixedCard} onChange={e => onMixedCardChange(e.target.value)}
                    placeholder="0.00" min={0} step="0.01"
                    className="w-full px-3 py-2.5 text-lg font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-right" />
                </div>
              </div>
              <div className="bg-gray-50 border rounded-xl p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Готівка:</span><span className="font-bold">{mixedCashNum.toFixed(2)} ₴</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Картка:</span><span className="font-bold">{mixedCardNum.toFixed(2)} ₴</span>
                </div>
                <div className="border-t pt-1.5 flex justify-between font-bold">
                  <span>Разом:</span>
                  <span className={mixedPaidTotal >= finalTotal - 0.01 ? "text-green-700" : "text-red-600"}>
                    {mixedPaidTotal.toFixed(2)} ₴
                  </span>
                </div>
                {mixedPaidTotal < finalTotal - 0.01 && (
                  <p className="text-xs text-red-500 text-center">Не вистачає {(finalTotal - mixedPaidTotal).toFixed(2)} ₴</p>
                )}
              </div>
              {mixedChange > 0.01 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center">
                  <span className="font-semibold text-amber-800 text-sm">Решта готівкою:</span>
                  <span className="font-black text-xl text-amber-800">{mixedChange.toFixed(2)} ₴</span>
                </div>
              )}
            </div>
          )}

          {/* ── Card / Invoice / Certificate / Deposit ── */}
          {(mode === "card" || mode === "invoice" || mode === "certificate" || mode === "deposit") && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center text-sm text-blue-700">
              <p className="font-semibold">Сума до оплати: {finalTotal.toFixed(2)} ₴</p>
              <p className="text-xs opacity-80 mt-1">{selectedInfo.hint}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handlePay}
            disabled={!canPay()}
            className="w-full py-4 bg-green-600 text-white font-bold rounded-xl text-lg hover:bg-green-700 disabled:opacity-40 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            {paying
              ? <><RefreshCw className="w-5 h-5 animate-spin" /> Проводимо...</>
              : <><CheckCircle2 className="w-5 h-5" /> Закрити · {finalTotal.toFixed(2)} ₴</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Active Order Card ────────────────────────────────────────────────────────
function ActiveOrderCard({
  order, isExpanded, onToggle, onAddItem, onPay, onSendKitchen,
}: {
  order: ActiveOrder; isExpanded: boolean;
  onToggle: () => void; onAddItem: () => void; onPay: () => void;
  onSendKitchen: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const statusColor = order.status === "open" ? "border-blue-200 bg-blue-50/30" : "border-gray-200 bg-white";
  const hasPending = (order.items || []).some((it: any) => it.status === "pending" && !it.sent_at);

  async function handleSendKitchen() {
    setSending(true);
    try {
      await apiFetch(`/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sendToKitchen: true }),
      });
      onSendKitchen();
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setSending(false); }
  }

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all ${statusColor}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/80 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm">
              {order.tableNumber ? `Стіл ${order.tableNumber}` : order.order_type === "takeaway" ? "Takeaway" : "Замовлення"}
            </div>
            <div className="text-xs text-gray-500 truncate">{order.guest_name} · {timeAgo(order.opened_at)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {hasPending && <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />}
          <span className="font-bold text-gray-800">{parseFloat(order.total_amount || "0").toFixed(0)} ₴</span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-current/10 px-4 pb-4">
          <div className="py-3 space-y-1.5">
            {order.items && order.items.length > 0 ? order.items.map((it: any) => (
              <div key={it.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    it.status === "pending" && !it.sent_at ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-600"
                  }`}>{it.quantity}</span>
                  <span className="text-gray-800 truncate">{it.name}</span>
                  {it.notes && <span className="text-gray-400 text-xs">({it.notes})</span>}
                </div>
                <span className="text-gray-600 shrink-0 ml-2">{parseFloat(it.total_price || "0").toFixed(0)} ₴</span>
              </div>
            )) : (
              <p className="text-xs text-gray-400 text-center py-2">Позиції відсутні</p>
            )}
          </div>

          {/* Send to kitchen (if pending items) */}
          {hasPending && (
            <button onClick={handleSendKitchen} disabled={sending}
              className="w-full mb-2 flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-40 transition-colors">
              {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sending ? "Відправка..." : "На кухню"}
            </button>
          )}

          <div className="flex gap-2">
            <button onClick={onAddItem}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-2 border-amber-400 text-amber-700 rounded-xl hover:bg-amber-50 transition-colors">
              <Plus className="w-4 h-4" /> Страва
            </button>
            <button
              onClick={async () => {
                if (printing || !(order.items && order.items.length > 0)) return;
                setPrinting(true); setPrintMsg(null);
                try {
                  const r = await printBill(order);
                  setPrintMsg(r.msg);
                  setTimeout(() => setPrintMsg(null), 3000);
                } catch (e: any) {
                  setPrintMsg("Помилка: " + e.message);
                  setTimeout(() => setPrintMsg(null), 4000);
                } finally { setPrinting(false); }
              }}
              disabled={printing || !(order.items && order.items.length > 0)}
              title={printMsg || "Друкувати передрахунок"}
              className={`relative flex items-center justify-center gap-1 px-3 py-2.5 text-sm font-semibold border-2 rounded-xl disabled:opacity-40 transition-colors ${printMsg ? (printMsg.startsWith("Помилка") ? "border-red-300 bg-red-50 text-red-600" : "border-green-300 bg-green-50 text-green-700") : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              {printing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            </button>
            <button onClick={onPay}
              className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors shadow-sm">
              <CreditCard className="w-4 h-4" /> {parseFloat(order.total_amount || "0").toFixed(0)} ₴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QR Order Alert Card ──────────────────────────────────────────────────────
function OrderAlert({ order, onAccept, onReject, accepting }: {
  order: GuestOrder; onAccept: (id: number) => void; onReject: (id: number) => void; accepting: number | null;
}) {
  const [elapsed, setElapsed] = useState(timeAgo(order.opened_at));
  useEffect(() => {
    const t = setInterval(() => setElapsed(timeAgo(order.opened_at)), 5000);
    return () => clearInterval(t);
  }, [order.opened_at]);

  return (
    <div className="bg-white border-2 border-amber-400 rounded-2xl shadow-xl overflow-hidden animate-pulse-border">
      <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-lg">Стіл {order.table_number || "—"}</span>
                {order.table_location && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{order.table_location}</span>}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                <Clock className="w-3.5 h-3.5" /><span>{elapsed}</span>
                <span>·</span><span>{order.guest_name}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{parseFloat(order.total_amount || "0").toFixed(0)} ₴</div>
            <div className="text-xs text-gray-400">{order.items.length} поз.</div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2">
          {order.items.map(it => (
            <div key={it.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">{it.quantity}</span>
                <span className="text-gray-800 truncate">{it.name}</span>
                {it.notes && <span className="text-gray-400 text-xs">({it.notes})</span>}
              </div>
              <span className="text-gray-600 shrink-0 ml-2">{parseFloat(it.total_price).toFixed(0)} ₴</span>
            </div>
          ))}
          {order.notes && <div className="pt-1 border-t border-gray-200 text-xs text-gray-500 italic">Примітка: {order.notes}</div>}
        </div>
        <div className="flex gap-3">
          <button onClick={() => onReject(order.id)} disabled={accepting === order.id}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-40 transition-colors">
            <XCircle className="w-5 h-5" /> Відхилити
          </button>
          <button onClick={() => onAccept(order.id)} disabled={accepting === order.id}
            className="flex-2 flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-40 transition-colors shadow-md">
            {accepting === order.id ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Прийняти до роботи
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FbCashier() {
  const [pendingOrders, setPendingOrders] = useState<GuestOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [connected, setConnected] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [addItemForOrderId, setAddItemForOrderId] = useState<number | null>(null);
  const [payForOrder, setPayForOrder] = useState<ActiveOrder | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<"qr" | "archive">("qr");
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [xReportOpen, setXReportOpen] = useState(false);
  const [yReportOpen, setYReportOpen] = useState(false);
  const [periodReportOpen, setPeriodReportOpen] = useState(false);
  const [notifications, setNotifications] = useState<TableNotification[]>([]);
  const knownIds = useRef<Set<number>>(new Set());
  const knownNotifIds = useRef<Set<number>>(new Set());

  const fetchPending = useCallback(async () => {
    try {
      const data = await apiFetch("/public/pending-orders");
      const incoming: GuestOrder[] = data.orders || [];
      setPendingOrders(incoming);
      setConnected(true);
      setLastPoll(new Date());
      const newOnes = incoming.filter(o => !knownIds.current.has(o.id));
      if (newOnes.length > 0) { playAlert(); newOnes.forEach(o => knownIds.current.add(o.id)); }
    } catch { setConnected(false); }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch("/notifications");
      const incoming: TableNotification[] = data.notifications || [];
      setNotifications(incoming);
      const newOnes = incoming.filter(n => !knownNotifIds.current.has(n.id));
      if (newOnes.length > 0) { playAlert(); newOnes.forEach(n => knownNotifIds.current.add(n.id)); }
    } catch {}
  }, []);

  const dismissNotification = async (id: number) => {
    try {
      await apiFetch(`/notifications/${id}/dismiss`, { method: "POST" });
      setNotifications(prev => prev.filter(n => n.id !== id));
      knownNotifIds.current.delete(id);
    } catch {}
  };

  const fetchActive = useCallback(async () => {
    try {
      const data = await apiFetch("/orders?open=true");
      const orders: any[] = data.orders || [];
      const withItems = await Promise.all(
        orders.map(async (o) => {
          try {
            const d = await apiFetch(`/orders/${o.id}`);
            const merged = { ...o, tableNumber: d.order?.tableNumber || o.tableNumber, tipPct: d.order?.tipPct ?? o.tipPct ?? null, items: d.items || [] };
            return {
              ...merged,
              total_amount: merged.total_amount ?? merged.totalAmount ?? "0",
              guest_name:   merged.guest_name   ?? merged.guestName   ?? "",
              opened_at:    merged.opened_at    ?? merged.openedAt    ?? merged.createdAt ?? "",
              order_type:   merged.order_type   ?? merged.orderType   ?? "",
            };
          } catch { return { ...o, items: [],
            total_amount: o.total_amount ?? o.totalAmount ?? "0",
            guest_name:   o.guest_name   ?? o.guestName   ?? "",
            opened_at:    o.opened_at    ?? o.openedAt    ?? o.createdAt ?? "",
            order_type:   o.order_type   ?? o.orderType   ?? "",
          }; }
        })
      );
      setActiveOrders(withItems);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPending(); fetchActive(); fetchNotifications();
    const t1 = setInterval(fetchPending, 3000);
    const t2 = setInterval(fetchActive, 10000);
    const t3 = setInterval(fetchNotifications, 4000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, [fetchPending, fetchActive, fetchNotifications]);

  const handleAccept = async (id: number) => {
    setAccepting(id);
    try {
      await apiFetch(`/public/guest-orders/${id}/accept`, { method: "PATCH" });
      setPendingOrders(prev => prev.filter(o => o.id !== id));
      knownIds.current.delete(id);
      setTimeout(fetchActive, 600);
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setAccepting(null); }
  };

  const handleReject = async (id: number) => {
    if (!confirm("Відхилити замовлення? Гість отримає відмову.")) return;
    setAccepting(id);
    try {
      await apiFetch(`/public/guest-orders/${id}/reject`, { method: "PATCH" });
      setPendingOrders(prev => prev.filter(o => o.id !== id));
      knownIds.current.delete(id);
    } catch (e: any) { alert("Помилка: " + e.message); }
    finally { setAccepting(null); }
  };

  return (
    <AppLayout>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: #fbbf24; box-shadow: 0 0 0 0 rgba(251,191,36,0.4); }
          50% { border-color: #f59e0b; box-shadow: 0 0 0 8px rgba(251,191,36,0); }
        }
        .animate-pulse-border { animation: pulse-border 2s ease-in-out infinite; }
      `}</style>

      {/* Modals */}
      {newOrderOpen && (
        <NewOrderModal
          onClose={() => setNewOrderOpen(false)}
          onDone={() => { setNewOrderOpen(false); setTimeout(fetchActive, 400); }}
        />
      )}
      {addItemForOrderId !== null && (
        <AddItemModal
          orderId={addItemForOrderId}
          onClose={() => setAddItemForOrderId(null)}
          onDone={() => { setTimeout(fetchActive, 300); }}
        />
      )}
      {payForOrder && (
        <PaymentModal
          order={payForOrder}
          onClose={() => setPayForOrder(null)}
          onDone={() => { setPayForOrder(null); fetchActive(); }}
        />
      )}
      {cashModalOpen && (
        <CashMovementModal
          onClose={() => setCashModalOpen(false)}
          onDone={() => setCashModalOpen(false)}
        />
      )}
      {xReportOpen && (
        <XReportModal onClose={() => setXReportOpen(false)} />
      )}
      {yReportOpen && (
        <YReportModal onClose={() => setYReportOpen(false)} />
      )}
      {periodReportOpen && (
        <PeriodReportModal onClose={() => setPeriodReportOpen(false)} />
      )}

      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-5 py-3 border-b bg-background shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bell className="w-6 h-6 text-muted-foreground" />
                {(pendingOrders.length + notifications.length) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                    {pendingOrders.length + notifications.length}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold">Станція касира</h1>
                <p className="text-xs text-muted-foreground">QR-замовлення · архів чеків · управління замовленнями</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                <Wifi className="w-3 h-3" />
                {connected ? "Онлайн" : "Немає зв'язку"}
              </div>
              {lastPoll && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3" />
                  {lastPoll.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex h-full">

            {/* ── LEFT: QR orders / Receipt archive ── */}
            <div className="flex-1 flex flex-col border-r overflow-hidden">

              {/* Tab switcher */}
              <div className="flex border-b shrink-0">
                <button
                  onClick={() => setLeftTab("qr")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${leftTab === "qr" ? "text-amber-700 border-b-2 border-amber-500 bg-amber-50/50" : "text-muted-foreground hover:bg-muted/30"}`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  QR-замовлення
                  {pendingOrders.length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingOrders.length}</span>
                  )}
                </button>
                <button
                  onClick={() => setLeftTab("archive")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${leftTab === "archive" ? "text-blue-700 border-b-2 border-blue-500 bg-blue-50/50" : "text-muted-foreground hover:bg-muted/30"}`}
                >
                  <Archive className="w-4 h-4" />
                  Архів чеків
                </button>
              </div>

              {/* Tab content */}
              {leftTab === "qr" ? (
                <div className="flex-1 overflow-y-auto p-5">

                  {/* ── Table notifications (waiter calls, payment requests) ── */}
                  {notifications.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {notifications.map(n => {
                        const isWaiter = n.type === "waiter_call";
                        const isCash = n.type === "payment_cash";
                        const tableLabel = n.table_location
                          ? `${n.table_location}${n.table_number ? ` · №${n.table_number}` : ""}`
                          : `Стіл №${n.table_number}`;
                        const total = n.payload?.total ? parseFloat(n.payload.total).toFixed(0) : null;

                        return (
                          <div key={n.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 animate-pulse-border ${
                            isWaiter ? "bg-blue-50 border-blue-300" : isCash ? "bg-green-50 border-green-300" : "bg-purple-50 border-purple-300"
                          }`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${
                              isWaiter ? "bg-blue-100" : isCash ? "bg-green-100" : "bg-purple-100"
                            }`}>
                              {isWaiter ? "🛎️" : isCash ? "💵" : "💳"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-bold text-sm ${isWaiter ? "text-blue-800" : isCash ? "text-green-800" : "text-purple-800"}`}>
                                {isWaiter ? "Виклик офіціанта" : isCash ? "Гість чекає здачу" : "Принесіть термінал"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {tableLabel}{total ? ` · ${total} ₴` : ""} · {timeAgo(n.created_at)}
                              </div>
                            </div>
                            <button onClick={() => dismissNotification(n.id)}
                              className="shrink-0 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center text-muted-foreground hover:bg-white transition-colors"
                              title="Відхилити">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {pendingOrders.length > 0 && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shrink-0 animate-bounce">
                        <Bell className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-bold text-amber-800 text-sm">{pendingOrders.length === 1 ? "Нове замовлення!" : `${pendingOrders.length} нових замовлень!`}</div>
                        <div className="text-amber-600 text-xs">Прийміть — система надрукує завдання на кухонний та барний принтери</div>
                      </div>
                    </div>
                  )}
                  {pendingOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                        <ShoppingBag className="w-7 h-7 text-muted-foreground/50" />
                      </div>
                      <p className="font-semibold text-muted-foreground text-sm">Нових QR-замовлень немає</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Оновлення кожні 3 секунди</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-xl">
                      {pendingOrders.map(order => (
                        <OrderAlert key={order.id} order={order} onAccept={handleAccept} onReject={handleReject} accepting={accepting} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <ReceiptArchive />
                </div>
              )}
            </div>

            {/* ── RIGHT: Active Orders Manager ── */}
            <div className="w-96 shrink-0 flex flex-col bg-gray-50/50">
              {/* Right header */}
              <div className="px-4 py-3 border-b bg-background flex items-center justify-between shrink-0">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-blue-500" />
                  Активні замовлення
                  {activeOrders.length > 0 && (
                    <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeOrders.length}</span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={fetchActive} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setNewOrderOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Нове
                  </button>
                </div>
              </div>

              {/* Shift bar */}
              <ShiftBar
                onCashMovement={() => setCashModalOpen(true)}
                onXReport={() => setXReportOpen(true)}
                onYReport={() => setYReportOpen(true)}
                onPeriodReport={() => setPeriodReportOpen(true)}
              />

              {/* Orders list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {activeOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                      <UtensilsCrossed className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">Немає активних замовлень</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Натисніть «Нове» або приймайте QR</p>
                  </div>
                ) : (
                  activeOrders.map(order => (
                    <ActiveOrderCard
                      key={order.id}
                      order={order}
                      isExpanded={expandedOrderId === order.id}
                      onToggle={() => setExpandedOrderId(prev => prev === order.id ? null : order.id)}
                      onAddItem={() => setAddItemForOrderId(order.id)}
                      onPay={() => setPayForOrder(order)}
                      onSendKitchen={() => setTimeout(fetchActive, 500)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
