import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { sendEmail, getEmailConfig } from "./notify.js";
import { attemptConnection, type Attempt } from "./servio-reservations.js";
import { bookingMailbox } from "./servio-sales.js";
import { engineConfig } from "./booking-engine.js";

const esc = (value: unknown) => String(value ?? "").replace(/[<>&"']/g,
  c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
type DeliveryKind = "guest" | "admin" | "review";

/** A commercial confirmation, not a fiscal receipt. No PRRO or cash-register calls. */
export function servioBookingEmail(row: Attempt, hotel: string, kind: DeliveryKind) {
  const input = row.payload.input, admin = kind !== "guest", review = kind === "review";
  const subject = review ? `Потребує перевірки: оплата бронювання №${row.account}`
    : admin ? `Нове створене та сплачене бронювання №${row.account} через модуль`
      : `Оплату отримано — бронювання №${row.account} підтверджено · ${hotel}`;
  const details = [
    ["Комплекс", hotel], ["Бронювання Servio", row.account], ["Розміщення", row.payload.categoryName],
    ["Тариф", admin ? row.payload.rateName : row.payload.rateName.replace(/\bNR\s+Site\b/gi, "Неповоротний")], ["Заїзд", input.checkIn], ["Виїзд", input.checkOut],
    ["Гість", `${input.firstName} ${input.lastName}`], ["Телефон", input.phone], ["Email гостя", input.email],
    ...(input.specialRequests?.trim() ? [["Побажання", input.specialRequests.trim()]] : []),
    ["Дорослих", input.adults], ["Дітей", input.childAges.length],
    ...(input.childAges.length ? [["Вік дітей", input.childAges.join(", ")]] : []),
    ["Сплачено онлайн, LiqPay", `${((row.payment?.amountMinor ?? row.bill?.totalMinor ?? 0) / 100).toFixed(2)} грн`],
    ["Ідентифікатор платежу", row.payment?.paymentId],
  ];
  const intro = review
    ? "LiqPay підтвердив платіж, але бронювання потребує ручної звірки із Servio. Не просіть гостя оплачувати повторно. Перевірте журнал бронювань перед подальшими діями."
    : admin ? "Через модуль створене та повністю оплачене нове бронювання. Servio підтвердив гарантування. Перевірте бронювання та зв’яжіться з гостем."
      : "Дякуємо! Отримано 100% онлайн-оплати. Ваше бронювання підтверджено в Servio. З питань проживання відповідайте на цей лист.";
  const policy = "Тариф неповоротний, зміна дат не передбачена, крім випадків, установлених законом. Цей лист — підтвердження бронювання й оплати, не фіскальний чек.";
  return {
    subject, text: `${intro}\n\n${details.map(([key, value]) => `${key}: ${value ?? ""}`).join("\n")}\n\n${policy}`,
    html: `<div style="font:16px/1.6 Arial,sans-serif;color:#292d05;max-width:640px;margin:auto;padding:28px;background:#fff4e5">
      <h1 style="font-size:24px">${esc(subject)}</h1><p>${esc(intro)}</p><table style="width:100%;border-collapse:collapse">
      ${details.map(([key, value]) => `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ded8c8">${esc(key)}</th><td style="padding:8px;border-bottom:1px solid #ded8c8">${esc(value)}</td></tr>`).join("")}
      </table><p style="font-size:13px">${esc(policy)}</p></div>`,
  };
}

// The attempt itself is the durable source of pending mail. A crash between a
// confirmed payment and scheduling cannot lose the job. Each recipient has its
// own lease and status, so a failed guest email never suppresses the admin email.
export async function deliverServioBookingNotifications(id?: string) {
  const rows = (await pool.query(`SELECT a.*,o.slug,o.name AS hotel_name,o.booking_engine_config
    FROM servio_booking_attempts a JOIN organizations o ON o.id=a.organization_id
    WHERE a.payment->>'status'='success' AND a.state IN ('confirmed','review')
      AND a.payload->>'source'='public_booking'
      ${id ? "AND a.id=$1" : ""}
      AND EXISTS (SELECT 1 FROM unnest(CASE WHEN a.state='confirmed'
          THEN ARRAY['admin','guest'] ELSE ARRAY['review'] END) AS kind
        WHERE a.notification_delivery->kind->>'status' IS DISTINCT FROM 'sent'
          AND coalesce((a.notification_delivery->kind->>'leaseUntil')::timestamptz,'epoch') < now())
    ORDER BY a.updated_at LIMIT 20`, id ? [id] : [])).rows;
  for (const row of rows) {
    const connection = attemptConnection(row);
    const current = bookingMailbox(row.slug, await getEmailConfig(row.organization_id));
    const mailbox = connection.notificationMailbox ?? current;
    const kinds: DeliveryKind[] = row.state === "confirmed" ? ["admin", "guest"] : ["review"];
    for (const kind of kinds) {
      const claimed = (await pool.query(`UPDATE servio_booking_attempts
        SET notification_delivery=jsonb_set(notification_delivery,ARRAY[$2::text],
          jsonb_build_object('status','sending','leaseUntil',now()+interval '2 minutes'),true)
        WHERE id=$1 AND organization_id=$3 AND state=$4 AND payment->>'status'='success'
          AND notification_delivery->$2->>'status' IS DISTINCT FROM 'sent'
          AND coalesce((notification_delivery->$2->>'leaseUntil')::timestamptz,'epoch') < now()
        RETURNING id`, [row.id, kind, row.organization_id, row.state])).rowCount;
      if (!claimed) continue;
      const hotel = connection.guestHotel?.hotelName || engineConfig({ name: row.hotel_name,
        booking_engine_config: row.booking_engine_config }).displayName;
      let ok = false;
      try {
        if (mailbox && current === mailbox) {
          const mail = servioBookingEmail(row, hotel, kind);
          const result = await sendEmail(row.organization_id, {
            ...mail, to: kind === "guest" ? row.payload.input.email : mailbox, expectedFrom: mailbox,
            messageId: `<servio-${row.id}-${kind}@${mailbox.split("@")[1]}>`,
          });
          ok = result.ok;
        }
      } catch { /* Persist failure without logging guest data or SMTP diagnostics. */ }
      await pool.query(`UPDATE servio_booking_attempts
        SET notification_delivery=jsonb_set(notification_delivery,ARRAY[$2::text],
          jsonb_build_object('status',$3::text,'updatedAt',now(),'leaseUntil',
            CASE WHEN $3='sent' THEN now() ELSE now()+interval '5 minutes' END),true)
        WHERE id=$1 AND organization_id=$4`, [row.id, kind, ok ? "sent" : "failed", row.organization_id]);
      if (!ok) logger.warn({ organizationId: row.organization_id, attemptId: row.id, kind }, "Booking email pending retry");
    }
  }
}

export function startServioBookingNotifications() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await deliverServioBookingNotifications(); }
    catch { logger.warn("Servio booking notification worker unavailable; pending messages retained"); }
    finally { busy = false; }
  };
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  void tick();
}
