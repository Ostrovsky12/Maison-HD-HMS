import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db } from "@workspace/db";
import { decrypt } from "../lib/encrypt.js";
import { checkboxSignin, ensureShiftOpen } from "../services/checkbox.js";

const router = Router();
const pool = () => (db as any).$client;
const getOrg = (req: any): number => (req as any).user?.organizationId;

const CHECKBOX_API = "https://api.checkbox.in.ua/api/v1";

// ── Helper: get legal entity with decrypted credentials ───────────────────────
async function getLegalEntityWithCreds(orgId: number, id: number) {
  const r = await pool().query(
    `SELECT * FROM legal_entities WHERE id = $1 AND organization_id = $2 AND prro_enabled = true`,
    [id, orgId]
  );
  const le = r.rows[0];
  if (!le) throw new Error("Юр. особу не знайдено або ПРРО не підключено");
  return {
    ...le,
    checkbox_password: decrypt(le.checkbox_password) || le.checkbox_password,
  };
}

// ── Helper: Checkbox headers ───────────────────────────────────────────────────
function cbkHeaders(token: string, licenseKey: string) {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "X-License-Key": licenseKey,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /fb/prro/status  — статус всіх юр. осіб з ПРРО
// ══════════════════════════════════════════════════════════════════════════════
router.get("/status", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    if (!orgId) return res.status(403).json({ error: "No organization" });

    const r = await pool().query(
      `SELECT id, name, short_name, type, checkbox_login, checkbox_license_key,
              checkbox_password, prro_enabled, handles_alcohol
       FROM legal_entities
       WHERE organization_id = $1 AND is_active = true AND prro_enabled = true
       ORDER BY is_default DESC, name`,
      [orgId]
    );

    const statuses = await Promise.all(r.rows.map(async (le: any) => {
      const base = { id: le.id, name: le.name, short_name: le.short_name, type: le.type };
      if (!le.checkbox_login || !le.checkbox_password || !le.checkbox_license_key) {
        return { ...base, status: "not_configured", shift: null, cashier: null };
      }
      try {
        const password = decrypt(le.checkbox_password) || le.checkbox_password;
        const token = await checkboxSignin({
          login: le.checkbox_login,
          password,
          licenseKey: le.checkbox_license_key,
        });
        const headers = cbkHeaders(token, le.checkbox_license_key);

        const [cashierR, shiftR] = await Promise.all([
          fetch(`${CHECKBOX_API}/cashier/me`, { headers }),
          fetch(`${CHECKBOX_API}/cashier/shift`, { headers }),
        ]);
        const cashier = cashierR.ok ? await cashierR.json() : null;
        const shift   = shiftR.ok   ? await shiftR.json()   : null;

        return {
          ...base,
          status: shift?.status === "OPENED" ? "open" : (shift?.status === "CLOSED" ? "closed" : "no_shift"),
          shift: shift ? { id: shift.id, status: shift.status, opened_at: shift.opened_at, closed_at: shift.closed_at, balance: shift.balance } : null,
          cashier: cashier ? { name: cashier.full_name || cashier.login, tin: cashier.tin } : null,
        };
      } catch (e: any) {
        return { ...base, status: "error", error: e.message, shift: null, cashier: null };
      }
    }));

    res.json({ statuses });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /fb/prro/:id/open-shift  — відкрити зміну
// ══════════════════════════════════════════════════════════════════════════════
router.post("/:id/open-shift", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const le = await getLegalEntityWithCreds(orgId, id);

    const token = await checkboxSignin({
      login: le.checkbox_login,
      password: le.checkbox_password,
      licenseKey: le.checkbox_license_key,
    });
    const headers = cbkHeaders(token, le.checkbox_license_key);

    // Check if already open
    const checkR = await fetch(`${CHECKBOX_API}/cashier/shift`, { headers });
    if (checkR.ok) {
      const existing = await checkR.json();
      if (existing?.status === "OPENED") {
        return res.json({ ok: true, shift: existing, alreadyOpen: true });
      }
    }

    // Open shift
    const openR = await fetch(`${CHECKBOX_API}/shifts`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    if (!openR.ok) {
      const e = await openR.json().catch(() => ({}));
      return res.status(400).json({ error: `Checkbox: ${e.message || openR.status}` });
    }
    const shift = await openR.json();
    res.json({ ok: true, shift });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /fb/prro/:id/close-shift  — закрити зміну (Z-звіт у Checkbox)
// ══════════════════════════════════════════════════════════════════════════════
router.post("/:id/close-shift", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const le = await getLegalEntityWithCreds(orgId, id);

    const token = await checkboxSignin({
      login: le.checkbox_login,
      password: le.checkbox_password,
      licenseKey: le.checkbox_license_key,
    });
    const headers = cbkHeaders(token, le.checkbox_license_key);

    // Get current shift id
    const shiftR = await fetch(`${CHECKBOX_API}/cashier/shift`, { headers });
    if (!shiftR.ok) return res.status(400).json({ error: "Не вдалося отримати поточну зміну" });
    const shift = await shiftR.json();
    if (shift?.status !== "OPENED") {
      return res.status(400).json({ error: "Зміна вже закрита або не відкрита" });
    }

    // Close shift
    const closeR = await fetch(`${CHECKBOX_API}/shifts/${shift.id}/close`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    if (!closeR.ok) {
      const e = await closeR.json().catch(() => ({}));
      return res.status(400).json({ error: `Checkbox close: ${e.message || closeR.status}` });
    }
    const closed = await closeR.json();
    res.json({ ok: true, shift: closed });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /fb/prro/:id/x-report  — X-звіт (поточний, зміна не закривається)
// ══════════════════════════════════════════════════════════════════════════════
router.get("/:id/x-report", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const le = await getLegalEntityWithCreds(orgId, id);

    const token = await checkboxSignin({
      login: le.checkbox_login,
      password: le.checkbox_password,
      licenseKey: le.checkbox_license_key,
    });
    const headers = cbkHeaders(token, le.checkbox_license_key);

    // Get shift
    const shiftR = await fetch(`${CHECKBOX_API}/cashier/shift`, { headers });
    if (!shiftR.ok) return res.status(400).json({ error: "Зміна не відкрита" });
    const shift = await shiftR.json();
    if (shift?.status !== "OPENED") return res.status(400).json({ error: "Зміна не відкрита" });

    // Get X-report (shift report without closing)
    const xR = await fetch(`${CHECKBOX_API}/shifts/${shift.id}/x-report`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    if (!xR.ok) {
      const e = await xR.json().catch(() => ({}));
      return res.status(400).json({ error: `X-звіт: ${e.message || xR.status}` });
    }
    const report = await xR.json();

    // Also get report text
    const textR = await fetch(`${CHECKBOX_API}/receipts/${report.id}/text`, { headers });
    const text = textR.ok ? await textR.text() : null;

    res.json({ ok: true, report, text, receiptUrl: `https://receipt.checkbox.ua/${report.id}` });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /fb/prro/:id/z-report  — Z-звіт (після закриття зміни)
// ══════════════════════════════════════════════════════════════════════════════
router.get("/:id/z-report", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const { shiftId } = req.query;
    const le = await getLegalEntityWithCreds(orgId, id);

    const token = await checkboxSignin({
      login: le.checkbox_login,
      password: le.checkbox_password,
      licenseKey: le.checkbox_license_key,
    });
    const headers = cbkHeaders(token, le.checkbox_license_key);

    let targetShiftId = shiftId as string;

    if (!targetShiftId) {
      // Get last closed shift
      const shiftsR = await fetch(`${CHECKBOX_API}/shifts?status=CLOSED&limit=1`, { headers });
      if (!shiftsR.ok) return res.status(400).json({ error: "Немає закритих змін" });
      const shiftsData = await shiftsR.json();
      targetShiftId = shiftsData?.results?.[0]?.id;
      if (!targetShiftId) return res.status(400).json({ error: "Немає закритих змін" });
    }

    // Get Z-report
    const zR = await fetch(`${CHECKBOX_API}/shifts/${targetShiftId}/z-report`, { headers });
    if (!zR.ok) {
      const e = await zR.json().catch(() => ({}));
      return res.status(400).json({ error: `Z-звіт: ${e.message || zR.status}` });
    }
    const report = await zR.json();

    // Text
    const textR = await fetch(`${CHECKBOX_API}/receipts/${report.id}/text`, { headers });
    const text = textR.ok ? await textR.text() : null;

    res.json({ ok: true, report, text, receiptUrl: `https://receipt.checkbox.ua/${report.id}` });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /fb/prro/:id/test-receipt  — тестовий чек
// ══════════════════════════════════════════════════════════════════════════════
router.post("/:id/test-receipt", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const le = await getLegalEntityWithCreds(orgId, id);

    const token = await checkboxSignin({
      login: le.checkbox_login,
      password: le.checkbox_password,
      licenseKey: le.checkbox_license_key,
    });

    await ensureShiftOpen(token, le.checkbox_license_key);

    const headers = cbkHeaders(token, le.checkbox_license_key);

    const body = {
      goods: [{
        good: { code: "TEST-001", name: "Тестова позиція", price: 100, },
        quantity: 1000,
      }],
      payments: [{ type: "CASH", value: 100 }],
    };

    const r = await fetch(`${CHECKBOX_API}/receipts/sell`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(400).json({ error: `Тест-чек: ${e.message || r.status}` });
    }
    const receipt = await r.json();
    res.json({
      ok: true,
      receipt,
      receiptUrl: `https://receipt.checkbox.ua/${receipt.id}`,
      qrUrl: `https://receipt.checkbox.ua/${receipt.id}/qrcode`,
    });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /fb/prro/:id/receipts  — останні чеки
// ══════════════════════════════════════════════════════════════════════════════
router.get("/:id/receipts", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const le = await getLegalEntityWithCreds(orgId, id);

    const token = await checkboxSignin({
      login: le.checkbox_login,
      password: le.checkbox_password,
      licenseKey: le.checkbox_license_key,
    });
    const headers = cbkHeaders(token, le.checkbox_license_key);

    const r = await fetch(`${CHECKBOX_API}/receipts?limit=${limit}&desc=true`, { headers });
    if (!r.ok) return res.status(400).json({ error: "Не вдалося отримати чеки" });
    const data = await r.json();
    res.json({ ok: true, receipts: data.results || data });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /fb/prro/:id/shifts  — список змін
// ══════════════════════════════════════════════════════════════════════════════
router.get("/:id/shifts", requireAuth, async (req, res) => {
  try {
    const orgId = getOrg(req);
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const le = await getLegalEntityWithCreds(orgId, id);

    const token = await checkboxSignin({
      login: le.checkbox_login,
      password: le.checkbox_password,
      licenseKey: le.checkbox_license_key,
    });
    const headers = cbkHeaders(token, le.checkbox_license_key);

    const r = await fetch(`${CHECKBOX_API}/shifts?limit=${limit}&desc=true`, { headers });
    if (!r.ok) return res.status(400).json({ error: "Не вдалося отримати зміни" });
    const data = await r.json();
    res.json({ ok: true, shifts: data.results || data });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
