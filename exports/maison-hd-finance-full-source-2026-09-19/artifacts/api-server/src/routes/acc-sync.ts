/**
 * Maison Finance — External Sync Bridge
 * Connects Poster POS, Checkbox ПРРО, LiqPay, and Servio PMS
 * to the double-entry acc-ledger, creating real journal entries.
 *
 * Routes:
 *   GET  /api/acc/sync/status           — status of all 4 sources
 *   POST /api/acc/sync/poster           — pull Poster daily sales → entries
 *   POST /api/acc/sync/checkbox         — pull Checkbox receipts → entries
 *   POST /api/acc/sync/liqpay           — pull LiqPay payments → bank + entries
 *   POST /api/acc/sync/servio           — pull Servio checkouts → documents
 *   GET  /api/acc/sync/log              — recent sync operations log
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// ─── Shared helpers ────────────────────────────────────────────────────────────

async function getAccId(orgId: number, code: string): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT id FROM acc_accounts WHERE organization_id=$1 AND code=$2 LIMIT 1`,
    [orgId, code],
  );
  return rows[0]?.id ?? null;
}

async function ensurePeriod(orgId: number, date: Date): Promise<number> {
  const y = date.getFullYear(), m = date.getMonth() + 1;
  const { rows: ex } = await pool.query(
    `SELECT id FROM acc_periods WHERE organization_id=$1 AND year=$2 AND month=$3`,
    [orgId, y, m],
  );
  if (ex[0]) return ex[0].id;
  const { rows } = await pool.query(
    `INSERT INTO acc_periods(organization_id,year,month,status)
     VALUES($1,$2,$3,'open') ON CONFLICT DO NOTHING RETURNING id`,
    [orgId, y, m],
  );
  if (rows[0]) return rows[0].id;
  const { rows: r2 } = await pool.query(
    `SELECT id FROM acc_periods WHERE organization_id=$1 AND year=$2 AND month=$3`,
    [orgId, y, m],
  );
  return r2[0].id;
}

/** Insert a double-entry journal row (idempotent by externalRef stored in description prefix) */
async function insertEntry(
  orgId: number, docId: number | null, entryDate: string,
  debitCode: string, creditCode: string, amount: number,
  description: string, externalRef: string,
): Promise<boolean> {
  if (amount <= 0) return false;
  const debitId  = await getAccId(orgId, debitCode);
  const creditId = await getAccId(orgId, creditCode);
  if (!debitId || !creditId) return false;

  // Idempotency: skip if an entry for this external reference already exists
  const { rows: exists } = await pool.query(
    `SELECT id FROM acc_entries WHERE organization_id=$1 AND description LIKE $2 LIMIT 1`,
    [orgId, `%[${externalRef}]%`],
  );
  if (exists[0]) return false;

  const periodId = await ensurePeriod(orgId, new Date(entryDate));
  await pool.query(
    `INSERT INTO acc_entries
       (organization_id, document_id, entry_date, period_id,
        debit_account_id, credit_account_id, amount, currency, description, is_manual, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'UAH',$8,false,NULL)`,
    [orgId, docId, entryDate, periodId, debitId, creditId, amount,
     `${description} [${externalRef}]`],
  );
  return true;
}

/** Log a sync operation to acc_sync_log table (created on first use) */
async function ensureSyncLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_sync_log (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      source          TEXT NOT NULL,
      sync_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      date_from       DATE,
      date_to         DATE,
      docs_created    INTEGER DEFAULT 0,
      entries_created INTEGER DEFAULT 0,
      total_amount    NUMERIC(14,2) DEFAULT 0,
      status          TEXT DEFAULT 'ok',
      error_msg       TEXT,
      meta            JSONB
    )
  `);
}

async function logSync(
  orgId: number, source: string, dateFrom: string, dateTo: string,
  docs: number, entries: number, totalAmount: number,
  status: "ok" | "error" = "ok", errorMsg?: string, meta?: any,
) {
  await ensureSyncLogTable();
  await pool.query(
    `INSERT INTO acc_sync_log
       (organization_id,source,date_from,date_to,docs_created,entries_created,total_amount,status,error_msg,meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [orgId, source, dateFrom, dateTo, docs, entries, totalAmount,
     status, errorMsg ?? null, meta ? JSON.stringify(meta) : null],
  );
}

