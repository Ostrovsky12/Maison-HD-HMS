/* Bundled for Poster POS, not for the public Maison HD website.
 * The build script inserts the verified production origin. No secrets in this file.
 */
(function startMaisonPos() {
  "use strict";
  if (window.__maisonCashNotices) return;
  window.__maisonCashNotices = true;
  const ORIGIN = "__MAISON_POS_ORIGIN__";
  const sdk = window.Poster;
  if (!sdk?.makeRequest || !sdk?.interface) return;
  const s = sdk.settings;
  const context = { account: s.accountUrl, spotId: Number(s.spotId), tabletId: Number(s.spotTabletId) };
  const key = `maison-pos-v1:${context.account}:${context.spotId}:${context.tabletId}`;
  const kitchen = createMaisonKitchen(sdk, request, context, key);
  let token = "", busy = false, notices = [], status = "Введіть код із кабінету Maison HD.";
  const shown = new Map();
  try { token = localStorage.getItem(key) || ""; } catch { /* Session-only pairing is still possible. */ }
  const root = document.getElementById("app-container") || document.body.appendChild(document.createElement("main"));
  const style = document.createElement("style");
  style.textContent = "body{margin:0;font:16px system-ui;color:#252525;background:#fff}main,#app-container{padding:20px}h2{font-size:22px}button,input{font:inherit;padding:12px;border-radius:8px;border:1px solid #ccc}button{background:#245b41;color:white;cursor:pointer}input{box-sizing:border-box;width:100%;margin:10px 0}article{padding:14px;border:1px solid #ddd;border-radius:8px;margin:12px 0}small{display:block;color:#666;margin-top:8px}.status{padding:12px;background:#f4f4f4}";
  document.head.appendChild(style);
  const el = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
  function request(path, data) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new Error("Каса не отримала відповіді сервера.")); }, 17000);
      sdk.makeRequest(`${ORIGIN}/api/poster-pos/${path}`, {
        method: "post", headers: ["Content-Type: application/json"], data, timeout: 15000,
      }, answer => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        let result;
        try { result = typeof answer?.result === "string" ? JSON.parse(answer.result) : answer?.result; } catch { result = null; }
        if (Number(answer?.code) !== 200 || !result) {
          const error = new Error(result?.error || "Не вдалося зв’язатися з Maison HD.");
          error.status = Number(answer?.code);
          reject(error); return;
        }
        resolve(result);
      });
    });
  }
  function render() {
    root.replaceChildren(el("h2", "Maison HD · Касовий модуль"));
    const state = el("p", status); state.className = "status"; state.setAttribute("role", "status"); root.appendChild(state);
    root.appendChild(el("small", "Сповіщення — не оплата. Отримайте кошти та закрийте наявний рахунок у Poster звичайним способом. Чайових немає."));
    if (!token) {
      const form = el("form"), input = el("input"), button = el("button", "Підключити касу");
      input.type = "password"; input.autocomplete = "off"; input.placeholder = "Код підключення (дійсний 15 хвилин)";
      input.setAttribute("aria-label", "Код підключення Maison HD"); input.required = true;
      button.type = "submit"; button.disabled = busy; form.append(input, button); root.appendChild(form);
      form.onsubmit = async event => {
        event.preventDefault(); if (busy) return; busy = true; button.disabled = true;
        const code = input.value.trim(); input.value = "";
        try {
          const result = await request("pair", { ...context, code });
          if (typeof result.token !== "string" || !/^[1-9]\d*\.[a-f0-9]{64}$/.test(result.token)) throw new Error("Підключення не підтверджено.");
          token = result.token;
          try { localStorage.setItem(key, token); } catch { /* Retain in memory for this POS session. */ }
          status = "Касу підключено. Завантажуємо запити…";
        } catch (e) { status = e.message; }
        finally { busy = false; render(); if (token) void poll(); }
      };
      return;
    }
    if (kitchen.message) root.appendChild(el("p", kitchen.message));
    for (const n of notices) {
      const card = el("article");
      card.append(el("strong", `Готівка · ${n.point}`),
        el("p", `Рахунок Maison HD №${n.orderId} · ${Number(n.total).toFixed(2)} ₴`),
        el("small", n.delivered ? "Показ сповіщення підтверджено Poster." : "Очікує підтвердження показу."));
      root.appendChild(card);
    }
    if (!notices.length) root.appendChild(el("p", "Актуальних запитів немає."));
    const refresh = el("button", "Оновити"); refresh.disabled = busy; refresh.onclick = () => void poll(); root.appendChild(refresh);
  }
  async function poll() {
    if (!token || busy) return; busy = true;
    try {
      const result = await request("poll", { ...context, token });
      if (!Array.isArray(result.notifications)) throw new Error("Некоректна відповідь сервера.");
      notices = result.notifications;
      const active = new Set(notices.map(n => n.id));
      for (const id of shown.keys()) if (!active.has(id)) shown.delete(id);
      for (const n of notices) {
        if (n.delivered) continue;
        let receipt = shown.get(n.id);
        if (!receipt) {
          try { receipt = JSON.parse(localStorage.getItem(`${key}:notice:${n.id}`) || "null"); } catch { /* memory is enough */ }
        }
        if (!receipt) {
          receipt = await sdk.interface.showNotification({ title: "Гість просить розрахунок готівкою",
            message: `${n.point} · рахунок Maison HD №${n.orderId} · ${Number(n.total).toFixed(2)} ₴. Без чайових. Це не оплата.` });
          if (!Number.isSafeInteger(Number(receipt?.id)) || Number(receipt.id) <= 0) throw new Error("Poster не підтвердив показ сповіщення.");
          receipt = { id: Number(receipt.id) };
          shown.set(n.id, receipt);
          try { localStorage.setItem(`${key}:notice:${n.id}`, JSON.stringify(receipt)); } catch { /* retry ACK from memory */ }
        }
        const ack = await request("ack", { ...context, token, id: n.id, posterNotificationId: receipt.id });
        if (ack.ok !== true) throw new Error("Показ ще не збережено на сервері.");
        n.delivered = true;
      }
      status = `Зв’язок із Maison HD працює. Оновлено ${new Date().toLocaleTimeString("uk-UA")}.`;
    } catch (e) {
      status = e.message;
      if (e.status === 403) {
        token = ""; notices = []; shown.clear();
        try { localStorage.removeItem(key); } catch { /* no persisted credential */ }
      }
    } finally {
      if (token) await kitchen.poll(token);
      busy = false; render();
    }
  }
  sdk.interface.showApplicationIconAt({ functions: "Maison HD · Запити на розрахунок", order: "Запити на розрахунок" });
  sdk.on("applicationIconClicked", () => { render(); sdk.interface.popup({ title: "Maison HD", width: 620, height: 560 }); void poll(); });
  sdk.on("notificationClick", notice => {
    if (notice.title === "Гість просить розрахунок готівкою") {
      render(); sdk.interface.popup({ title: "Maison HD · Розрахунок", width: 620, height: 560 }); void poll();
    }
    if (notice.title === "Бігунки Maison HD очікують") {
      render(); sdk.interface.popup({ title: "Maison HD · Бігунки", width: 620, height: 560 });
    }
  });
  sdk.on("orderOpen", () => { if (token) void poll(); });
  render(); void poll(); setInterval(() => void poll(), 10000);
})();
