/* Poster owns department/printer routing. This module never prints a fiscal receipt.
 * SDK success is command acceptance, NOT physical paper delivery.
 */
function createMaisonKitchen(sdk, request, context, sessionKey) {
  "use strict";
  const results = new Map(), announced = new Set();
  const storageKey = `${sessionKey}:kitchen-results`;
  let message = "", blocked = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved)) throw new Error("Invalid kitchen journal");
    for (const result of saved) {
      if (!Number.isSafeInteger(result?.orderId) || !/^[a-f0-9]{64}$/.test(result.attemptId)
        || !["submitted", "already_sent", "review"].includes(result.outcome)) throw new Error("Invalid kitchen journal");
      results.set(result.attemptId, result);
    }
  } catch { blocked = true; message = "Журнал бігунків недоступний. Автоматичний друк заблоковано."; }
  const persist = () => localStorage.setItem(storageKey, JSON.stringify([...results.values()]));
  const deadline = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Poster не підтвердив результат бігунків.")), 15000);
    })]); } finally { clearTimeout(timer); }
  };
  function matches(order, job) {
    if (!order || !Number.isSafeInteger(order.id) || order.id < 1000000000000
      || order.id > 9999999999999 || Number(order.orderName) !== job.remoteOrderId
      || Number(order.tableId) !== job.tableId || Number(order.status) !== 1
      || Number(order.discount || 0) !== 0 || Number(order.payedSum || 0) !== 0
      || Number(order.payedCash || 0) !== 0 || Number(order.payedCard || 0) !== 0
      || Number(order.payedBonus || 0) !== 0 || Number(order.payedThirdParty || 0) !== 0
      || !order.products || typeof order.products !== "object") return null;
    const counts = {};
    let alreadySent = true;
    for (const p of Object.values(order.products)) {
      const id = String(p.id), count = Number(p.count), printed = Number(p.printedNum);
      if (!Number.isInteger(count) || count < 0 || !Number.isFinite(printed) || printed < 0 || printed > count
        || p.modification || p.modificationHash || p.promotionId) return null;
      if (!count) continue;
      if (job.prices[id] === undefined || Number(p.price) !== job.prices[id]) return null;
      counts[id] = (counts[id] || 0) + count;
      if (printed < count) alreadySent = false;
    }
    if (Object.keys(counts).length !== Object.keys(job.quantities).length
      || Object.entries(counts).some(([id, count]) => count !== job.quantities[id])) return null;
    return { terminalOrderId: order.id, alreadySent };
  }
  async function report(token) {
    for (const result of results.values()) {
      const ack = await request("kitchen/result", { ...context, token, ...result });
      if (ack?.ok !== true) throw new Error("Результат бігунків ще не збережено.");
      results.delete(result.attemptId);
      try { persist(); } catch { blocked = true; throw new Error("Журнал бігунків недоступний."); }
    }
  }
  return {
    get message() { return message; },
    async poll(token) {
      try {
        if (blocked) return;
        await report(token);
        const env = sdk.environment;
        if (!env || ![env.android, env.iOS, env.windows, env.desktop].some(value => value === true)) {
          message = "Для бігунків відкрийте встановлений застосунок Poster. Вебкаса не підтримує кухонний друк."; return;
        }
        if (!sdk.orders?.getActive || !sdk.orders?.sendToKitchen) {
          message = "Ця версія Poster не підтримує касові команди бігунків."; return;
        }
        const inbox = await request("kitchen/poll", { ...context, token });
        if (!inbox?.enabled) { message = "Автоматичні бігунки вимкнено в налаштуваннях обміну."; return; }
        if (!Array.isArray(inbox.jobs)) throw new Error("Некоректний список бігунків.");
        if (!inbox.jobs.length) { message = "Нових завдань бігунків немає. Статус попередніх — у мобільному офіціанті."; return; }
        message = "Бігунки очікують: відкрийте відповідний рахунок у Poster для точної звірки.";
        const active = await deadline(sdk.orders.getActive());
        for (const job of inbox.jobs) {
          if (!matches(active?.order, job)) {
            if (!announced.has(job.revision)) {
              announced.add(job.revision);
              await sdk.interface.showNotification({ title: "Бігунки Maison HD очікують",
                message: `Відкрийте рахунок Poster №${job.remoteOrderId}. Після звірки страв модуль відправить бігунки. Це не оплата.` });
            }
            continue;
          }
          const permit = await request("kitchen/claim", { ...context, token, orderId: job.orderId,
            revision: job.revision, terminalOrderId: active.order.id });
          if (!/^[a-f0-9]{64}$/.test(permit?.attemptId)) throw new Error("Дозвіл на бігунки не підтверджено.");
          const result = { orderId: job.orderId, attemptId: permit.attemptId, outcome: "review" };
          results.set(permit.attemptId, result);
          // Durable uncertainty marker BEFORE the SDK side effect. A reload never blindly repeats it.
          try { persist(); } catch { blocked = true; throw new Error("Журнал недоступний. Бігунки не відправлено; потрібна перевірка."); }
          try {
            const current = await deadline(sdk.orders.getActive());
            const checked = matches(current?.order, job);
            if (!checked || checked.terminalOrderId !== active.order.id) throw new Error("Рахунок на касі змінився.");
            if (checked.alreadySent) result.outcome = "already_sent";
            else {
              const answer = await deadline(sdk.orders.sendToKitchen(checked.terminalOrderId));
              if (answer?.success !== true) throw new Error("Poster не підтвердив команду бігунків.");
              result.outcome = "submitted";
            }
          } catch { result.outcome = "review"; }
          try { persist(); } catch { blocked = true; }
          message = result.outcome === "review"
            ? "Результат бігунків невідомий. Перевірте касу та принтери; автоматичний повтор заблоковано."
            : result.outcome === "already_sent" ? "Poster вже позначив страви відправленими. Повторної команди не було."
              : "Poster прийняв команду бігунків. Фізичний друк перевіряється на касі.";
          await report(token);
          break;
        }
      } catch (e) { message = e.message || "Бігунки не підтверджено. Перевірте касу."; }
    },
  };
}