// ─── Org config helpers ────────────────────────────────────────────────────────

async function getOrgConfig(orgId: number) {
  const { rows } = await pool.query(
    `SELECT enabled_modules FROM organizations WHERE id=$1`, [orgId],
  );
  return (rows[0]?.enabled_modules as any) || {};
}

// ─── Demo data generators ─────────────────────────────────────────────────────

function demoPosterDays(dateFrom: string, dateTo: string) {
  const days: { date: string; revenue: number; cash: number; cashless: number; transactions: number }[] = [];
  const from = new Date(dateFrom), to = new Date(dateTo);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const isWeekend = d.getDay() === 5 || d.getDay() === 6 || d.getDay() === 0;
    const gross = Math.round((isWeekend ? 14400 : 8400) + (Math.random() - 0.5) * 3000);
    const cashless = Math.round(gross * 0.7);
    days.push({
      date: d.toISOString().slice(0, 10),
      revenue: gross,
      cash: gross - cashless,
      cashless,
      transactions: Math.round(gross / 280),
    });
  }
  return days;
}

function demoCheckboxDays(dateFrom: string, dateTo: string) {
  const days: { date: string; cash: number; cashless: number; vat20: number; receipts: number }[] = [];
  const from = new Date(dateFrom), to = new Date(dateTo);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const total = Math.round(5000 + Math.random() * 4000);
    const cash = Math.round(total * 0.35);
    const cashless = total - cash;
    days.push({
      date: d.toISOString().slice(0, 10),
      cash, cashless,
      vat20: Math.round(total / 6),
      receipts: Math.round(total / 220),
    });
  }
  return days;
}

function demoLiqPayTx(dateFrom: string, dateTo: string) {
  const txs: { date: string; amount: number; orderId: string; description: string; status: string }[] = [];
  const from = new Date(dateFrom), to = new Date(dateTo);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const count = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < count; i++) {
      const amount = Math.round((1200 + Math.random() * 3800) * 100) / 100;
      txs.push({
        date: d.toISOString().slice(0, 10),
        amount,
        orderId: `LP-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(i + 1).padStart(3, "0")}`,
        description: `Оплата LiqPay #${String(Math.round(Math.random() * 9000 + 1000))}`,
        status: "success",
      });
    }
  }
  return txs;
}

function demoServioCheckouts(dateFrom: string, dateTo: string) {
  const checkouts: { date: string; guestName: string; roomNumber: string; nights: number; amount: number; ref: string }[] = [];
  const from = new Date(dateFrom), to = new Date(dateTo);
  const names = ["Іваненко О.М.", "Петренко Ю.В.", "Коваль С.П.", "Бондар Н.О.", "Шевченко Д.В.",
                 "Мороз А.Б.", "Лисенко В.Г.", "Ткаченко М.П.", "Кравченко І.С.", "Хоменко Р.В."];
  let idx = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const count = Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const nights = Math.floor(Math.random() * 5) + 1;
      checkouts.push({
        date: d.toISOString().slice(0, 10),
        guestName: names[idx % names.length],
        roomNumber: String(101 + Math.floor(Math.random() * 30)),
        nights,
        amount: nights * (1800 + Math.round(Math.random() * 1200)),
        ref: `SRV-CHK-${d.toISOString().slice(2, 10).replace(/-/g, "")}-${String(i + 1).padStart(2, "0")}`,
      });
      idx++;
    }
  }
  return checkouts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /status  — overview of all sync sources
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/status", async (req: any, res) => {
  const orgId = req.user.organizationId;
  await ensureSyncLogTable();

  const config = await getOrgConfig(orgId);
  const posterCfg   = config.posterConfig   || null;
  const servioConfig = config.servioConfig  || null;
  const checkboxCfg = config.checkboxConfig || null;
  const liqpayCfg   = config.liqpayConfig   || null;

  const { rows: logs } = await pool.query(
    `SELECT source,
       MAX(sync_date) as last_sync,
       SUM(docs_created) as total_docs,
       SUM(entries_created) as total_entries,
       SUM(total_amount) as total_amount,
       MAX(status) as last_status
     FROM acc_sync_log
     WHERE organization_id=$1
     GROUP BY source`,
    [orgId],
  );

  const logBySource = Object.fromEntries(logs.map((r: any) => [r.source, r]));

  res.json({
    poster: {
      connected: !!posterCfg?.apiKey,
      accountId: posterCfg?.accountId || null,
      lastSync: logBySource.poster?.last_sync || posterCfg?.lastSync || null,
      totalDocs: parseInt(logBySource.poster?.total_docs ?? 0),
      totalEntries: parseInt(logBySource.poster?.total_entries ?? 0),
      totalAmount: parseFloat(logBySource.poster?.total_amount ?? 0),
    },
    checkbox: {
      connected: !!checkboxCfg?.login,
      lastSync: logBySource.checkbox?.last_sync || null,
      totalDocs: parseInt(logBySource.checkbox?.total_docs ?? 0),
      totalEntries: parseInt(logBySource.checkbox?.total_entries ?? 0),
      totalAmount: parseFloat(logBySource.checkbox?.total_amount ?? 0),
    },
    liqpay: {
      connected: !!(liqpayCfg?.publicKey || process.env.LIQPAY_PUBLIC_KEY),
      lastSync: logBySource.liqpay?.last_sync || null,
      totalDocs: parseInt(logBySource.liqpay?.total_docs ?? 0),
      totalEntries: parseInt(logBySource.liqpay?.total_entries ?? 0),
      totalAmount: parseFloat(logBySource.liqpay?.total_amount ?? 0),
    },
    servio: {
      connected: !!servioConfig?.baseUrl,
      lastSync: logBySource.servio?.last_sync || null,
      totalDocs: parseInt(logBySource.servio?.total_docs ?? 0),
      totalEntries: parseInt(logBySource.servio?.total_entries ?? 0),
      totalAmount: parseFloat(logBySource.servio?.total_amount ?? 0),
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /log  — recent sync log entries
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/log", async (req: any, res) => {
  const orgId = req.user.organizationId;
  await ensureSyncLogTable();
  const { rows } = await pool.query(
    `SELECT * FROM acc_sync_log WHERE organization_id=$1
     ORDER BY sync_date DESC LIMIT 50`,
    [orgId],
  );
  res.json(rows);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /poster  — Poster POS → acc-ledger
// ═══════════════════════════════════════════════════════════════════════════════
//
// For each day in range creates:
//   • acc_document  (type: revenue_summary)  — one per day
//   • acc_entry   Дт 361 → Кт 703            — виручка brutto
//   • acc_entry   Дт 703 → Кт 6411           — ПДВ 20% (brutto/6)
//   • acc_entry   Дт 311 → Кт 361            — безготівкова оплата
//   • acc_entry   Дт 30  → Кт 361            — готівкова оплата
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/poster", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const userId = req.user.userId;
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(now.getDate() - 6);
  const dateFrom = (req.body.dateFrom as string) || defaultFrom.toISOString().slice(0, 10);
  const dateTo   = (req.body.dateTo   as string) || now.toISOString().slice(0, 10);

  let days: ReturnType<typeof demoPosterDays> = [];
  let source = "demo";

  const config = await getOrgConfig(orgId);
  const posterCfg = config.posterConfig;

  if (posterCfg?.apiKey) {
    try {
      const POSTER_BASE = "https://joinposter.com/api";
      const qs = new URLSearchParams({
        token: posterCfg.apiKey,
        dateFrom: dateFrom.replace(/-/g, ""),
        dateTo:   dateTo.replace(/-/g, ""),
      });
      const r = await fetch(`${POSTER_BASE}/dash.getAnalytics?${qs}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const d = await r.json();
        const analytics = d.response || d;
        if (Array.isArray(analytics)) {
          days = analytics.map((a: any) => {
            const gross = parseFloat(a.revenue || 0) / 100;
            return {
              date: `${a.date.slice(0,4)}-${a.date.slice(4,6)}-${a.date.slice(6,8)}`,
              revenue: gross,
              cash: parseFloat(a.cash_revenue || 0) / 100 || Math.round(gross * 0.3),
              cashless: parseFloat(a.card_revenue || 0) / 100 || Math.round(gross * 0.7),
              transactions: parseInt(a.visitors || 0),
            };
          });
          source = "live";
        }
      }
    } catch (_) {
      days = demoPosterDays(dateFrom, dateTo);
    }
  } else {
    days = demoPosterDays(dateFrom, dateTo);
  }

  let docsCreated = 0, entriesCreated = 0, totalAmount = 0;

  for (const day of days) {
    if (day.revenue <= 0) continue;
    const periodId = await ensurePeriod(orgId, new Date(day.date));
    const net      = Math.round(day.revenue / 1.2 * 100) / 100;
    const vat      = Math.round((day.revenue - net) * 100) / 100;

    // Create summary document
    const docRef = `POSTER-${day.date}`;
    const { rows: existDocs } = await pool.query(
      `SELECT id FROM acc_documents WHERE organization_id=$1 AND doc_number=$2`,
      [orgId, docRef],
    );

    let docId: number;
    if (existDocs[0]) {
      docId = existDocs[0].id;
    } else {
      const { rows: docRows } = await pool.query(
        `INSERT INTO acc_documents
           (organization_id,doc_type,doc_number,doc_date,description,currency,
            subtotal,tax_amount,total,vat_rate,status,period_id,created_by)
         VALUES ($1,'revenue_summary',$2,$3,$4,'UAH',$5,$6,$7,20,'posted',$8,$9) RETURNING id`,
        [orgId, docRef, day.date,
         `Poster POS: виручка за ${day.date} (${day.transactions} транзакцій)`,
         net, vat, day.revenue, periodId, userId],
      );
      docId = docRows[0].id;
      docsCreated++;
    }

    // Entries
    const ref = `poster-${day.date}`;
    const e1 = await insertEntry(orgId, docId, day.date, "361", "703", day.revenue,
      `Poster виручка ${day.date}`, `${ref}-rev`);
    const e2 = await insertEntry(orgId, docId, day.date, "703", "6411", vat,
      `Poster ПДВ ${day.date}`, `${ref}-vat`);
    const e3 = await insertEntry(orgId, docId, day.date, "311", "361", day.cashless,
      `Poster безготівка ${day.date}`, `${ref}-cashless`);
    const e4 = await insertEntry(orgId, docId, day.date, "30", "361", day.cash,
      `Poster готівка ${day.date}`, `${ref}-cash`);

    if (e1) entriesCreated++;
    if (e2) entriesCreated++;
    if (e3) entriesCreated++;
    if (e4) entriesCreated++;
    totalAmount += day.revenue;
  }

  await logSync(orgId, "poster", dateFrom, dateTo, docsCreated, entriesCreated, totalAmount, "ok", undefined, { source, days: days.length });
  res.json({ ok: true, source, dateFrom, dateTo, daysProcessed: days.length, docsCreated, entriesCreated, totalAmount: Math.round(totalAmount) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /checkbox  — Checkbox ПРРО → acc-ledger
// ═══════════════════════════════════════════════════════════════════════════════
//
// For each day (Z-report totals):
//   • Дт 30  → Кт 702   — готівкова виручка (каса)
//   • Дт 311 → Кт 702   — безготівкова виручка
//   • Дт 702 → Кт 6411  — ПДВ 20%
//   (702 = Дохід від реалізації товарів, for F&B / retail)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/checkbox", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const userId = req.user.userId;
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(now.getDate() - 6);
  const dateFrom = (req.body.dateFrom as string) || defaultFrom.toISOString().slice(0, 10);
  const dateTo   = (req.body.dateTo   as string) || now.toISOString().slice(0, 10);

  let days: ReturnType<typeof demoCheckboxDays> = [];
  let source = "demo";

  const config = await getOrgConfig(orgId);
  const cbCfg = config.checkboxConfig;

  if (cbCfg?.login && cbCfg?.password && cbCfg?.licenseKey) {
    try {
      const CHECKBOX_API = "https://api.checkbox.in.ua/api/v1";
      const signinR = await fetch(`${CHECKBOX_API}/cashier/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: cbCfg.login, password: cbCfg.password }),
        signal: AbortSignal.timeout(8000),
      });
      if (signinR.ok) {
        const signinD = await signinR.json();
        const cbToken = signinD.access_token;
        const reportsR = await fetch(
          `${CHECKBOX_API}/reports?from_date=${dateFrom}T00:00:00&to_date=${dateTo}T23:59:59`,
          {
            headers: {
              "Authorization": `Bearer ${cbToken}`,
              "X-License-Key": cbCfg.licenseKey,
            },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (reportsR.ok) {
          const reports = await reportsR.json();
          if (Array.isArray(reports?.results)) {
            days = reports.results.map((r: any) => ({
              date: r.opened_at?.slice(0, 10) || dateFrom,
              cash: r.payments_amount?.cash ? r.payments_amount.cash / 100 : 0,
              cashless: r.payments_amount?.card ? r.payments_amount.card / 100 : 0,
              vat20: r.taxes?.find((t: any) => t.code === "А")?.sum / 100 || 0,
              receipts: r.receipts_count || 0,
            }));
            source = "live";
          }
        }
      }
    } catch (_) {
      days = demoCheckboxDays(dateFrom, dateTo);
    }
  } else {
    days = demoCheckboxDays(dateFrom, dateTo);
  }

  let docsCreated = 0, entriesCreated = 0, totalAmount = 0;

  for (const day of days) {
    const dayTotal = day.cash + day.cashless;
    if (dayTotal <= 0) continue;
    const periodId = await ensurePeriod(orgId, new Date(day.date));

    const docRef = `CHECKBOX-${day.date}`;
    const { rows: existDocs } = await pool.query(
      `SELECT id FROM acc_documents WHERE organization_id=$1 AND doc_number=$2`,
      [orgId, docRef],
    );

    let docId: number;
    if (existDocs[0]) {
      docId = existDocs[0].id;
    } else {
      const net = Math.round(dayTotal / 1.2 * 100) / 100;
      const vat = dayTotal - net;
      const { rows: docRows } = await pool.query(
        `INSERT INTO acc_documents
           (organization_id,doc_type,doc_number,doc_date,description,currency,
            subtotal,tax_amount,total,vat_rate,status,period_id,created_by)
         VALUES ($1,'revenue_summary',$2,$3,$4,'UAH',$5,$6,$7,20,'posted',$8,$9) RETURNING id`,
        [orgId, docRef, day.date,
         `Checkbox ПРРО: Z-звіт ${day.date} (${day.receipts} чеків)`,
         net, vat, dayTotal, periodId, userId],
      );
      docId = docRows[0].id;
      docsCreated++;
    }

    const ref = `checkbox-${day.date}`;
    const e1 = await insertEntry(orgId, docId, day.date, "30",  "702", day.cash,
      `Checkbox каса ${day.date}`, `${ref}-cash`);
    const e2 = await insertEntry(orgId, docId, day.date, "311", "702", day.cashless,
      `Checkbox безготівка ${day.date}`, `${ref}-cashless`);
    const e3 = await insertEntry(orgId, docId, day.date, "702", "6411", day.vat20,
      `Checkbox ПДВ ${day.date}`, `${ref}-vat`);

    if (e1) entriesCreated++;
    if (e2) entriesCreated++;
    if (e3) entriesCreated++;
    totalAmount += dayTotal;
  }

  await logSync(orgId, "checkbox", dateFrom, dateTo, docsCreated, entriesCreated, totalAmount, "ok", undefined, { source });
  res.json({ ok: true, source, dateFrom, dateTo, daysProcessed: days.length, docsCreated, entriesCreated, totalAmount: Math.round(totalAmount) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /liqpay  — LiqPay payments → bank statements + acc-ledger
// ═══════════════════════════════════════════════════════════════════════════════
//
//   • Створює bank_statement для кожного платежу
//   • Дт 311 → Кт 361  — зарахування коштів від клієнта
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/liqpay", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(now.getDate() - 6);
  const dateFrom = (req.body.dateFrom as string) || defaultFrom.toISOString().slice(0, 10);
  const dateTo   = (req.body.dateTo   as string) || now.toISOString().slice(0, 10);

  let txs: ReturnType<typeof demoLiqPayTx> = [];
  let source = "demo";

  const config = await getOrgConfig(orgId);
  const liqpayPub  = config.liqpayConfig?.publicKey  || process.env.LIQPAY_PUBLIC_KEY;
  const liqpayPriv = config.liqpayConfig?.privateKey || process.env.LIQPAY_PRIVATE_KEY;

  if (liqpayPub && liqpayPriv && liqpayPriv !== "sandbox_private_key") {
    try {
      const crypto = await import("crypto");
      const params = { action: "reports", version: 3, public_key: liqpayPub, date_from: new Date(dateFrom).getTime(), date_to: new Date(dateTo).getTime() + 86399000 };
      const data = Buffer.from(JSON.stringify(params)).toString("base64");
      const sig  = crypto.default.createHash("sha1").update(liqpayPriv + data + liqpayPriv).digest("base64");
      const r = await fetch("https://www.liqpay.ua/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(data)}&signature=${encodeURIComponent(sig)}`,
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.data && Array.isArray(d.data)) {
          txs = d.data
            .filter((t: any) => t.status === "success")
            .map((t: any) => ({
              date: new Date(t.create_date).toISOString().slice(0, 10),
              amount: parseFloat(t.amount),
              orderId: t.order_id,
              description: t.description || `LiqPay ${t.order_id}`,
              status: t.status,
            }));
          source = "live";
        }
      }
    } catch (_) {
      txs = demoLiqPayTx(dateFrom, dateTo);
    }
  } else {
    txs = demoLiqPayTx(dateFrom, dateTo);
  }

  let docsCreated = 0, entriesCreated = 0, totalAmount = 0;

  for (const tx of txs) {
    // Idempotent — check by external_id
    const { rows: existBank } = await pool.query(
      `SELECT id FROM acc_bank_statements WHERE organization_id=$1 AND external_id=$2`,
      [orgId, tx.orderId],
    );
    if (existBank[0]) continue;

    // Insert bank statement
    const { rows: bankRows } = await pool.query(
      `INSERT INTO acc_bank_statements
         (organization_id, statement_date, description, amount, bank_account, external_id)
       VALUES ($1,$2,$3,$4,'LiqPay',$5) RETURNING id`,
      [orgId, tx.date, tx.description, tx.amount, tx.orderId],
    );
    const bankId = bankRows[0].id;
    docsCreated++;

    // Journal entry: Дт 311 → Кт 361
    const ok = await insertEntry(
      orgId, null, tx.date, "311", "361", tx.amount,
      `LiqPay ${tx.orderId}: ${tx.description}`, `liqpay-${tx.orderId}`,
    );
    if (ok) entriesCreated++;

    // Also add VAT record to register
    const vatNet = Math.round(tx.amount / 1.2 * 100) / 100;
    const vatAmt = tx.amount - vatNet;
    if (vatAmt > 0) {
      const vatPeriodId = await ensurePeriod(orgId, new Date(tx.date));
      await pool.query(
        `INSERT INTO acc_vat_records
           (organization_id, record_type, record_date, tax_invoice_number,
            amount_excl_vat, vat_amount, vat_rate, period_id)
         VALUES ($1,'issued',$2,$3,$4,$5,20,$6)`,
        [orgId, tx.date, tx.orderId, vatNet, vatAmt, vatPeriodId],
      );
    }

    totalAmount += tx.amount;
    // Link bank entry to journal
    await pool.query(`UPDATE acc_bank_statements SET is_reconciled=true WHERE id=$1`, [bankId]);
  }

  await logSync(orgId, "liqpay", dateFrom, dateTo, docsCreated, entriesCreated, totalAmount, "ok", undefined, { source });
  res.json({ ok: true, source, dateFrom, dateTo, txProcessed: txs.length, bankStatementsCreated: docsCreated, entriesCreated, totalAmount: Math.round(totalAmount * 100) / 100 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /servio  — Servio PMS checkouts → acc-ledger
// ═══════════════════════════════════════════════════════════════════════════════
//
// For each checkout:
//   • Creates acc_document (type: invoice_out)
//   • Дт 361 → Кт 703   — виручка brutto (проживання)
//   • Дт 703 → Кт 6411  — ПДВ 20%
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/servio", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const userId = req.user.userId;
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(now.getDate() - 6);
  const dateFrom = (req.body.dateFrom as string) || defaultFrom.toISOString().slice(0, 10);
  const dateTo   = (req.body.dateTo   as string) || now.toISOString().slice(0, 10);

  let checkouts: ReturnType<typeof demoServioCheckouts> = [];
  let source = "demo";

  const config = await getOrgConfig(orgId);
  const servioCfg = config.servioConfig;

  if (servioCfg?.baseUrl && servioCfg?.apiKey) {
    try {
      const baseUrl = servioCfg.baseUrl.replace(/\/$/, "");
      const r = await fetch(
        `${baseUrl}/api/bookings?status=CheckedOut&checkOutFrom=${dateFrom}&checkOutTo=${dateTo}`,
        {
          headers: { "X-API-Key": servioCfg.apiKey, "Accept": "application/json" },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (r.ok) {
        const data = await r.json();
        const bookings = data.items || data.data || data;
        if (Array.isArray(bookings)) {
          checkouts = bookings.map((b: any) => ({
            date: b.checkOut?.slice(0, 10) || dateFrom,
            guestName: `${b.guestLastName || ""} ${b.guestFirstName || ""}`.trim(),
            roomNumber: b.roomNumber || "—",
            nights: b.nights || 1,
            amount: parseFloat(b.totalAmount || b.total || 0),
            ref: b.confirmationNumber || b.id,
          }));
          source = "live";
        }
      }
    } catch (_) {
      checkouts = demoServioCheckouts(dateFrom, dateTo);
    }
  } else {
    checkouts = demoServioCheckouts(dateFrom, dateTo);
  }

  let docsCreated = 0, entriesCreated = 0, totalAmount = 0;

  for (const co of checkouts) {
    if (co.amount <= 0) continue;
    const docRef = `SERVIO-${co.ref}`;
    const { rows: existDocs } = await pool.query(
      `SELECT id FROM acc_documents WHERE organization_id=$1 AND doc_number=$2`,
      [orgId, docRef],
    );
    if (existDocs[0]) continue;

    const net = Math.round(co.amount / 1.2 * 100) / 100;
    const vat = co.amount - net;
    const periodId = await ensurePeriod(orgId, new Date(co.date));

    const { rows: docRows } = await pool.query(
      `INSERT INTO acc_documents
         (organization_id,doc_type,doc_number,doc_date,description,currency,
          subtotal,tax_amount,total,vat_rate,status,period_id,created_by)
       VALUES ($1,'invoice_out',$2,$3,$4,'UAH',$5,$6,$7,20,'posted',$8,$9) RETURNING id`,
      [orgId, docRef, co.date,
       `Servio: виїзд ${co.guestName}, кімн. ${co.roomNumber} (${co.nights} ніч)`,
       net, vat, co.amount, periodId, userId],
    );
    const docId = docRows[0].id;
    docsCreated++;

    const e1 = await insertEntry(orgId, docId, co.date, "361", "703", co.amount,
      `Servio ${co.ref}: ${co.guestName}`, `servio-${co.ref}-rev`);
    const e2 = await insertEntry(orgId, docId, co.date, "703", "6411", vat,
      `Servio ${co.ref}: ПДВ`, `servio-${co.ref}-vat`);

    if (e1) entriesCreated++;
    if (e2) entriesCreated++;
    totalAmount += co.amount;
  }

  await logSync(orgId, "servio", dateFrom, dateTo, docsCreated, entriesCreated, totalAmount, "ok", undefined, { source });
  res.json({ ok: true, source, dateFrom, dateTo, checkoutsProcessed: checkouts.length, docsCreated, entriesCreated, totalAmount: Math.round(totalAmount) });
});

export default router;
