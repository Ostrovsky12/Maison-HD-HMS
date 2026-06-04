/**
 * Maison Finance — Ledger (подвійне проведення)
 * План рахунків, журнал проводок, ПДВ-реєстр, звіти
 * Замінник 1С для українського SMB
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
router.use(requireAuth);

// ─── Ukrainian Standard Chart of Accounts (Наказ МФУ №291) ──────────────────
const UA_PLAN: Array<{ code: string; name: string; type: string; class: number; parent?: string }> = [
  // Клас 1 — Необоротні активи
  { code: "10",   name: "Основні засоби",                          type: "asset",     class: 1 },
  { code: "101",  name: "Земельні ділянки",                        type: "asset",     class: 1, parent: "10" },
  { code: "103",  name: "Будинки та споруди",                      type: "asset",     class: 1, parent: "10" },
  { code: "104",  name: "Машини та обладнання",                    type: "asset",     class: 1, parent: "10" },
  { code: "105",  name: "Транспортні засоби",                      type: "asset",     class: 1, parent: "10" },
  { code: "106",  name: "Інструменти, прилади та інвентар",        type: "asset",     class: 1, parent: "10" },
  { code: "109",  name: "Інші основні засоби",                     type: "asset",     class: 1, parent: "10" },
  { code: "11",   name: "Інші необоротні матеріальні активи",      type: "asset",     class: 1 },
  { code: "12",   name: "Нематеріальні активи",                    type: "asset",     class: 1 },
  { code: "13",   name: "Знос необоротних активів",                type: "asset",     class: 1 },
  { code: "131",  name: "Знос основних засобів",                   type: "asset",     class: 1, parent: "13" },
  { code: "132",  name: "Знос інших необоротних активів",          type: "asset",     class: 1, parent: "13" },
  { code: "133",  name: "Амортизація нематеріальних активів",      type: "asset",     class: 1, parent: "13" },
  { code: "15",   name: "Капітальні інвестиції",                   type: "asset",     class: 1 },
  { code: "18",   name: "Довгострокова дебіторська заборгованість",type: "asset",     class: 1 },
  // Клас 2 — Запаси
  { code: "20",   name: "Виробничі запаси",                        type: "asset",     class: 2 },
  { code: "201",  name: "Сировина й матеріали",                    type: "asset",     class: 2, parent: "20" },
  { code: "203",  name: "Паливо",                                  type: "asset",     class: 2, parent: "20" },
  { code: "205",  name: "Будівельні матеріали",                    type: "asset",     class: 2, parent: "20" },
  { code: "207",  name: "Запасні частини",                         type: "asset",     class: 2, parent: "20" },
  { code: "209",  name: "Інші матеріали",                          type: "asset",     class: 2, parent: "20" },
  { code: "22",   name: "Малоцінні та швидкозношувані предмети",   type: "asset",     class: 2 },
  { code: "23",   name: "Виробництво",                             type: "asset",     class: 2 },
  { code: "26",   name: "Готова продукція",                        type: "asset",     class: 2 },
  { code: "28",   name: "Товари",                                  type: "asset",     class: 2 },
  { code: "281",  name: "Товари на складі",                        type: "asset",     class: 2, parent: "28" },
  { code: "282",  name: "Товари в торгівлі",                       type: "asset",     class: 2, parent: "28" },
  // Клас 3 — Грошові кошти та розрахунки
  { code: "30",   name: "Готівка",                                 type: "asset",     class: 3 },
  { code: "301",  name: "Готівка в національній валюті",           type: "asset",     class: 3, parent: "30" },
  { code: "302",  name: "Готівка в іноземній валюті",              type: "asset",     class: 3, parent: "30" },
  { code: "31",   name: "Рахунки в банках",                        type: "asset",     class: 3 },
  { code: "311",  name: "Поточні рахунки (грн)",                   type: "asset",     class: 3, parent: "31" },
  { code: "312",  name: "Поточні рахунки (валюта)",                type: "asset",     class: 3, parent: "31" },
  { code: "36",   name: "Розрахунки з покупцями та замовниками",   type: "asset",     class: 3 },
  { code: "361",  name: "Розрахунки з вітчизняними покупцями",     type: "asset",     class: 3, parent: "36" },
  { code: "362",  name: "Розрахунки з іноземними покупцями",       type: "asset",     class: 3, parent: "36" },
  { code: "37",   name: "Розрахунки з різними дебіторами",         type: "asset",     class: 3 },
  { code: "371",  name: "Аванси видані",                           type: "asset",     class: 3, parent: "37" },
  { code: "372",  name: "Розрахунки з підзвітними особами",        type: "asset",     class: 3, parent: "37" },
  { code: "377",  name: "Інші дебітори",                           type: "asset",     class: 3, parent: "37" },
  { code: "39",   name: "Витрати майбутніх періодів",              type: "asset",     class: 3 },
  // Клас 4 — Власний капітал
  { code: "40",   name: "Зареєстрований (пайовий) капітал",        type: "equity",    class: 4 },
  { code: "42",   name: "Додатковий капітал",                      type: "equity",    class: 4 },
  { code: "43",   name: "Резервний капітал",                       type: "equity",    class: 4 },
  { code: "44",   name: "Нерозподілені прибутки (збитки)",         type: "equity",    class: 4 },
  { code: "441",  name: "Прибуток нерозподілений",                 type: "equity",    class: 4, parent: "44" },
  { code: "442",  name: "Непокриті збитки",                        type: "equity",    class: 4, parent: "44" },
  // Клас 5 — Довгострокові зобов'язання
  { code: "50",   name: "Довгострокові позики",                    type: "liability", class: 5 },
  { code: "501",  name: "Довгострокові кредити банків",            type: "liability", class: 5, parent: "50" },
  { code: "55",   name: "Інші довгострокові зобов'язання",         type: "liability", class: 5 },
  // Клас 6 — Поточні зобов'язання
  { code: "60",   name: "Короткострокові позики",                  type: "liability", class: 6 },
  { code: "601",  name: "Короткострокові кредити банків",          type: "liability", class: 6, parent: "60" },
  { code: "63",   name: "Розрахунки з постачальниками",            type: "liability", class: 6 },
  { code: "631",  name: "Розрахунки з вітчизняними постачальниками",type:"liability", class: 6, parent: "63" },
  { code: "632",  name: "Розрахунки з іноземними постачальниками", type: "liability", class: 6, parent: "63" },
  { code: "64",   name: "Розрахунки за податками й платежами",     type: "tax",       class: 6 },
  { code: "641",  name: "Розрахунки за податками",                 type: "tax",       class: 6, parent: "64" },
  { code: "6411", name: "ПДВ (податкові зобов'язання)",            type: "tax",       class: 6, parent: "641" },
  { code: "6412", name: "Податок на прибуток",                     type: "tax",       class: 6, parent: "641" },
  { code: "643",  name: "Податкові зобов'язання (ПДВ аванс)",     type: "tax",       class: 6, parent: "64" },
  { code: "644",  name: "Податковий кредит (ПДВ вхідний)",        type: "tax",       class: 6, parent: "64" },
  { code: "65",   name: "Розрахунки за страхуванням",              type: "liability", class: 6 },
  { code: "651",  name: "Єдиний соціальний внесок",                type: "liability", class: 6, parent: "65" },
  { code: "66",   name: "Розрахунки за виплатами працівникам",     type: "liability", class: 6 },
  { code: "661",  name: "Розрахунки за заробітною платою",         type: "liability", class: 6, parent: "66" },
  { code: "663",  name: "Розрахунки за іншими виплатами",          type: "liability", class: 6, parent: "66" },
  { code: "68",   name: "Розрахунки за іншими операціями",         type: "liability", class: 6 },
  { code: "681",  name: "Аванси одержані",                         type: "liability", class: 6, parent: "68" },
  { code: "685",  name: "Інші кредитори",                          type: "liability", class: 6, parent: "68" },
  { code: "69",   name: "Доходи майбутніх періодів",               type: "liability", class: 6 },
  // Клас 7 — Доходи
  { code: "70",   name: "Доходи від реалізації",                   type: "income",    class: 7 },
  { code: "701",  name: "Дохід від реалізації готової продукції",  type: "income",    class: 7, parent: "70" },
  { code: "702",  name: "Дохід від реалізації товарів",            type: "income",    class: 7, parent: "70" },
  { code: "703",  name: "Дохід від реалізації послуг",             type: "income",    class: 7, parent: "70" },
  { code: "71",   name: "Інший операційний дохід",                 type: "income",    class: 7 },
  { code: "713",  name: "Дохід від операційної оренди",            type: "income",    class: 7, parent: "71" },
  { code: "719",  name: "Інші операційні доходи",                  type: "income",    class: 7, parent: "71" },
  { code: "73",   name: "Інші фінансові доходи",                   type: "income",    class: 7 },
  { code: "74",   name: "Інші доходи",                             type: "income",    class: 7 },
  // Клас 8 — Витрати за елементами
  { code: "80",   name: "Матеріальні витрати",                     type: "expense",   class: 8 },
  { code: "81",   name: "Витрати на оплату праці",                 type: "expense",   class: 8 },
  { code: "82",   name: "Відрахування на соціальні заходи",        type: "expense",   class: 8 },
  { code: "83",   name: "Амортизація",                             type: "expense",   class: 8 },
  { code: "84",   name: "Інші операційні витрати",                 type: "expense",   class: 8 },
  // Клас 9 — Витрати за функцією
  { code: "90",   name: "Собівартість реалізації",                 type: "expense",   class: 9 },
  { code: "901",  name: "Собівартість реалізованої продукції",     type: "expense",   class: 9, parent: "90" },
  { code: "902",  name: "Собівартість реалізованих товарів",       type: "expense",   class: 9, parent: "90" },
  { code: "903",  name: "Собівартість реалізованих послуг",        type: "expense",   class: 9, parent: "90" },
  { code: "91",   name: "Загальновиробничі витрати",               type: "expense",   class: 9 },
  { code: "92",   name: "Адміністративні витрати",                 type: "expense",   class: 9 },
  { code: "93",   name: "Витрати на збут",                         type: "expense",   class: 9 },
  { code: "94",   name: "Інші операційні витрати",                 type: "expense",   class: 9 },
  { code: "947",  name: "Нестача та втрати від псування цінностей",type: "expense",   class: 9, parent: "94" },
  { code: "95",   name: "Фінансові витрати",                       type: "expense",   class: 9 },
  { code: "97",   name: "Інші витрати",                            type: "expense",   class: 9 },
  { code: "98",   name: "Податок на прибуток",                     type: "expense",   class: 9 },
];

// Auto-posting rules per document type
const POSTING_RULES: Record<string, Array<{ debit: string; credit: string; basis: "total" | "subtotal" | "tax" }>> = {
  invoice_out:  [{ debit: "361", credit: "703", basis: "total" }, { debit: "703", credit: "6411", basis: "tax" }],
  invoice_in:   [{ debit: "28",  credit: "631", basis: "subtotal" }, { debit: "644", credit: "631", basis: "tax" }],
  act_out:      [{ debit: "361", credit: "703", basis: "total" }, { debit: "703", credit: "6411", basis: "tax" }],
  act_in:       [{ debit: "92",  credit: "631", basis: "subtotal" }, { debit: "644", credit: "631", basis: "tax" }],
  payment_in:   [{ debit: "311", credit: "361", basis: "total" }],
  payment_out:  [{ debit: "631", credit: "311", basis: "total" }],
  cash_in:      [{ debit: "301", credit: "361", basis: "total" }],
  cash_out:     [{ debit: "631", credit: "301", basis: "total" }],
  advance_in:   [{ debit: "311", credit: "681", basis: "total" }],
  advance_out:  [{ debit: "371", credit: "311", basis: "total" }],
  payroll:      [{ debit: "92",  credit: "661", basis: "total" }],
  esv:          [{ debit: "82",  credit: "651", basis: "total" }],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensurePeriod(orgId: number, date: Date): Promise<number> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const { rows } = await pool.query(
    `INSERT INTO acc_periods (organization_id, year, month)
     VALUES ($1,$2,$3) ON CONFLICT (organization_id,year,month)
     DO UPDATE SET year=EXCLUDED.year RETURNING id`,
    [orgId, year, month],
  );
  return rows[0].id;
}

async function seedChart(orgId: number): Promise<void> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM acc_accounts WHERE organization_id=$1`, [orgId],
  );
  if (parseInt(rows[0].cnt) > 0) return;
  const codeToId: Record<string, number> = {};
  for (const acc of UA_PLAN) {
    const parentId = acc.parent ? (codeToId[acc.parent] ?? null) : null;
    const { rows: ins } = await pool.query(
      `INSERT INTO acc_accounts (organization_id, code, name, type, class, parent_id, is_system)
       VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [orgId, acc.code, acc.name, acc.type, acc.class, parentId],
    );
    codeToId[acc.code] = ins[0].id;
  }
}

async function getAccId(orgId: number, code: string): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT id FROM acc_accounts WHERE organization_id=$1 AND code=$2 LIMIT 1`,
    [orgId, code],
  );
  return rows[0]?.id ?? null;
}

/**
 * resolveOrgId — повертає organizationId для запиту.
 * Якщо JWT не містить organizationId (наприклад, новий користувач без організації),
 * знаходить або автоматично створює організацію і прив'язує до акаунту.
 */
async function resolveOrgId(req: any): Promise<number> {
  if (req.user?.organizationId) return req.user.organizationId;

  const userId = req.user?.userId;
  if (!userId) throw new Error("Unauthorized: no userId");

  // 1. Спробуємо знайти organization_id в таблиці users
  const { rows: userRows } = await pool.query(
    `SELECT organization_id FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (userRows[0]?.organization_id) {
    req.user.organizationId = userRows[0].organization_id;
    return userRows[0].organization_id;
  }

  // 2. Якщо не знайдено — авто-створюємо організацію для цього юзера
  const email = req.user?.email ?? `user${userId}@maisonhd.com`;
  const orgName = email.split("@")[0] ?? "My Organization";

  const { rows: orgRows } = await pool.query(
    `INSERT INTO organizations (name, plan, is_active, created_at, updated_at)
     VALUES ($1, 'basic', true, NOW(), NOW())
     RETURNING id`,
    [orgName],
  );
  const newOrgId = orgRows[0].id;

  // 3. Прив'язуємо юзера до нової організації
  await pool.query(
    `UPDATE users SET organization_id = $1 WHERE id = $2`,
    [newOrgId, userId],
  );

  req.user.organizationId = newOrgId;
  return newOrgId;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART OF ACCOUNTS — план рахунків
// ═══════════════════════════════════════════════════════════════════════════

router.get("/accounts", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await seedChart(orgId);
  const { rows } = await pool.query(
    `SELECT a.*, p.code as parent_code
     FROM acc_accounts a
     LEFT JOIN acc_accounts p ON p.id=a.parent_id
     WHERE a.organization_id=$1 ORDER BY a.code`,
    [orgId],
  );
  res.json(rows);
});

router.post("/accounts", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { code, name, type, class: cls, parent_id, description } = req.body;
  if (!code || !name || !type) return res.status(400).json({ error: "code, name, type required" });
  const { rows } = await pool.query(
    `INSERT INTO acc_accounts (organization_id,code,name,type,class,parent_id,description)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, code, name, type, cls ?? null, parent_id ?? null, description ?? null],
  );
  res.json(rows[0]);
});

router.patch("/accounts/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { name, description, is_active } = req.body;
  const { rows } = await pool.query(
    `UPDATE acc_accounts SET
       name=COALESCE($1,name), description=COALESCE($2,description),
       is_active=COALESCE($3,is_active)
     WHERE id=$4 AND organization_id=$5 RETURNING *`,
    [name ?? null, description ?? null, is_active ?? null, req.params.id, orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.delete("/accounts/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows: used } = await pool.query(
    `SELECT COUNT(*) as cnt FROM acc_entries
     WHERE organization_id=$1 AND (debit_account_id=$2 OR credit_account_id=$2)`,
    [orgId, req.params.id],
  );
  if (parseInt(used[0].cnt) > 0)
    return res.status(400).json({ error: "Рахунок використовується в проводках" });
  await pool.query(
    `DELETE FROM acc_accounts WHERE id=$1 AND organization_id=$2 AND is_system=false`,
    [req.params.id, orgId],
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACTORS — контрагенти (власна таблиця, паралельна до counterparties)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/contractors", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { type, search, active } = req.query;
  let q = `SELECT * FROM acc_contractors WHERE organization_id=$1`;
  const p: any[] = [orgId];
  if (type) { p.push(type); q += ` AND (contractor_type=$${p.length} OR contractor_type='both')`; }
  if (search) { p.push(`%${search}%`); q += ` AND name ILIKE $${p.length}`; }
  if (active !== undefined) { p.push(active === "true"); q += ` AND is_active=$${p.length}`; }
  q += ` ORDER BY name`;
  const { rows } = await pool.query(q, p);
  res.json(rows);
});

router.post("/contractors", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { name, edrpou, ipn, vat_number, contractor_type, address, bank_name, bank_account, mfo, notes } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const { rows } = await pool.query(
    `INSERT INTO acc_contractors
       (organization_id,name,edrpou,ipn,vat_number,contractor_type,address,bank_name,bank_account,mfo,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [orgId, name, edrpou ?? null, ipn ?? null, vat_number ?? null,
     contractor_type ?? "both", address ?? null, bank_name ?? null,
     bank_account ?? null, mfo ?? null, notes ?? null],
  );
  res.json(rows[0]);
});

router.patch("/contractors/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const f = req.body;
  const cols = ["name","edrpou","ipn","vat_number","contractor_type","address","bank_name","bank_account","mfo","notes","is_active"];
  const sets: string[] = []; const p: any[] = [req.params.id, orgId];
  for (const c of cols) {
    if (f[c] !== undefined) { p.push(f[c]); sets.push(`${c}=$${p.length}`); }
  }
  if (!sets.length) return res.json({});
  const { rows } = await pool.query(
    `UPDATE acc_contractors SET ${sets.join(",")}, updated_at=NOW()
     WHERE id=$1 AND organization_id=$2 RETURNING *`, p,
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.delete("/contractors/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await pool.query(
    `UPDATE acc_contractors SET is_active=false WHERE id=$1 AND organization_id=$2`,
    [req.params.id, orgId],
  );
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// PERIODS — облікові періоди
// ═══════════════════════════════════════════════════════════════════════════

router.get("/periods", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows } = await pool.query(
    `SELECT * FROM acc_periods WHERE organization_id=$1 ORDER BY year DESC, month DESC`,
    [orgId],
  );
  res.json(rows);
});

router.post("/periods/:id/close", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows } = await pool.query(
    `UPDATE acc_periods SET status='closed', closed_at=NOW(), closed_by=$1
     WHERE id=$2 AND organization_id=$3 RETURNING *`,
    [req.user.userId, req.params.id, orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.post("/periods/:id/reopen", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows } = await pool.query(
    `UPDATE acc_periods SET status='open', closed_at=NULL, closed_by=NULL
     WHERE id=$1 AND organization_id=$2 RETURNING *`,
    [req.params.id, orgId],
  );
  res.json(rows[0] ?? { error: "Not found" });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — ACCOUNTING KERNEL STABILITY
// Закон України №996-XIV від 16.07.1999 «Про бухгалтерський облік»
// Наказ МФУ №88 від 24.05.1995 (Порядок виправлення помилок — тільки сторно)
// ═══════════════════════════════════════════════════════════════════════════

// Migration: audit log + reversal columns (idempotent — safe to call repeatedly)
async function ensureKernelTables() {
  await pool.query(`
    ALTER TABLE acc_entries
      ADD COLUMN IF NOT EXISTS is_reversal           BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS reversal_of_entry_id  INTEGER,
      ADD COLUMN IF NOT EXISTS reversed_by_entry_id  INTEGER
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_audit_log (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER      NOT NULL,
      action          TEXT         NOT NULL,
      entity_type     TEXT         NOT NULL,
      entity_id       INTEGER,
      user_id         INTEGER,
      user_name       TEXT,
      before_data     JSONB,
      after_data      JSONB,
      note            TEXT,
      created_at      TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS acc_audit_log_org_idx
      ON acc_audit_log(organization_id, created_at DESC)
  `);
}

// Append-only audit record (Ст.9 Закону №996-XIV)
async function logAudit(p: {
  organizationId: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  userId?: number | null;
  userName?: string | null;
  beforeData?: any;
  afterData?: any;
  note?: string | null;
}) {
  try {
    await ensureKernelTables();
    await pool.query(
      `INSERT INTO acc_audit_log
         (organization_id,action,entity_type,entity_id,user_id,user_name,before_data,after_data,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        p.organizationId, p.action, p.entityType, p.entityId ?? null,
        p.userId ?? null, p.userName ?? null,
        p.beforeData ? JSON.stringify(p.beforeData) : null,
        p.afterData  ? JSON.stringify(p.afterData)  : null,
        p.note ?? null,
      ],
    );
  } catch { /* audit failure must never break business logic */ }
}

// Period guard — Наказ МФУ №291: проведення у закритий період заборонено
async function assertPeriodOpen(orgId: number, dateVal: Date | string) {
  const d    = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  const year = d.getFullYear();
  const mo   = d.getMonth() + 1;
  const { rows } = await pool.query(
    `SELECT status FROM acc_periods WHERE organization_id=$1 AND year=$2 AND month=$3 LIMIT 1`,
    [orgId, year, mo],
  );
  if (rows[0]?.status === "closed") {
    const label = `${year}-${String(mo).padStart(2, "0")}`;
    throw Object.assign(
      new Error(`Період ${label} закрито. Проведення заборонено (Наказ МФУ №291). Відкрийте період або створіть сторно.`),
      { statusCode: 422 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS — первинні документи
// ═══════════════════════════════════════════════════════════════════════════

router.get("/documents", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { type, status, from, to, contractor_id, limit = 50, offset = 0 } = req.query;
  let q = `SELECT d.*, c.name as contractor_name
           FROM acc_documents d
           LEFT JOIN acc_contractors c ON c.id=d.contractor_id
           WHERE d.organization_id=$1`;
  const p: any[] = [orgId];
  if (type)          { p.push(type);          q += ` AND d.doc_type=$${p.length}`; }
  if (status)        { p.push(status);        q += ` AND d.status=$${p.length}`; }
  if (from)          { p.push(from);          q += ` AND d.doc_date>=$${p.length}`; }
  if (to)            { p.push(to);            q += ` AND d.doc_date<=$${p.length}`; }
  if (contractor_id) { p.push(contractor_id); q += ` AND d.contractor_id=$${p.length}`; }
  p.push(Number(limit), Number(offset));
  q += ` ORDER BY d.doc_date DESC, d.id DESC LIMIT $${p.length-1} OFFSET $${p.length}`;
  const { rows } = await pool.query(q, p);
  res.json(rows);
});

router.get("/documents/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows: docs } = await pool.query(
    `SELECT d.*, c.name as contractor_name, c.edrpou, c.vat_number, c.bank_account, c.mfo
     FROM acc_documents d LEFT JOIN acc_contractors c ON c.id=d.contractor_id
     WHERE d.id=$1 AND d.organization_id=$2`,
    [req.params.id, orgId],
  );
  if (!docs[0]) return res.status(404).json({ error: "Not found" });
  const { rows: items } = await pool.query(
    `SELECT i.*, a.code as account_code, a.name as account_name
     FROM acc_document_items i LEFT JOIN acc_accounts a ON a.id=i.account_id
     WHERE i.document_id=$1 ORDER BY i.sort_order`, [req.params.id],
  );
  const { rows: entries } = await pool.query(
    `SELECT e.*, da.code as debit_code, da.name as debit_name,
             ca.code as credit_code, ca.name as credit_name
     FROM acc_entries e
     JOIN acc_accounts da ON da.id=e.debit_account_id
     JOIN acc_accounts ca ON ca.id=e.credit_account_id
     WHERE e.document_id=$1`, [req.params.id],
  );
  res.json({ ...docs[0], items, entries });
});

router.post("/documents", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const userId = req.user.userId;
  const { doc_type, doc_number, doc_date, contractor_id, description,
          currency = "UAH", vat_rate = 20, items = [], linked_doc_id } = req.body;
  if (!doc_type || !doc_number || !doc_date)
    return res.status(400).json({ error: "doc_type, doc_number, doc_date required" });

  // Calculate totals from items (quantity * unit_price)
  let subtotal = 0;
  let tax_amount = 0;
  const processedItems = items.map((it: any) => {
    const amt = parseFloat(it.amount ?? 0) || (parseFloat(it.quantity ?? 1) * parseFloat(it.unit_price ?? 0));
    const rate = parseFloat(String(it.tax_rate ?? vat_rate));
    const tax = parseFloat(it.tax_amount ?? 0) || (amt * rate / 100);
    subtotal += amt;
    tax_amount += tax;
    return { ...it, _amt: amt, _tax: tax, _rate: rate };
  });
  const total = subtotal + tax_amount;
  const periodId = await ensurePeriod(orgId, new Date(doc_date));

  const { rows: docs } = await pool.query(
    `INSERT INTO acc_documents
       (organization_id,doc_type,doc_number,doc_date,contractor_id,period_id,
        description,currency,subtotal,tax_amount,total,vat_rate,linked_doc_id,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [orgId, doc_type, doc_number, doc_date, contractor_id ?? null, periodId,
     description ?? null, currency, subtotal, tax_amount, total, vat_rate,
     linked_doc_id ?? null, userId],
  );
  const doc = docs[0];

  for (let i = 0; i < processedItems.length; i++) {
    const it = processedItems[i];
    await pool.query(
      `INSERT INTO acc_document_items
         (document_id,sort_order,description,unit,quantity,unit_price,amount,tax_rate,tax_amount,account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [doc.id, i, it.description, it.unit ?? "шт", it.quantity ?? 1,
       it.unit_price ?? 0, it._amt, it._rate, it._tax, it.account_id ?? null],
    );
  }
  res.status(201).json(doc);
});

router.patch("/documents/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows: chk } = await pool.query(
    `SELECT status FROM acc_documents WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId],
  );
  if (!chk[0]) return res.status(404).json({ error: "Not found" });
  if (chk[0].status === "posted") return res.status(400).json({ error: "Проведений документ не можна редагувати" });

  const { doc_number, doc_date, contractor_id, description, items } = req.body;
  await pool.query(
    `UPDATE acc_documents SET
       doc_number=COALESCE($1,doc_number), doc_date=COALESCE($2,doc_date),
       contractor_id=COALESCE($3,contractor_id), description=COALESCE($4,description),
       updated_at=NOW()
     WHERE id=$5 AND organization_id=$6`,
    [doc_number ?? null, doc_date ?? null, contractor_id ?? null, description ?? null, req.params.id, orgId],
  );

  if (items) {
    await pool.query(`DELETE FROM acc_document_items WHERE document_id=$1`, [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const amt = parseFloat(it.quantity ?? 1) * parseFloat(it.unit_price ?? 0);
      const tax = amt * parseFloat(it.tax_rate ?? 20) / 100;
      await pool.query(
        `INSERT INTO acc_document_items
           (document_id,sort_order,description,unit,quantity,unit_price,amount,tax_rate,tax_amount,account_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.params.id, i, it.description, it.unit ?? "шт", it.quantity ?? 1,
         it.unit_price, amt, it.tax_rate ?? 20, tax, it.account_id ?? null],
      );
    }
    const { rows: its } = await pool.query(
      `SELECT SUM(amount) as sub, SUM(tax_amount) as tax FROM acc_document_items WHERE document_id=$1`,
      [req.params.id],
    );
    const sub = parseFloat(its[0].sub ?? 0);
    const tax = parseFloat(its[0].tax ?? 0);
    await pool.query(
      `UPDATE acc_documents SET subtotal=$1, tax_amount=$2, total=$3 WHERE id=$4`,
      [sub, tax, sub + tax, req.params.id],
    );
  }
  const { rows } = await pool.query(`SELECT * FROM acc_documents WHERE id=$1`, [req.params.id]);
  res.json(rows[0]);
});

// Провести документ — автоматично створює проводки
router.post("/documents/:id/post", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const userId = req.user.userId;

  const { rows: docs } = await pool.query(
    `SELECT * FROM acc_documents WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId],
  );
  if (!docs[0]) return res.status(404).json({ error: "Not found" });
  const doc = docs[0];
  if (doc.status === "posted") return res.status(400).json({ error: "Вже проведено" });
  if (doc.status === "cancelled") return res.status(400).json({ error: "Скасовано" });

  try { await assertPeriodOpen(orgId, doc.doc_date); } catch (e: any) {
    return res.status(e.statusCode ?? 422).json({ error: e.message });
  }

  await seedChart(orgId);
  const rules = POSTING_RULES[doc.doc_type] ?? [];

  for (const rule of rules) {
    const amount =
      rule.basis === "tax"      ? parseFloat(doc.tax_amount) :
      rule.basis === "subtotal" ? parseFloat(doc.subtotal) :
                                  parseFloat(doc.total);
    if (!amount || amount === 0) continue;
    const debitId  = await getAccId(orgId, rule.debit);
    const creditId = await getAccId(orgId, rule.credit);
    if (!debitId || !creditId) continue;

    await pool.query(
      `INSERT INTO acc_entries
         (organization_id,document_id,entry_date,period_id,
          debit_account_id,credit_account_id,amount,currency,description,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [orgId, doc.id, doc.doc_date, doc.period_id,
       debitId, creditId, amount, doc.currency,
       `${doc.doc_type.toUpperCase()} №${doc.doc_number}`, userId],
    );
  }

  // ПДВ-реєстр
  if (["invoice_out","act_out"].includes(doc.doc_type) && parseFloat(doc.tax_amount) > 0) {
    await pool.query(
      `INSERT INTO acc_vat_records
         (organization_id,document_id,record_type,record_date,contractor_id,amount_excl_vat,vat_amount,vat_rate,period_id)
       VALUES ($1,$2,'issued',$3,$4,$5,$6,$7,$8)`,
      [orgId, doc.id, doc.doc_date, doc.contractor_id, doc.subtotal, doc.tax_amount, doc.vat_rate, doc.period_id],
    );
  }
  if (["invoice_in","act_in"].includes(doc.doc_type) && parseFloat(doc.tax_amount) > 0) {
    await pool.query(
      `INSERT INTO acc_vat_records
         (organization_id,document_id,record_type,record_date,contractor_id,amount_excl_vat,vat_amount,vat_rate,period_id)
       VALUES ($1,$2,'received',$3,$4,$5,$6,$7,$8)`,
      [orgId, doc.id, doc.doc_date, doc.contractor_id, doc.subtotal, doc.tax_amount, doc.vat_rate, doc.period_id],
    );
  }

  const { rows } = await pool.query(
    `UPDATE acc_documents SET status='posted', posted_at=NOW(), posted_by=$1 WHERE id=$2 RETURNING *`,
    [userId, doc.id],
  );
  await logAudit({
    organizationId: orgId, action: "document_posted", entityType: "document",
    entityId: doc.id, userId,
    afterData: { doc_type: doc.doc_type, doc_number: doc.doc_number, total: doc.total },
    note: `Проведено ${doc.doc_type.toUpperCase()} №${doc.doc_number}`,
  });
  res.json(rows[0]);
});

router.post("/documents/:id/cancel", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows } = await pool.query(
    `UPDATE acc_documents SET status='cancelled', updated_at=NOW()
     WHERE id=$1 AND organization_id=$2 AND status='draft' RETURNING *`,
    [req.params.id, orgId],
  );
  if (!rows[0]) return res.status(400).json({ error: "Можна скасувати лише чернетку" });
  res.json(rows[0]);
});

router.delete("/documents/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows } = await pool.query(
    `SELECT status FROM acc_documents WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (rows[0].status === "posted") return res.status(400).json({ error: "Не можна видалити проведений документ" });
  await pool.query(`DELETE FROM acc_documents WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL ENTRIES — журнал проводок
// ═══════════════════════════════════════════════════════════════════════════

router.get("/entries", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { from, to, account_code, limit = 100, offset = 0 } = req.query;
  let q = `SELECT e.*,
             da.code as debit_code,  da.name as debit_name,
             ca.code as credit_code, ca.name as credit_name,
             d.doc_type, d.doc_number
           FROM acc_entries e
           JOIN acc_accounts da ON da.id=e.debit_account_id
           JOIN acc_accounts ca ON ca.id=e.credit_account_id
           LEFT JOIN acc_documents d ON d.id=e.document_id
           WHERE e.organization_id=$1`;
  const p: any[] = [orgId];
  if (from)         { p.push(from);         q += ` AND e.entry_date>=$${p.length}`; }
  if (to)           { p.push(to);           q += ` AND e.entry_date<=$${p.length}`; }
  if (account_code) { p.push(`${account_code}%`); q += ` AND (da.code LIKE $${p.length} OR ca.code LIKE $${p.length})`; }
  p.push(Number(limit), Number(offset));
  q += ` ORDER BY e.entry_date DESC, e.id DESC LIMIT $${p.length-1} OFFSET $${p.length}`;
  const { rows } = await pool.query(q, p);
  res.json(rows);
});

router.post("/entries", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const userId = req.user.userId;
  const { entry_date, debit_account_id, credit_account_id, amount, description, currency = "UAH" } = req.body;
  if (!entry_date || !debit_account_id || !credit_account_id || !amount)
    return res.status(400).json({ error: "entry_date, debit_account_id, credit_account_id, amount required" });
  try { await assertPeriodOpen(orgId, entry_date); } catch (e: any) {
    return res.status(e.statusCode ?? 422).json({ error: e.message });
  }
  const periodId = await ensurePeriod(orgId, new Date(entry_date));
  const { rows } = await pool.query(
    `INSERT INTO acc_entries
       (organization_id,entry_date,period_id,debit_account_id,credit_account_id,
        amount,currency,description,is_manual,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
    [orgId, entry_date, periodId, debit_account_id, credit_account_id, amount, currency, description ?? null, userId],
  );
  await logAudit({
    organizationId: orgId, action: "entry_created", entityType: "entry",
    entityId: rows[0].id, userId, afterData: rows[0],
    note: `Ручна проводка Дт${debit_account_id} Кт${credit_account_id} ${amount}`,
  });
  res.status(201).json(rows[0]);
});

// DELETE /entries/:id — ЗАБОРОНЕНО (Наказ МФУ №88, п.4.4)
// Виправлення помилок здійснюється виключно методом «червоного сторна»
// Використовуйте POST /entries/:id/reverse
router.delete("/entries/:id", (_req, res) => {
  res.status(405).json({
    error: "Видалення проводок заборонено законодавством України (Наказ МФУ №88, п.4.4). " +
           "Використайте метод сторнування: POST /api/acc/entries/:id/reverse",
    hint: "storno",
  });
});

// POST /entries/:id/reverse — Сторнування (червоне сторно, Наказ МФУ №88 п.4.4)
// Створює дзеркальну від'ємну проводку; оригінал позначається як reversed
router.post("/entries/:id/reverse", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const userId = req.user.userId;
  const { reason, reversal_date } = req.body;

  await ensureKernelTables();

  const { rows: orig } = await pool.query(
    `SELECT e.*,
       da.code as debit_code, da.name as debit_name,
       ca.code as credit_code, ca.name as credit_name
     FROM acc_entries e
     JOIN acc_accounts da ON da.id=e.debit_account_id
     JOIN acc_accounts ca ON ca.id=e.credit_account_id
     WHERE e.id=$1 AND e.organization_id=$2`,
    [req.params.id, orgId],
  );
  if (!orig[0]) return res.status(404).json({ error: "Проводку не знайдено" });

  const entry = orig[0];

  if (entry.reversed_by_entry_id)
    return res.status(400).json({ error: "Цю проводку вже сторновано" });

  if (entry.is_reversal)
    return res.status(400).json({ error: "Не можна сторнувати сторно-проводку" });

  const revDate = reversal_date ?? entry.entry_date;
  try { await assertPeriodOpen(orgId, revDate); } catch (e: any) {
    return res.status(e.statusCode ?? 422).json({ error: e.message });
  }

  const periodId = await ensurePeriod(orgId, new Date(revDate));

  // Сторно: дебет↔кредит міняються місцями (метод «червоного сторна»)
  const stornDesc = `[СТОРНО №${entry.id}] ${entry.description ?? ""}${reason ? ` — ${reason}` : ""}`;
  const { rows: rev } = await pool.query(
    `INSERT INTO acc_entries
       (organization_id,entry_date,period_id,
        debit_account_id,credit_account_id,
        amount,currency,description,
        is_manual,is_reversal,reversal_of_entry_id,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true,$9,$10) RETURNING *`,
    [orgId, revDate, periodId,
     entry.credit_account_id, entry.debit_account_id,
     entry.amount, entry.currency, stornDesc,
     entry.id, userId],
  );

  // Позначаємо оригінал як сторнований
  await pool.query(
    `UPDATE acc_entries SET reversed_by_entry_id=$1 WHERE id=$2`,
    [rev[0].id, entry.id],
  );

  await logAudit({
    organizationId: orgId,
    action: "entry_reversed",
    entityType: "entry",
    entityId: entry.id,
    userId,
    beforeData: { id: entry.id, debit: entry.debit_code, credit: entry.credit_code, amount: entry.amount },
    afterData:  { reversal_id: rev[0].id, reversal_date: revDate, reason: reason ?? null },
    note: `Сторно проводки #${entry.id}: ${entry.debit_code}→${entry.credit_code} ${entry.amount}`,
  });

  res.status(201).json({
    reversal: rev[0],
    original_id: entry.id,
    message: `Сторно-проводку №${rev[0].id} створено. Оригінал №${entry.id} позначено як сторнований.`,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VAT REGISTER — реєстр ПДВ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/vat", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { year, month, type } = req.query;
  let q = `SELECT v.*, c.name as contractor_name, d.doc_number
           FROM acc_vat_records v
           LEFT JOIN acc_contractors c ON c.id=v.contractor_id
           LEFT JOIN acc_documents d ON d.id=v.document_id
           WHERE v.organization_id=$1`;
  const p: any[] = [orgId];
  if (year)  { p.push(year);  q += ` AND EXTRACT(YEAR FROM v.record_date)=$${p.length}`; }
  if (month) { p.push(month); q += ` AND EXTRACT(MONTH FROM v.record_date)=$${p.length}`; }
  if (type)  { p.push(type);  q += ` AND v.record_type=$${p.length}`; }
  q += ` ORDER BY v.record_date DESC`;
  const { rows } = await pool.query(q, p);
  res.json(rows);
});

// Додаток Д5 — розшифровка кредиту по контрагентах (BEFORE /declaration to avoid routing conflict)
router.get("/vat/declaration/d5", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { year, month } = req.query;
  const { rows } = await pool.query(`
    SELECT
      COALESCE(c.name,'(без контрагента)') as contractor_name,
      c.ipn, c.vat_number, c.edrpou,
      COALESCE(SUM(v.amount_excl_vat), 0) as base,
      COALESCE(SUM(v.vat_amount), 0) as vat,
      COUNT(*) as records_count
    FROM acc_vat_records v
    LEFT JOIN acc_contractors c ON c.id=v.contractor_id
    WHERE v.organization_id=$1 AND v.record_type='received'
      AND ($2::int IS NULL OR EXTRACT(YEAR  FROM v.record_date)=$2)
      AND ($3::int IS NULL OR EXTRACT(MONTH FROM v.record_date)=$3)
    GROUP BY c.id, c.name, c.ipn, c.vat_number, c.edrpou
    ORDER BY SUM(v.vat_amount) DESC
  `, [orgId, year ?? null, month ?? null]);
  const total = rows.reduce((s: any, r: any) => ({
    base: s.base + parseFloat(r.base), vat: s.vat + parseFloat(r.vat),
  }), { base: 0, vat: 0 });
  res.json({ year, month, rows, total });
});

// Повна декларація з ПДВ (всі рядки форми 0110)
router.get("/vat/declaration", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { year, month } = req.query;

  // Get issued/received by vat_rate
  const { rows: byRate } = await pool.query(`
    SELECT record_type, vat_rate,
      COALESCE(SUM(amount_excl_vat),0) as base,
      COALESCE(SUM(vat_amount),0)      as vat
    FROM acc_vat_records
    WHERE organization_id=$1
      AND ($2::int IS NULL OR EXTRACT(YEAR  FROM record_date)=$2)
      AND ($3::int IS NULL OR EXTRACT(MONTH FROM record_date)=$3)
    GROUP BY record_type, vat_rate
  `, [orgId, year ?? null, month ?? null]);

  const get = (type: string, rate: number, field: "base"|"vat") => {
    const r = byRate.find((x: any) => x.record_type === type && Number(x.vat_rate) === rate);
    return parseFloat(r?.[field] ?? 0) || 0;
  };
  const getAny = (type: string, field: "base"|"vat") =>
    byRate.filter((x: any) => x.record_type === type).reduce((s: number, r: any) => s + parseFloat(r[field]), 0);

  // Section A — податкові зобов'язання
  const r1_1_base = get("issued", 20, "base");   // Р1.1 — 20%
  const r1_1_vat  = get("issued", 20, "vat");
  const r1_2_base = get("issued",  7, "base");   // Р1.2 — 7%
  const r1_2_vat  = get("issued",  7, "vat");
  const r3_1_base = get("issued",  0, "base");   // Р3.1 — 0% (export/zero-rated)
  const r4_1_base = getAny("exempt", "base");    // Р4.1 — звільнені
  const r6_vat    = r1_1_vat + r1_2_vat;        // Р6 — разом ПЗ

  // Section B — податковий кредит
  const r10_1_base = get("received", 20, "base"); // Р10.1 — 20%
  const r10_1_vat  = get("received", 20, "vat");
  const r10_2_base = get("received",  7, "base"); // Р10.2 — 7%
  const r10_2_vat  = get("received",  7, "vat");
  const r12_credit = r10_1_vat + r10_2_vat;       // Р12 — разом кредит
  const r17_credit = r12_credit;                   // Р17 = Р12 (без коригувань)

  // Section C — розрахунки з бюджетом
  const r18_to_pay  = Math.max(0, r6_vat - r17_credit);
  const r19_negative = Math.max(0, r17_credit - r6_vat);

  res.json({
    year, month,
    // Backward compat
    tax_liability:  r6_vat,
    tax_credit:     r17_credit,
    vat_to_pay:     r18_to_pay,
    vat_refund:     r19_negative,
    issued_base:    r1_1_base + r1_2_base,
    received_base:  r10_1_base + r10_2_base,
    // Full declaration rows
    section_a: {
      r1_1: { base: r1_1_base, vat: r1_1_vat, label: "Ряд 1.1 — операції 20%" },
      r1_2: { base: r1_2_base, vat: r1_2_vat, label: "Ряд 1.2 — операції 7%" },
      r3_1: { base: r3_1_base, vat: 0, label: "Ряд 3.1 — 0% (експорт)" },
      r4_1: { base: r4_1_base, vat: 0, label: "Ряд 4.1 — звільнені операції" },
      r6:   { vat: r6_vat, label: "Ряд 6 — разом зобов'язання" },
    },
    section_b: {
      r10_1: { base: r10_1_base, vat: r10_1_vat, label: "Ряд 10.1 — кредит 20%" },
      r10_2: { base: r10_2_base, vat: r10_2_vat, label: "Ряд 10.2 — кредит 7%" },
      r12:   { vat: r12_credit, label: "Ряд 12 — разом кредит" },
      r17:   { vat: r17_credit, label: "Ряд 17 — загальна сума кредиту" },
    },
    section_c: {
      r18: { vat: r18_to_pay,   label: "Ряд 18 — до сплати (позитивне значення)" },
      r19: { vat: r19_negative, label: "Ряд 19 — від'ємне значення" },
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MONTH-END CLOSING — закриття місяця
// ═══════════════════════════════════════════════════════════════════════════

router.get("/month-close/preview", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: "year and month required" });
  await seedChart(orgId);
  const yr = Number(year), mo = Number(month);
  const prefix = `[ЗАКРИТТЯ ${yr}-${String(mo).padStart(2, "0")}]`;

  const { rows: income } = await pool.query(`
    SELECT a.id, a.code, a.name,
      COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) as net
    FROM acc_accounts a
    LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
      AND e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
      AND EXTRACT(MONTH FROM e.entry_date)=$3 AND e.description NOT LIKE $4
    WHERE a.organization_id=$1 AND a.class=7
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) -
              COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0)) > 0.001
    ORDER BY a.code
  `, [orgId, yr, mo, `${prefix}%`]);

  const { rows: expenses } = await pool.query(`
    SELECT a.id, a.code, a.name,
      COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) as net
    FROM acc_accounts a
    LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
      AND e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
      AND EXTRACT(MONTH FROM e.entry_date)=$3 AND e.description NOT LIKE $4
    WHERE a.organization_id=$1 AND a.class=9 AND a.code NOT LIKE '99%'
    GROUP BY a.id, a.code, a.name
    HAVING ABS(COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) -
              COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0)) > 0.001
    ORDER BY a.code
  `, [orgId, yr, mo, `${prefix}%`]);

  const totalIncome   = income.reduce((s: number, r: any) => s + parseFloat(r.net), 0);
  const totalExpenses = expenses.reduce((s: number, r: any) => s + parseFloat(r.net), 0);
  const netResult     = totalIncome - totalExpenses;

  const entries: any[] = [
    ...income.filter((r: any) => parseFloat(r.net) > 0).map((r: any) => ({
      debit: r.code, credit: "791", amount: parseFloat(r.net),
      description: `${prefix} ${r.code}→791`,
    })),
    ...expenses.filter((r: any) => parseFloat(r.net) > 0).map((r: any) => ({
      debit: "791", credit: r.code, amount: parseFloat(r.net),
      description: `${prefix} 791→${r.code}`,
    })),
    ...(netResult > 0.001  ? [{ debit: "791", credit: "441", amount: netResult,         description: `${prefix} Прибуток 791→441` }] : []),
    ...(netResult < -0.001 ? [{ debit: "442", credit: "791", amount: Math.abs(netResult), description: `${prefix} Збиток 442→791` }] : []),
  ];

  const { rows: periods } = await pool.query(
    `SELECT status FROM acc_periods WHERE organization_id=$1 AND year=$2 AND month=$3`, [orgId, yr, mo],
  );
  res.json({ year: yr, month: mo, income, expenses, totalIncome, totalExpenses, netResult, entries, isClosed: periods[0]?.status === "closed" });
});

router.post("/month-close/execute", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const userId = req.user.userId;
  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: "year and month required" });
  await seedChart(orgId);
  const yr = Number(year), mo = Number(month);
  const prefix = `[ЗАКРИТТЯ ${yr}-${String(mo).padStart(2, "0")}]`;
  const lastDay = new Date(yr, mo, 0);
  const lastDayStr = lastDay.toISOString().slice(0, 10);
  const periodId = await ensurePeriod(orgId, lastDay);

  const { rows: alreadyDone } = await pool.query(
    `SELECT id FROM acc_entries WHERE organization_id=$1 AND description LIKE $2
     AND EXTRACT(YEAR FROM entry_date)=$3 AND EXTRACT(MONTH FROM entry_date)=$4 LIMIT 1`,
    [orgId, `${prefix}%`, yr, mo],
  );
  if (alreadyDone[0]) return res.status(400).json({ error: "Місяць вже закрито. Спочатку скасуйте закриття." });

  const [id791, id441, id442] = await Promise.all([getAccId(orgId, "791"), getAccId(orgId, "441"), getAccId(orgId, "442")]);
  if (!id791 || !id441 || !id442) return res.status(500).json({ error: "Рахунки 791/441/442 не знайдено в плані рахунків" });

  const { rows: income } = await pool.query(`
    SELECT a.id,
      COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) as net,
      a.code
    FROM acc_accounts a
    LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
      AND e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
      AND EXTRACT(MONTH FROM e.entry_date)=$3 AND e.description NOT LIKE $4
    WHERE a.organization_id=$1 AND a.class=7
    GROUP BY a.id, a.code
    HAVING COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) -
           COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) > 0.001
  `, [orgId, yr, mo, `${prefix}%`]);

  const { rows: expenses } = await pool.query(`
    SELECT a.id,
      COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) as net,
      a.code
    FROM acc_accounts a
    LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
      AND e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
      AND EXTRACT(MONTH FROM e.entry_date)=$3 AND e.description NOT LIKE $4
    WHERE a.organization_id=$1 AND a.class=9 AND a.code NOT LIKE '99%'
    GROUP BY a.id, a.code
    HAVING COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) -
           COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) > 0.001
  `, [orgId, yr, mo, `${prefix}%`]);

  const ins = async (dId: number, cId: number, amt: number, desc: string) => {
    await pool.query(
      `INSERT INTO acc_entries (organization_id,document_id,entry_date,period_id,debit_account_id,credit_account_id,amount,currency,description,is_manual,created_by)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,'UAH',$7,false,$8)`,
      [orgId, lastDayStr, periodId, dId, cId, amt, desc, userId],
    );
  };

  for (const r of income)   await ins(r.id, id791, parseFloat(r.net), `${prefix} ${r.code}→791`);
  for (const r of expenses) await ins(id791, r.id, parseFloat(r.net), `${prefix} 791→${r.code}`);

  const totalIncome   = income.reduce((s: number, r: any) => s + parseFloat(r.net), 0);
  const totalExpenses = expenses.reduce((s: number, r: any) => s + parseFloat(r.net), 0);
  const net = totalIncome - totalExpenses;
  if (net > 0.001)  await ins(id791, id441, net,             `${prefix} Прибуток 791→441`);
  if (net < -0.001) await ins(id442, id791, Math.abs(net),   `${prefix} Збиток 442→791`);

  await pool.query(
    `UPDATE acc_periods SET status='closed', closed_at=NOW(), closed_by=$1 WHERE organization_id=$2 AND year=$3 AND month=$4`,
    [userId, orgId, yr, mo],
  );
  res.json({ ok: true, entriesCreated: income.length + expenses.length + (Math.abs(net) > 0.001 ? 1 : 0), netResult: net, totalIncome, totalExpenses });
});

router.post("/month-close/undo", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: "year and month required" });
  const yr = Number(year), mo = Number(month);
  const prefix = `[ЗАКРИТТЯ ${yr}-${String(mo).padStart(2, "0")}]`;
  const { rowCount } = await pool.query(
    `DELETE FROM acc_entries WHERE organization_id=$1 AND description LIKE $2
     AND EXTRACT(YEAR FROM entry_date)=$3 AND EXTRACT(MONTH FROM entry_date)=$4`,
    [orgId, `${prefix}%`, yr, mo],
  );
  await pool.query(
    `UPDATE acc_periods SET status='open', closed_at=NULL, closed_by=NULL WHERE organization_id=$1 AND year=$2 AND month=$3`,
    [orgId, yr, mo],
  );
  res.json({ ok: true, deleted: rowCount });
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS — звіти
// ═══════════════════════════════════════════════════════════════════════════

// ОСВ — Оборотно-сальдова відомість
// ОСВ — Оборотно-сальдова відомість з вхідним сальдо
router.get("/reports/trial-balance", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  let { from, to, year, month } = req.query as Record<string, string>;
  await seedChart(orgId);
  // Support year/month OR from/to
  if (!from && year && month) {
    const y = parseInt(year), m = parseInt(month);
    from = `${y}-${String(m).padStart(2,"0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    to   = `${y}-${String(m).padStart(2,"0")}-${lastDay}`;
  }
  const fromDate = from ? from : null;
  const toDate   = to   ? to   : null;

  const { rows } = await pool.query(
    `WITH
     opening AS (
       SELECT account_id, SUM(d) as d, SUM(c) as c FROM (
         SELECT debit_account_id  AS account_id, SUM(amount) AS d, 0::numeric AS c
           FROM acc_entries WHERE organization_id=$1
             AND ($2::date IS NULL OR entry_date < $2::date)
           GROUP BY debit_account_id
         UNION ALL
         SELECT credit_account_id AS account_id, 0::numeric AS d, SUM(amount) AS c
           FROM acc_entries WHERE organization_id=$1
             AND ($2::date IS NULL OR entry_date < $2::date)
           GROUP BY credit_account_id
       ) s GROUP BY account_id
     ),
     period AS (
       SELECT account_id, SUM(d) as d, SUM(c) as c FROM (
         SELECT debit_account_id  AS account_id, SUM(amount) AS d, 0::numeric AS c
           FROM acc_entries WHERE organization_id=$1
             AND ($2::date IS NULL OR entry_date >= $2::date)
             AND ($3::date IS NULL OR entry_date <= $3::date)
           GROUP BY debit_account_id
         UNION ALL
         SELECT credit_account_id AS account_id, 0::numeric AS d, SUM(amount) AS c
           FROM acc_entries WHERE organization_id=$1
             AND ($2::date IS NULL OR entry_date >= $2::date)
             AND ($3::date IS NULL OR entry_date <= $3::date)
           GROUP BY credit_account_id
       ) s GROUP BY account_id
     )
     SELECT a.code, a.name, a.type, a.class,
       COALESCE(o.d,0)-COALESCE(o.c,0)                                          AS opening_balance,
       COALESCE(p.d,0)                                                           AS debit_turn,
       COALESCE(p.c,0)                                                           AS credit_turn,
       (COALESCE(o.d,0)-COALESCE(o.c,0)) + COALESCE(p.d,0) - COALESCE(p.c,0)  AS closing_balance
     FROM acc_accounts a
     LEFT JOIN opening o ON o.account_id = a.id
     LEFT JOIN period  p ON p.account_id = a.id
     WHERE a.organization_id=$1
       AND (o.d IS NOT NULL OR o.c IS NOT NULL OR p.d IS NOT NULL OR p.c IS NOT NULL)
     ORDER BY a.code`,
    [orgId, fromDate, toDate],
  );
  res.json({ rows, from: fromDate, to: toDate });
});

// Звіт про фінансові результати (НП(С)БО 1, Форма 2)
router.get("/reports/profit-loss", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { year, month, from, to } = req.query as Record<string, string>;

  // Build date conditions
  let dateWhere = "";
  const params: any[] = [orgId];
  if (year && month) {
    params.push(parseInt(year), parseInt(month));
    dateWhere = `AND EXTRACT(YEAR FROM e.entry_date)=$${params.length-1} AND EXTRACT(MONTH FROM e.entry_date)=$${params.length}`;
  } else if (from && to) {
    params.push(from, to);
    dateWhere = `AND e.entry_date>=$${params.length-1} AND e.entry_date<=$${params.length}`;
  }

  // Helper: net credit-side amount for given account code prefixes (income)
  const netCredit = async (codes: string[]): Promise<number> => {
    const likes = codes.map((c, i) => `a.code LIKE $${params.length + i + 1}`).join(" OR ");
    const q = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END)
                      -SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) as net
       FROM acc_accounts a
       LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
         AND e.organization_id=$1 ${dateWhere}
       WHERE a.organization_id=$1 AND (${likes})`,
      [...params, ...codes.map(c => c + "%")],
    );
    return parseFloat(q.rows[0]?.net ?? 0);
  };
  const netDebit = async (codes: string[]): Promise<number> => {
    const likes = codes.map((c, i) => `a.code LIKE $${params.length + i + 1}`).join(" OR ");
    const q = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END)
                      -SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) as net
       FROM acc_accounts a
       LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
         AND e.organization_id=$1 ${dateWhere}
       WHERE a.organization_id=$1 AND (${likes})`,
      [...params, ...codes.map(c => c + "%")],
    );
    return parseFloat(q.rows[0]?.net ?? 0);
  };

  const [r2000, r2050, r2120, r2130, r2150, r2160, r2200, r2220, r2250, r2270, r2280, r2300] = await Promise.all([
    netCredit(["701","702","703"]),   // Р2000 чистий дохід від реалізації
    netDebit(["901","902","903"]),    // Р2050 собівартість
    netCredit(["71"]),               // Р2120 інші операційні доходи
    netDebit(["92"]),                // Р2130 адмінвитрати
    netDebit(["93"]),                // Р2150 витрати на збут
    netDebit(["94"]),                // Р2160 інші операційні витрати
    netCredit(["72"]),               // Р2200 дохід від участі в капіталі
    netCredit(["73"]),               // Р2220 інші фінансові доходи
    netCredit(["74"]),               // Р2250 інші доходи
    netDebit(["95"]),                // Р2270 фінансові витрати
    netDebit(["97"]),                // Р2280 інші витрати
    netDebit(["98"]),                // Р2300 податок на прибуток
  ]);

  const r2090 = r2000 - r2050;                         // валовий прибуток/збиток
  const r2190 = r2090 + r2120 - r2130 - r2150 - r2160; // фін результат операційної
  const r2290 = r2190 + r2200 + r2220 + r2250 - r2270 - r2280; // прибуток до оподаткування
  const r2350 = r2290 - r2300;                          // чистий прибуток

  const rows = [
    { code: "2000", label: "Чистий дохід від реалізації продукції",      value: r2000,  section: "A" },
    { code: "2050", label: "Собівартість реалізованої продукції",         value: -r2050, section: "A" },
    { code: "2090", label: "Валовий прибуток (збиток)",                   value: r2090,  section: "A", bold: true },
    { code: "2120", label: "Інші операційні доходи",                      value: r2120,  section: "B" },
    { code: "2130", label: "Адміністративні витрати",                     value: -r2130, section: "B" },
    { code: "2150", label: "Витрати на збут",                             value: -r2150, section: "B" },
    { code: "2160", label: "Інші операційні витрати",                     value: -r2160, section: "B" },
    { code: "2190", label: "Фінансовий результат від операційної діяльності", value: r2190, section: "B", bold: true },
    { code: "2200", label: "Дохід від участі в капіталі",                 value: r2200,  section: "C" },
    { code: "2220", label: "Інші фінансові доходи",                       value: r2220,  section: "C" },
    { code: "2250", label: "Інші доходи",                                 value: r2250,  section: "C" },
    { code: "2270", label: "Фінансові витрати",                           value: -r2270, section: "C" },
    { code: "2280", label: "Інші витрати",                                value: -r2280, section: "C" },
    { code: "2290", label: "Фінансовий результат до оподаткування",       value: r2290,  section: "C", bold: true },
    { code: "2300", label: "Витрати (дохід) з податку на прибуток",       value: -r2300, section: "D" },
    { code: "2350", label: "Чистий фінансовий результат",                 value: r2350,  section: "D", bold: true, final: true },
  ];

  res.json({ rows, period: { year, month, from, to }, netProfit: r2350 });
});

// Баланс (Форма 1, НП(С)БО 1)
router.get("/reports/balance-sheet", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { date } = req.query;
  const { rows } = await pool.query(
    `WITH bal AS (
       SELECT debit_account_id  as acc, SUM(amount) as d, 0::numeric as c
       FROM acc_entries WHERE organization_id=$1 AND ($2::date IS NULL OR entry_date<=$2::date)
       GROUP BY debit_account_id
       UNION ALL
       SELECT credit_account_id as acc, 0::numeric    as d, SUM(amount) as c
       FROM acc_entries WHERE organization_id=$1 AND ($2::date IS NULL OR entry_date<=$2::date)
       GROUP BY credit_account_id
     ),
     tot AS (SELECT acc, SUM(d) as d, SUM(c) as c FROM bal GROUP BY acc)
     SELECT a.code, a.name, a.type, a.class,
       COALESCE(t.d,0)-COALESCE(t.c,0) as balance
     FROM acc_accounts a LEFT JOIN tot t ON t.acc=a.id
     WHERE a.organization_id=$1 AND a.type IN ('asset','liability','equity')
       AND (COALESCE(t.d,0)-COALESCE(t.c,0)) != 0
     ORDER BY a.code`,
    [orgId, date ?? null],
  );
  const assets      = rows.filter((r: any) => r.type === "asset");
  const liabilities = rows.filter((r: any) => r.type === "liability");
  const equity      = rows.filter((r: any) => r.type === "equity");
  res.json({
    assets, liabilities, equity,
    totalAssets:      assets.reduce((s: number, r: any)      => s + parseFloat(r.balance), 0),
    totalLiabilities: liabilities.reduce((s: number, r: any) => s + Math.abs(parseFloat(r.balance)), 0),
    totalEquity:      equity.reduce((s: number, r: any)      => s + Math.abs(parseFloat(r.balance)), 0),
  });
});

// ─── НП(С)БО Ф1 — Structured Balance Sheet ─────────────────────────────────
// Returns rows 1000-1900 per НП(С)БО 1 standard with optional compare_date
router.get("/reports/balance-sheet-f1", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const date  = (req.query.date  as string) || null;
    const cDate = (req.query.compare_date as string) || null;

    // Fetch all account net balances up to a given date in ONE query
    const fetchBals = async (d: string | null): Promise<Map<string, number>> => {
      const { rows } = await pool.query(`
        WITH e AS (
          SELECT debit_account_id  AS acc, amount AS dbt, 0 AS crd FROM acc_entries
          WHERE organization_id=$1 ${d ? "AND entry_date<=$2::date" : ""}
          UNION ALL
          SELECT credit_account_id AS acc, 0 AS dbt, amount AS crd FROM acc_entries
          WHERE organization_id=$1 ${d ? "AND entry_date<=$2::date" : ""}
        ),
        agg AS (SELECT acc, SUM(dbt) AS d, SUM(crd) AS c FROM e GROUP BY acc)
        SELECT a.code, COALESCE(g.d,0)-COALESCE(g.c,0) AS net
        FROM acc_accounts a LEFT JOIN agg g ON g.acc=a.id
        WHERE a.organization_id=$1
      `, d ? [orgId, d] : [orgId]);
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.code as string, parseFloat(r.net ?? 0));
      return m;
    };

    const buildF1 = (bals: Map<string, number>) => {
      // sum net debit balance for accounts whose code starts with any of the prefixes
      const dbt = (...prefixes: string[]) => {
        let s = 0;
        bals.forEach((v, code) => { if (prefixes.some(p => code.startsWith(p))) s += Math.max(0, v); });
        return s;
      };
      // sum net credit balance (take abs of negative net)
      const crd = (...prefixes: string[]) => {
        let s = 0;
        bals.forEach((v, code) => { if (prefixes.some(p => code.startsWith(p))) s += Math.max(0, -v); });
        return s;
      };
      // straight net (positive = debit)
      const net = (...prefixes: string[]) => {
        let s = 0;
        bals.forEach((v, code) => { if (prefixes.some(p => code.startsWith(p))) s += v; });
        return s;
      };

      // ── АКТИВ ──────────────────────────────────────────────────────────────
      const r1000 = dbt("12") - crd("133");       // НМА (залишкова)
      const r1010 = dbt("15");                     // Незавершені кап. інвестиції
      const r1020 = dbt("10","11") - crd("131","132","134"); // ОЗ залишкова
      const r1030 = dbt("100");                    // Інвестиційна нерухомість
      const r1035 = dbt("141","142");              // Довгострокові фін. інвестиції
      const r1040 = dbt("143","14") - dbt("141","142"); // Інші фін. інвестиції
      const r1045 = dbt("181","182","183");        // Довгострокова ДЗ
      const r1060 = dbt("17");                     // Відстрочені под. активи
      const r1090 = dbt("16","184","185","188","189"); // Інші необоротні
      const r1095 = Math.max(0, r1000+r1010+r1020+r1030+r1035+r1040+r1045+r1060+r1090);

      const r1100 = dbt("20","22","23","25","26","27","28"); // Запаси
      const r1110 = dbt("21");                     // Поточні біологічні активи
      const r1125 = dbt("644");                    // Дт ПДВ
      const r1130 = dbt("36");                     // ДЗ за товари
      const r1135 = dbt("374","375","376","377","378","379"); // ДЗ за розрахунками
      const r1155 = dbt("371","372","373") + dbt("34"); // Інша поточна ДЗ
      const r1160 = dbt("35");                     // Поточні фін. інвестиції
      const r1165 = dbt("30","31","33");           // Гроші та еквіваленти
      const r1190 = dbt("39","643","645");         // Інші оборотні
      const r1195 = r1100+r1110+r1125+r1130+r1135+r1155+r1160+r1165+r1190;

      const r1300 = r1095 + r1195;                 // БАЛАНС (актив)

      // ── ПАСИВ ──────────────────────────────────────────────────────────────
      const r1400 = crd("40");                     // Зарег. капітал
      const r1405 = crd("45");                     // Незарег. внески
      const r1410 = crd("41");                     // Капітал у дооцінках
      const r1415 = crd("43");                     // Резервний капітал
      const r1420 = crd("42");                     // Додатковий капітал
      const r44net = net("44");
      const r1421 = r44net > 0 ? 0 : Math.abs(r44net);  // Непокритий збиток
      const r1422 = r44net < 0 ? 0 : r44net;             // Нерозподілений прибуток
      const r1495 = r1400+r1405+r1410+r1415+r1420+r1422-r1421;

      const r1510 = crd("501","502","503");        // Довгострокові кредити
      const r1515 = crd("504","505","506","55");   // Інші довгостр. зобов'язання
      const r1520 = crd("54");                     // Відстрочені под. зобов'язання
      const r1595 = r1510+r1515+r1520;

      const r1600 = crd("60");                     // Короткострокові кредити
      const r1610 = crd("63");                     // КЗ за товари
      const r1615 = crd("641","642");              // КЗ перед бюджетом
      const r1620 = crd("65");                     // КЗ зі страхування
      const r1625 = crd("661","662");              // КЗ з оплати праці
      const r1630 = crd("681","682","683","684","685"); // Інша КЗ
      const r1635 = crd("69");                     // Доходи майбутніх периодів
      const r1690 = crd("68","372");               // Інші поточні зобов'язання
      const r1695 = r1600+r1610+r1615+r1620+r1625+r1630+r1635+r1690;

      const r1900 = r1495+r1595+r1695;            // БАЛАНС (пасив)

      return {
        assets: [
          { code:"1000", label:"Нематеріальні активи",                value:r1000 },
          { code:"1010", label:"Незавершені капітальні інвестиції",    value:r1010 },
          { code:"1020", label:"Основні засоби",                       value:r1020 },
          { code:"1030", label:"Інвестиційна нерухомість",             value:r1030 },
          { code:"1035", label:"Довгострокові фін. інвестиції",        value:r1035 },
          { code:"1040", label:"Інші фінансові інвестиції",            value:r1040 },
          { code:"1045", label:"Довгострокова дебіторська заборг.",    value:r1045 },
          { code:"1060", label:"Відстрочені податкові активи",         value:r1060 },
          { code:"1090", label:"Інші необоротні активи",               value:r1090 },
          { code:"1095", label:"Усього за розділом І",                 value:r1095, subtotal:true },
          { code:"1100", label:"Запаси",                               value:r1100 },
          { code:"1110", label:"Поточні біологічні активи",            value:r1110 },
          { code:"1125", label:"Дебіторська заборгованість з ПДВ",     value:r1125 },
          { code:"1130", label:"ДЗ за продукцію/товари",               value:r1130 },
          { code:"1135", label:"ДЗ за розрахунками (бюджет, аванси)",  value:r1135 },
          { code:"1155", label:"Інша поточна ДЗ",                      value:r1155 },
          { code:"1160", label:"Поточні фінансові інвестиції",         value:r1160 },
          { code:"1165", label:"Гроші та їх еквіваленти",              value:r1165 },
          { code:"1190", label:"Інші оборотні активи",                 value:r1190 },
          { code:"1195", label:"Усього за розділом ІІ",                value:r1195, subtotal:true },
          { code:"1300", label:"БАЛАНС",                               value:r1300, total:true },
        ],
        equity: [
          { code:"1400", label:"Зареєстрований (пайовий) капітал",     value:r1400 },
          { code:"1405", label:"Внески до незареєстрованого капіталу", value:r1405 },
          { code:"1410", label:"Капітал у дооцінках",                  value:r1410 },
          { code:"1415", label:"Резервний капітал",                    value:r1415 },
          { code:"1420", label:"Додатковий капітал",                   value:r1420 },
          { code:"1422", label:"Нерозподілений прибуток (збиток)",     value:r44net },
          { code:"1495", label:"Усього за розділом І",                 value:r1495, subtotal:true },
        ],
        longterm: [
          { code:"1510", label:"Довгострокові кредити банків",         value:r1510 },
          { code:"1515", label:"Інші довгострокові зобов'язання",      value:r1515 },
          { code:"1520", label:"Відстрочені податкові зобов'язання",   value:r1520 },
          { code:"1595", label:"Усього за розділом ІІ",                value:r1595, subtotal:true },
        ],
        current: [
          { code:"1600", label:"Поточні кредити банків",               value:r1600 },
          { code:"1610", label:"КЗ за товари, роботи, послуги",        value:r1610 },
          { code:"1615", label:"КЗ за розрахунками з бюджетом",        value:r1615 },
          { code:"1620", label:"КЗ зі страхування",                    value:r1620 },
          { code:"1625", label:"КЗ з оплати праці",                    value:r1625 },
          { code:"1630", label:"Інша кредиторська заборгованість",     value:r1630 },
          { code:"1635", label:"Доходи майбутніх периодів",            value:r1635 },
          { code:"1690", label:"Інші поточні зобов'язання",            value:r1690 },
          { code:"1695", label:"Усього за розділом ІІІ",               value:r1695, subtotal:true },
        ],
        totals: { r1300, r1900, r1095, r1195, r1495, r1595, r1695, balanced: Math.abs(r1300 - r1900) < 0.02 },
      };
    };

    const [cur, cmp] = await Promise.all([
      fetchBals(date),
      cDate ? fetchBals(cDate) : Promise.resolve(null),
    ]);

    const current = buildF1(cur);
    const compare = cmp ? buildF1(cmp) : null;
    res.json({ current, compare, date, compare_date: cDate });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Ф3 — Cashflow Statement (indirect method) ──────────────────────────────
router.get("/reports/cashflow", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { year, month } = req.query as Record<string, string>;
    const y = parseInt(year ?? new Date().getFullYear().toString());
    const m = parseInt(month ?? (new Date().getMonth() + 1).toString());

    // Date range: full year up to end of selected month
    const fromDate = `${y}-01-01`;
    const toDate   = new Date(y, m, 0).toISOString().split("T")[0]; // last day of month

    // Fetch turnovers (from-to) for given code prefixes
    const turnover = async (codes: string[], side: "debit"|"credit"): Promise<number> => {
      const col = side === "debit" ? "debit_account_id" : "credit_account_id";
      const likes = codes.map((_, i) => `a.code LIKE $${i + 4}`).join(" OR ");
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(e.amount),0) AS v
         FROM acc_entries e JOIN acc_accounts a ON a.id=e.${col}
         WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3 AND (${likes})`,
        [orgId, fromDate, toDate, ...codes.map(c => c + "%")],
      );
      return parseFloat(rows[0]?.v ?? 0);
    };

    // Net debit turnover = inflows - outflows for asset accounts
    const netDbr = async (...codes: string[]) => (await turnover(codes,"debit")) - (await turnover(codes,"credit"));
    const netCrd = async (...codes: string[]) => (await turnover(codes,"credit")) - (await turnover(codes,"debit"));

    // ── Operating ──────────────────────────────────────────────────────────
    const netProfit = (await (async () => {
      const [rev, cogs, sga, other] = await Promise.all([
        netCrd("701","702","703","71","72","73","74"),
        netDbr("90","91","92","93","94","95","97","98"),
        Promise.resolve(0), Promise.resolve(0),
      ]);
      return rev - cogs;
    })());

    const [amort, deltaRec, deltaInv, deltaPay, deltaCash311, cash30, cash31] = await Promise.all([
      turnover(["131","132","133","134"],"credit"),  // amortization credit turnover (non-cash add-back)
      netDbr("36","37"),               // Δ receivables (increase = use of cash)
      netDbr("20","21","22","23","25","26","27","28"), // Δ inventory
      netCrd("63","68","685"),         // Δ payables (increase = source of cash)
      turnover(["311"],"debit"),        // cash inflows 311
      turnover(["30"],"debit") - turnover(["30"],"credit"), // net cash 30
      turnover(["311"],"debit") - turnover(["311"],"credit"), // net cash 311
    ]);

    // Revenue receipts (operational inflows to 30x/31x from 70x via 36x)
    const [cashInflow, cashOutflow] = await Promise.all([
      turnover(["30","31","33"],"debit"),
      turnover(["30","31","33"],"credit"),
    ]);

    const opCashFlow = cashInflow - cashOutflow - (await turnover(["10","11","12","15"],"debit"))
      + (await turnover(["10","11","12","15"],"credit")); // rough operating

    // Better: compute direct from bank/cash movements by source accounts
    // Use receipts to cash (30x/31x debit) from customers (36x,70x) minus payments to suppliers etc.
    const [recFromCust, paidSupp, paidSalary, paidTax, paidOther] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '30%' OR dt.code LIKE '31%' OR dt.code LIKE '33%')
          AND (ct.code LIKE '36%' OR ct.code LIKE '70%' OR ct.code LIKE '71%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '63%' OR dt.code LIKE '68%')
          AND (ct.code LIKE '30%' OR ct.code LIKE '31%' OR ct.code LIKE '33%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '66%')
          AND (ct.code LIKE '30%' OR ct.code LIKE '31%' OR ct.code LIKE '33%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '64%' OR dt.code LIKE '65%')
          AND (ct.code LIKE '30%' OR ct.code LIKE '31%' OR ct.code LIKE '33%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '92%' OR dt.code LIKE '93%' OR dt.code LIKE '94%' OR dt.code LIKE '97%')
          AND (ct.code LIKE '30%' OR ct.code LIKE '31%' OR ct.code LIKE '33%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
    ]);

    const netOperating = recFromCust - paidSupp - paidSalary - paidTax - paidOther;

    // ── Investing ──────────────────────────────────────────────────────────
    const [capex, assetSales] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '10%' OR dt.code LIKE '11%' OR dt.code LIKE '12%' OR dt.code LIKE '15%')
          AND (ct.code LIKE '30%' OR ct.code LIKE '31%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '30%' OR dt.code LIKE '31%')
          AND (ct.code LIKE '74%' OR ct.code LIKE '76%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
    ]);
    const netInvesting = assetSales - capex;

    // ── Financing ──────────────────────────────────────────────────────────
    const [loanIn, loanOut, equityIn] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '30%' OR dt.code LIKE '31%')
          AND (ct.code LIKE '50%' OR ct.code LIKE '60%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '50%' OR dt.code LIKE '60%')
          AND (ct.code LIKE '30%' OR ct.code LIKE '31%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
      pool.query(`SELECT COALESCE(SUM(e.amount),0) AS v FROM acc_entries e
        JOIN acc_accounts dt ON dt.id=e.debit_account_id
        JOIN acc_accounts ct ON ct.id=e.credit_account_id
        WHERE e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
          AND (dt.code LIKE '30%' OR dt.code LIKE '31%')
          AND (ct.code LIKE '40%' OR ct.code LIKE '42%')`,
        [orgId, fromDate, toDate]).then(r => parseFloat(r.rows[0].v)),
    ]);
    const netFinancing = loanIn - loanOut + equityIn;

    // Cash at beginning/end
    const cashAtStart = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE 0 END)
            -SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) AS v
      FROM acc_accounts a
      LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
        AND e.organization_id=$1 AND e.entry_date<$2
      WHERE a.organization_id=$1 AND (a.code LIKE '30%' OR a.code LIKE '31%' OR a.code LIKE '33%')
    `, [orgId, fromDate]).then(r => parseFloat(r.rows[0].v));

    const cashAtEnd = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE 0 END)
            -SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) AS v
      FROM acc_accounts a
      LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
        AND e.organization_id=$1 AND e.entry_date<=$2
      WHERE a.organization_id=$1 AND (a.code LIKE '30%' OR a.code LIKE '31%' OR a.code LIKE '33%')
    `, [orgId, toDate]).then(r => parseFloat(r.rows[0].v));

    res.json({
      period: { year: y, month: m, from: fromDate, to: toDate },
      operating: {
        net: netOperating,
        receipts_from_customers: recFromCust,
        payments_to_suppliers:   -paidSupp,
        payments_salary:         -paidSalary,
        payments_tax:            -paidTax,
        payments_other:          -paidOther,
      },
      investing: {
        net:        netInvesting,
        capex:      -capex,
        asset_sales: assetSales,
      },
      financing: {
        net:       netFinancing,
        loan_in:   loanIn,
        loan_out:  -loanOut,
        equity_in: equityIn,
      },
      cash_at_start: cashAtStart,
      cash_at_end:   cashAtEnd,
      net_change:    netOperating + netInvesting + netFinancing,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── KPI Snapshot — Management Dashboard ────────────────────────────────────
router.get("/reports/kpi-snapshot", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { year, month } = req.query as Record<string, string>;
    const y = parseInt(year ?? new Date().getFullYear().toString());
    const m = parseInt(month ?? (new Date().getMonth() + 1).toString());

    const fromDate = `${y}-${String(m).padStart(2,"0")}-01`;
    const toDate   = new Date(y, m, 0).toISOString().split("T")[0];
    const prevM    = m === 1 ? 12 : m - 1;
    const prevY    = m === 1 ? y - 1 : y;
    const prevFrom = `${prevY}-${String(prevM).padStart(2,"0")}-01`;
    const prevTo   = new Date(prevY, prevM, 0).toISOString().split("T")[0];

    const netCredit = async (codes: string[], from: string, to: string) => {
      const likes = codes.map((_, i) => `a.code LIKE $${i+4}`).join(" OR ");
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END)
                        -SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE 0 END),0) AS v
         FROM acc_accounts a
         LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
           AND e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
         WHERE a.organization_id=$1 AND (${likes})`,
        [orgId, from, to, ...codes.map(c => c+"%")],
      );
      return parseFloat(rows[0]?.v ?? 0);
    };
    const netDebit = async (codes: string[], from: string, to: string) => {
      const likes = codes.map((_, i) => `a.code LIKE $${i+4}`).join(" OR ");
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE 0 END)
                        -SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) AS v
         FROM acc_accounts a
         LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
           AND e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
         WHERE a.organization_id=$1 AND (${likes})`,
        [orgId, from, to, ...codes.map(c => c+"%")],
      );
      return parseFloat(rows[0]?.v ?? 0);
    };
    const balAsOf = async (codes: string[], date: string) => {
      const likes = codes.map((_, i) => `a.code LIKE $${i+3}`).join(" OR ");
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE 0 END)
                        -SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) AS v
         FROM acc_accounts a
         LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
           AND e.organization_id=$1 AND e.entry_date<=$2
         WHERE a.organization_id=$1 AND (${likes})`,
        [orgId, date, ...codes.map(c => c+"%")],
      );
      return parseFloat(rows[0]?.v ?? 0);
    };

    const [
      revenue, cogs, adminExp, sga, amort,
      revPrev, cogsPrev, adminPrev,
      cash, receivables, payables, inventory,
    ] = await Promise.all([
      netCredit(["701","702","703"], fromDate, toDate),
      netDebit(["901","902","903"], fromDate, toDate),
      netDebit(["92"], fromDate, toDate),
      netDebit(["93"], fromDate, toDate),
      netDebit(["131","132","133","134"], fromDate, toDate),
      netCredit(["701","702","703"], prevFrom, prevTo),
      netDebit(["901","902","903"], prevFrom, prevTo),
      netDebit(["92"], prevFrom, prevTo),
      balAsOf(["30","31","33"], toDate),
      balAsOf(["36","37"], toDate),
      balAsOf(["63","64","65","66","68"], toDate),
      balAsOf(["20","21","22","23","25","26","27","28"], toDate),
    ]);

    const grossProfit   = revenue - cogs;
    const ebitda        = grossProfit - adminExp - sga + amort;
    const grossProfitPrev = revPrev - cogsPrev;
    const grossMargin   = revenue > 0 ? grossProfit / revenue : 0;
    const prevMargin    = revPrev > 0 ? grossProfitPrev / revPrev : 0;
    const revenueGrowth = revPrev > 0 ? (revenue - revPrev) / revPrev : 0;
    const ebitdaMargin  = revenue > 0 ? ebitda / revenue : 0;

    res.json({
      period: { year: y, month: m },
      kpi: {
        revenue,       revPrev,    revenueGrowth,
        grossProfit,   grossProfitPrev, grossMargin, prevMargin,
        ebitda,        ebitdaMargin,
        adminExp,      sga,        amort,
        cash,          receivables, payables, inventory,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// BANK STATEMENTS — банківська виписка
// ═══════════════════════════════════════════════════════════════════════════

router.get("/bank", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { from, to, reconciled } = req.query;
  let q = `SELECT b.*, c.name as contractor_name
           FROM acc_bank_statements b
           LEFT JOIN acc_contractors c ON c.id=b.contractor_id
           WHERE b.organization_id=$1`;
  const p: any[] = [orgId];
  if (from)       { p.push(from); q += ` AND b.statement_date>=$${p.length}`; }
  if (to)         { p.push(to);   q += ` AND b.statement_date<=$${p.length}`; }
  if (reconciled !== undefined) { p.push(reconciled === "true"); q += ` AND b.is_reconciled=$${p.length}`; }
  q += ` ORDER BY b.statement_date DESC`;
  const { rows } = await pool.query(q, p);
  res.json(rows);
});

router.post("/bank", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { bank_account, statement_date, description, amount, contractor_id, external_id } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO acc_bank_statements (organization_id,bank_account,statement_date,description,amount,contractor_id,external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, bank_account ?? null, statement_date, description ?? null, amount, contractor_id ?? null, external_id ?? null],
  );
  res.json(rows[0]);
});

router.post("/bank/import", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { rows: data } = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: "rows must be array" });
  let imported = 0;
  for (const row of data) {
    await pool.query(
      `INSERT INTO acc_bank_statements (organization_id,statement_date,description,amount,external_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [orgId, row.date, row.description, row.amount, row.external_id ?? null],
    );
    imported++;
  }
  res.json({ imported });
});

router.patch("/bank/:id/reconcile", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { contractor_id, document_id } = req.body;
  const { rows } = await pool.query(
    `UPDATE acc_bank_statements SET is_reconciled=true,
       contractor_id=COALESCE($1,contractor_id), document_id=COALESCE($2,document_id)
     WHERE id=$3 AND organization_id=$4 RETURNING *`,
    [contractor_id ?? null, document_id ?? null, req.params.id, orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// ═══════════════════════════════════════════════════════════════════════════
// BANK RECONCILIATION — Phase 4
// ═══════════════════════════════════════════════════════════════════════════

async function ensureBankReconcileColumns() {
  await pool.query(`
    ALTER TABLE acc_bank_statements
      ADD COLUMN IF NOT EXISTS match_status   TEXT    DEFAULT 'unmatched'  CHECK(match_status IN ('unmatched','matched','ignored','suggested')),
      ADD COLUMN IF NOT EXISTS entry_id       INT     REFERENCES acc_entries(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS import_source  TEXT,
      ADD COLUMN IF NOT EXISTS bank_name      TEXT,
      ADD COLUMN IF NOT EXISTS counterpart_iban TEXT,
      ADD COLUMN IF NOT EXISTS counterpart_name TEXT,
      ADD COLUMN IF NOT EXISTS transaction_id TEXT;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_bank_stmt_txn
      ON acc_bank_statements(organization_id, transaction_id)
      WHERE transaction_id IS NOT NULL;
  `);
}

// Helper: parse PrivatBank CSV row  (UA format)
// Col order: Дата, Час, Категорія, Картка, Опис, Сума, Валюта, Баланс, Баланс після
function parsePrivatBankCSV(text: string): any[] {
  const lines = text.trim().split(/\r?\n/);
  const results: any[] = [];
  // skip header line(s) — detect by checking if first col parseable as date
  for (const line of lines) {
    const cols = line.split(/[,;\t]/).map(c => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 5) continue;
    // try to parse date DD.MM.YYYY or YYYY-MM-DD
    const rawDate = cols[0];
    let date: string | null = null;
    const dmY = rawDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const Ymd = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dmY)      date = `${dmY[3]}-${dmY[2]}-${dmY[1]}`;
    else if (Ymd) date = rawDate;
    else continue; // skip non-date rows
    const description = cols[4] ?? cols[2] ?? "";
    const rawAmt = (cols[5] ?? cols[3] ?? "").replace(/\s/g, "").replace(",", ".");
    const amount = parseFloat(rawAmt);
    if (isNaN(amount)) continue;
    const txnId = cols[7] ?? null;
    results.push({ date, description, amount, transaction_id: txnId || null });
  }
  return results;
}

// Helper: parse Monobank CSV (export from app)
// Col order: Дата, Опис, МСС, Сума, Сума в валюті, Баланс, Cashback, Валюта
function parseMonobankCSV(text: string): any[] {
  const lines = text.trim().split(/\r?\n/);
  const results: any[] = [];
  for (const line of lines) {
    const cols = line.split(/[,;\t]/).map(c => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 4) continue;
    const rawDate = cols[0];
    let date: string | null = null;
    // Monobank: DD.MM.YYYY HH:MM:SS
    const m = rawDate.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) date = `${m[3]}-${m[2]}-${m[1]}`;
    else continue;
    const description = cols[1] ?? "";
    const rawAmt = (cols[3] ?? "").replace(/\s/g, "").replace(",", ".");
    const amount = parseFloat(rawAmt);
    if (isNaN(amount)) continue;
    results.push({ date, description, amount, transaction_id: null });
  }
  return results;
}

// Auto-match: find journal entries matching by amount + date proximity
async function autoMatchEntry(orgId: number, stmtId: number, amount: number, date: string): Promise<number | null> {
  const { rows } = await pool.query(`
    SELECT e.id
    FROM acc_entries e
    WHERE e.organization_id = $1
      AND ABS(e.amount - ABS($2)) < 0.02
      AND e.entry_date BETWEEN ($3::date - INTERVAL '3 days') AND ($3::date + INTERVAL '3 days')
      AND NOT EXISTS (
        SELECT 1 FROM acc_bank_statements b
        WHERE b.entry_id = e.id AND b.organization_id = $1 AND b.id <> $4
      )
    ORDER BY ABS(e.entry_date - $3::date), e.id DESC
    LIMIT 1
  `, [orgId, amount, date, stmtId]);
  return rows[0]?.id ?? null;
}

// --- GET /bank/reconcile/summary
router.get("/bank/reconcile/summary", async (req: any, res) => {
  try {
    await ensureBankReconcileColumns();
    const orgId = await resolveOrgId(req);
    const { from, to } = req.query;
    let where = `WHERE organization_id=$1`;
    const p: any[] = [orgId];
    if (from) { p.push(from); where += ` AND statement_date>=$${p.length}`; }
    if (to)   { p.push(to);   where += ` AND statement_date<=$${p.length}`; }
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE match_status='matched')   AS matched,
        COUNT(*) FILTER (WHERE match_status='unmatched' OR match_status IS NULL) AS unmatched,
        COUNT(*) FILTER (WHERE match_status='ignored')   AS ignored,
        COUNT(*) FILTER (WHERE match_status='suggested') AS suggested,
        COALESCE(SUM(CASE WHEN amount>0 THEN amount ELSE 0 END),0) AS total_in,
        COALESCE(SUM(CASE WHEN amount<0 THEN ABS(amount) ELSE 0 END),0) AS total_out
      FROM acc_bank_statements ${where}
    `, p);
    const r = rows[0];
    const tot = Number(r.total);
    const matched = Number(r.matched);
    res.json({
      total:    tot,
      matched,
      unmatched: Number(r.unmatched),
      ignored:  Number(r.ignored),
      suggested: Number(r.suggested),
      pct_reconciled: tot > 0 ? Math.round((matched + Number(r.ignored)) / tot * 100) : 100,
      total_in:  Number(r.total_in),
      total_out: Number(r.total_out),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- POST /bank/csv-parse — preview only, no save
router.post("/bank/csv-parse", async (req: any, res) => {
  try {
    const { text, format } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });
    let rows: any[];
    if (format === "monobank") rows = parseMonobankCSV(text);
    else rows = parsePrivatBankCSV(text); // default: privatbank
    res.json({ rows, count: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- POST /bank/csv-import — parse + insert + auto-match
router.post("/bank/csv-import", async (req: any, res) => {
  try {
    await ensureBankReconcileColumns();
    const orgId = await resolveOrgId(req);
    const { text, format, bank_account, bank_name } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });

    let rows: any[];
    if (format === "monobank") rows = parseMonobankCSV(text);
    else rows = parsePrivatBankCSV(text);

    let imported = 0, skipped = 0, autoMatched = 0;
    for (const row of rows) {
      const { rows: ins } = await pool.query(`
        INSERT INTO acc_bank_statements
          (organization_id, statement_date, description, amount,
           import_source, bank_name, counterpart_iban, counterpart_name,
           transaction_id, match_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unmatched')
        ON CONFLICT (organization_id, transaction_id) WHERE transaction_id IS NOT NULL
        DO NOTHING
        RETURNING id, amount, statement_date
      `, [orgId, row.date, row.description, row.amount,
          format ?? "privatbank", bank_name ?? null,
          row.counterpart_iban ?? null, row.counterpart_name ?? null,
          row.transaction_id ?? null]);

      if (!ins[0]) { skipped++; continue; }
      imported++;

      // try auto-match
      const entryId = await autoMatchEntry(orgId, ins[0].id, row.amount, row.date);
      if (entryId) {
        await pool.query(
          `UPDATE acc_bank_statements SET match_status='suggested', entry_id=$1 WHERE id=$2`,
          [entryId, ins[0].id],
        );
        autoMatched++;
      }
    }

    await logAudit({
      organizationId: orgId, action: "bank_csv_import", entityType: "bank_statement",
      entityId: 0, userId: req.user?.userId ?? req.user?.id ?? null,
      note: `CSV імпорт: ${imported} рядків, ${autoMatched} авто-матч`,
    });
    res.json({ imported, skipped, auto_matched: autoMatched, total: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- POST /bank/auto-match-all — try auto-match all unmatched
router.post("/bank/auto-match-all", async (req: any, res) => {
  try {
    await ensureBankReconcileColumns();
    const orgId = await resolveOrgId(req);
    const { rows: unmatched } = await pool.query(`
      SELECT id, amount, statement_date FROM acc_bank_statements
      WHERE organization_id=$1 AND (match_status='unmatched' OR match_status IS NULL)
    `, [orgId]);

    let matched = 0;
    for (const stmt of unmatched) {
      const entryId = await autoMatchEntry(orgId, stmt.id, stmt.amount, stmt.statement_date);
      if (entryId) {
        await pool.query(
          `UPDATE acc_bank_statements SET match_status='suggested', entry_id=$1 WHERE id=$2`,
          [entryId, stmt.id],
        );
        matched++;
      }
    }
    res.json({ matched, checked: unmatched.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- POST /bank/:id/match — confirm match to entry_id
router.post("/bank/:id/match", async (req: any, res) => {
  try {
    await ensureBankReconcileColumns();
    const orgId = await resolveOrgId(req);
    const { entry_id } = req.body;
    const { rows } = await pool.query(`
      UPDATE acc_bank_statements
        SET match_status='matched', is_reconciled=true, entry_id=$1
      WHERE id=$2 AND organization_id=$3
      RETURNING *
    `, [entry_id ?? null, req.params.id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- POST /bank/:id/ignore
router.post("/bank/:id/ignore", async (req: any, res) => {
  try {
    await ensureBankReconcileColumns();
    const orgId = await resolveOrgId(req);
    const { rows } = await pool.query(`
      UPDATE acc_bank_statements
        SET match_status='ignored', is_reconciled=true
      WHERE id=$1 AND organization_id=$2
      RETURNING *
    `, [req.params.id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- POST /bank/:id/unmatch — reset to unmatched
router.post("/bank/:id/unmatch", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { rows } = await pool.query(`
      UPDATE acc_bank_statements
        SET match_status='unmatched', is_reconciled=false, entry_id=NULL
      WHERE id=$1 AND organization_id=$2
      RETURNING *
    `, [req.params.id, orgId]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- GET /bank?... (extended — now includes match_status, entry info)
// Already defined above; add a separate extended list with entry info:
router.get("/bank/reconcile", async (req: any, res) => {
  try {
    await ensureBankReconcileColumns();
    const orgId = await resolveOrgId(req);
    const { from, to, status } = req.query;
    let where = `b.organization_id=$1`;
    const p: any[] = [orgId];
    if (from)   { p.push(from);   where += ` AND b.statement_date>=$${p.length}`; }
    if (to)     { p.push(to);     where += ` AND b.statement_date<=$${p.length}`; }
    if (status && status !== "all") {
      if (status === "unmatched") {
        where += ` AND (b.match_status='unmatched' OR b.match_status IS NULL)`;
      } else {
        p.push(status); where += ` AND b.match_status=$${p.length}`;
      }
    }
    const { rows } = await pool.query(`
      SELECT b.*,
             c.name  AS contractor_name,
             e.description AS entry_desc,
             da.code AS entry_debit,
             ca.code AS entry_credit,
             e.amount AS entry_amount,
             e.entry_date AS entry_date
      FROM acc_bank_statements b
      LEFT JOIN acc_contractors c ON c.id = b.contractor_id
      LEFT JOIN acc_entries    e ON e.id = b.entry_id
      LEFT JOIN acc_accounts   da ON da.id = e.debit_account_id
      LEFT JOIN acc_accounts   ca ON ca.id = e.credit_account_id
      WHERE ${where}
      ORDER BY b.statement_date DESC, b.id DESC
    `, p);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT CARD — картка рахунку
// ═══════════════════════════════════════════════════════════════════════════

router.get("/reports/account-card", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { code, from, to } = req.query;
  if (!code) return res.status(400).json({ error: "code required" });
  await seedChart(orgId);
  const { rows: accs } = await pool.query(
    `SELECT * FROM acc_accounts WHERE organization_id=$1 AND code=$2 LIMIT 1`, [orgId, code],
  );
  if (!accs[0]) return res.status(404).json({ error: "Рахунок не знайдено" });
  const acc = accs[0];

  // Opening balance (entries BEFORE from date)
  const { rows: openRows } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN debit_account_id=$2  THEN amount ELSE 0 END),0) as od,
      COALESCE(SUM(CASE WHEN credit_account_id=$2 THEN amount ELSE 0 END),0) as oc
    FROM acc_entries WHERE organization_id=$1
      AND ($3::date IS NULL OR entry_date < $3::date)
  `, [orgId, acc.id, from ?? null]);
  const od = parseFloat(openRows[0].od);
  const oc = parseFloat(openRows[0].oc);
  const openingBalance = od - oc;

  // Entries in period
  const { rows: entries } = await pool.query(`
    SELECT e.id, e.entry_date, e.amount, e.description,
      da.code as debit_code, da.name as debit_name,
      ca.code as credit_code, ca.name as credit_name,
      d.doc_number, d.doc_type,
      CASE WHEN e.debit_account_id=$2  THEN e.amount ELSE 0 END as debit_amount,
      CASE WHEN e.credit_account_id=$2 THEN e.amount ELSE 0 END as credit_amount
    FROM acc_entries e
    JOIN acc_accounts da ON da.id=e.debit_account_id
    JOIN acc_accounts ca ON ca.id=e.credit_account_id
    LEFT JOIN acc_documents d ON d.id=e.document_id
    WHERE e.organization_id=$1 AND (e.debit_account_id=$2 OR e.credit_account_id=$2)
      AND ($3::date IS NULL OR e.entry_date>=$3::date)
      AND ($4::date IS NULL OR e.entry_date<=$4::date)
    ORDER BY e.entry_date ASC, e.id ASC
  `, [orgId, acc.id, from ?? null, to ?? null]);

  let balance = openingBalance;
  const rows = entries.map((e: any) => {
    balance += parseFloat(e.debit_amount) - parseFloat(e.credit_amount);
    return { ...e, running_balance: Math.round(balance * 100) / 100 };
  });

  const totalDebit  = entries.reduce((s: number, r: any) => s + parseFloat(r.debit_amount),  0);
  const totalCredit = entries.reduce((s: number, r: any) => s + parseFloat(r.credit_amount), 0);
  res.json({ account: acc, openingBalance, closingBalance: balance, totalDebit, totalCredit, rows });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASH ORDERS — касові ордери (ПКО / ВКО)
// ═══════════════════════════════════════════════════════════════════════════

async function ensureCashTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_cash_orders (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      order_type      TEXT    NOT NULL CHECK (order_type IN ('pko','vko')),
      order_number    TEXT    NOT NULL,
      order_date      DATE    NOT NULL,
      amount          NUMERIC(15,2) NOT NULL,
      description     TEXT,
      contractor_id   INTEGER,
      corr_account    TEXT,
      basis           TEXT,
      cashier         TEXT,
      person          TEXT,
      period_id       INTEGER,
      entry_id        INTEGER,
      created_by      INTEGER,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

router.get("/cash", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await ensureCashTable();
  const { from, to, type } = req.query;
  let q = `SELECT o.*, c.name as contractor_name
           FROM acc_cash_orders o LEFT JOIN acc_contractors c ON c.id=o.contractor_id
           WHERE o.organization_id=$1`;
  const p: any[] = [orgId];
  if (from) { p.push(from); q += ` AND o.order_date>=$${p.length}`; }
  if (to)   { p.push(to);   q += ` AND o.order_date<=$${p.length}`; }
  if (type) { p.push(type); q += ` AND o.order_type=$${p.length}`; }
  q += ` ORDER BY o.order_date DESC, o.id DESC`;
  const { rows } = await pool.query(q, p);
  res.json(rows);
});

router.post("/cash", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const userId = req.user.userId;
  await ensureCashTable();
  const { order_type, order_number, order_date, amount, description,
          contractor_id, corr_account, basis, cashier, person } = req.body;
  if (!order_type || !order_number || !order_date || !amount)
    return res.status(400).json({ error: "order_type, order_number, order_date, amount required" });

  const periodId = await ensurePeriod(orgId, new Date(order_date));

  // Auto-create journal entry
  await seedChart(orgId);
  const acc30Id = await getAccId(orgId, "30");
  const corrId  = corr_account ? await getAccId(orgId, corr_account) : null;
  let entryId: number | null = null;

  if (acc30Id) {
    const debitId  = order_type === "pko" ? acc30Id : (corrId ?? null);
    const creditId = order_type === "pko" ? (corrId ?? null) : acc30Id;
    if (debitId && creditId) {
      const { rows: eRows } = await pool.query(
        `INSERT INTO acc_entries (organization_id,entry_date,period_id,debit_account_id,credit_account_id,amount,currency,description,is_manual,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'UAH',$7,false,$8) RETURNING id`,
        [orgId, order_date, periodId, debitId, creditId, amount,
         `${order_type.toUpperCase()} №${order_number}: ${description ?? ""}`, userId],
      );
      entryId = eRows[0].id;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO acc_cash_orders (organization_id,order_type,order_number,order_date,amount,description,contractor_id,corr_account,basis,cashier,person,period_id,entry_id,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [orgId, order_type, order_number, order_date, amount, description ?? null,
     contractor_id ?? null, corr_account ?? null, basis ?? null, cashier ?? null,
     person ?? null, periodId, entryId, userId],
  );
  res.status(201).json(rows[0]);
});

router.delete("/cash/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await ensureCashTable();
  const { rows } = await pool.query(
    `SELECT entry_id FROM acc_cash_orders WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (rows[0].entry_id) await pool.query(`DELETE FROM acc_entries WHERE id=$1`, [rows[0].entry_id]);
  await pool.query(`DELETE FROM acc_cash_orders WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

router.get("/cash/book", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await ensureCashTable();
  const { from, to } = req.query;
  const dateFrom = from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const dateTo   = to   ?? new Date().toISOString().slice(0, 10);

  const { rows: openRow } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN order_type='pko' THEN amount ELSE -amount END),0) as balance
     FROM acc_cash_orders WHERE organization_id=$1 AND order_date < $2`,
    [orgId, dateFrom],
  );
  const openingBalance = parseFloat(openRow[0].balance);

  const { rows: daily } = await pool.query(`
    SELECT order_date::text,
      COALESCE(SUM(CASE WHEN order_type='pko' THEN amount ELSE 0 END),0) as income,
      COALESCE(SUM(CASE WHEN order_type='vko' THEN amount ELSE 0 END),0) as expense,
      COUNT(*) as docs_count
    FROM acc_cash_orders
    WHERE organization_id=$1 AND order_date BETWEEN $2 AND $3
    GROUP BY order_date ORDER BY order_date
  `, [orgId, dateFrom, dateTo]);

  let balance = openingBalance;
  const rows = daily.map((d: any) => {
    const open = balance;
    balance += parseFloat(d.income) - parseFloat(d.expense);
    return { ...d, opening_balance: Math.round(open * 100) / 100, closing_balance: Math.round(balance * 100) / 100 };
  });

  const totalIncome  = daily.reduce((s: number, r: any) => s + parseFloat(r.income),  0);
  const totalExpense = daily.reduce((s: number, r: any) => s + parseFloat(r.expense), 0);
  res.json({ dateFrom, dateTo, openingBalance, closingBalance: balance, totalIncome, totalExpense, rows });
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT — імпорт з 1С
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// BAS / 1C XML IMPORT — імпорт з BAS або 1С Підприємство
// ═══════════════════════════════════════════════════════════════════════════

// Ensure import log table
async function ensureBasImportTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_bas_imports (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      imported_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      source_format   TEXT DEFAULT 'bas_xml',
      file_name       TEXT,
      date_from       DATE,
      date_to         DATE,
      entries_total   INTEGER DEFAULT 0,
      entries_ok      INTEGER DEFAULT 0,
      entries_failed  INTEGER DEFAULT 0,
      contractors_ok  INTEGER DEFAULT 0,
      notes           TEXT,
      imported_by     INTEGER
    )
  `);
}

// Preview: parse incoming entries array and resolve account IDs
router.post("/import/bas-xml/preview", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    await seedChart(orgId);
    const { entries = [] } = req.body;
    if (!Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: "entries required" });

    // Resolve account codes to IDs and validate
    const results = await Promise.all(entries.map(async (e: any, idx: number) => {
      const dtId = await getAccId(orgId, String(e.debit_code  ?? ""));
      const ktId = await getAccId(orgId, String(e.credit_code ?? ""));
      const amt  = parseFloat(e.amount ?? 0);
      return {
        idx,
        entry_date:   e.entry_date,
        debit_code:   e.debit_code,
        credit_code:  e.credit_code,
        debit_name:   e.debit_name  ?? null,
        credit_name:  e.credit_name ?? null,
        amount:        amt,
        description:  e.description ?? null,
        doc_number:   e.doc_number  ?? null,
        debit_id:     dtId,
        credit_id:    ktId,
        valid: !!dtId && !!ktId && amt > 0 && !!e.entry_date,
        error: !dtId ? `Дт рахунок ${e.debit_code} не знайдено` :
               !ktId ? `Кт рахунок ${e.credit_code} не знайдено` :
               amt <= 0 ? "Сума має бути > 0" :
               !e.entry_date ? "Дата відсутня" : null,
      };
    }));
    const valid   = results.filter(r => r.valid).length;
    const invalid = results.filter(r => !r.valid).length;
    res.json({ results, valid, invalid, total: results.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Confirm import: save valid entries to acc_entries
router.post("/import/bas-xml/confirm", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const userId = req.user.userId;
    await ensureBasImportTable();
    await seedChart(orgId);

    const { entries = [], fileName, sourceFormat = "bas_xml", dateFrom, dateTo, contractors = [] } = req.body;
    if (!Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: "entries required" });

    let ok = 0, failed = 0, contractorsOk = 0;
    const errors: string[] = [];

    // Import contractors first
    for (const c of contractors) {
      try {
        await pool.query(
          `INSERT INTO acc_contractors (organization_id,name,edrpou,ipn)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [orgId, c.name, c.edrpou ?? null, c.ipn ?? null],
        );
        contractorsOk++;
      } catch (_) {}
    }

    // Import entries
    for (const e of entries) {
      try {
        if (!e.debit_id || !e.credit_id || !e.amount || !e.entry_date) {
          failed++;
          errors.push(`Рядок ${e.idx ?? "?"}: відсутні поля`);
          continue;
        }
        const periodId = await ensurePeriod(orgId, new Date(e.entry_date));
        await pool.query(
          `INSERT INTO acc_entries
             (organization_id,entry_date,period_id,debit_account_id,credit_account_id,
              amount,currency,description,is_manual,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,'UAH',$7,true,$8)`,
          [orgId, e.entry_date, periodId, e.debit_id, e.credit_id,
           parseFloat(e.amount), e.description ?? null, userId],
        );
        ok++;
      } catch (err: any) {
        failed++;
        errors.push(`Рядок ${e.idx ?? "?"}: ${err.message}`);
      }
    }

    // Log the import
    const allDates = entries.map((e: any) => e.entry_date).filter(Boolean).sort();
    await pool.query(
      `INSERT INTO acc_bas_imports
         (organization_id,source_format,file_name,date_from,date_to,
          entries_total,entries_ok,entries_failed,contractors_ok,imported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [orgId, sourceFormat, fileName ?? null,
       dateFrom ?? allDates[0] ?? null,
       dateTo   ?? allDates[allDates.length-1] ?? null,
       entries.length, ok, failed, contractorsOk, userId],
    );

    res.json({ ok, failed, contractorsOk, total: entries.length, errors: errors.slice(0, 10) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Import history
router.get("/import/bas-xml/history", async (req: any, res) => {
  try {
    await ensureBasImportTable();
    const orgId = await resolveOrgId(req);
    const { rows } = await pool.query(
      `SELECT * FROM acc_bas_imports WHERE organization_id=$1 ORDER BY imported_at DESC LIMIT 50`,
      [orgId],
    );
    res.json({ imports: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/import/contractors", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { contractors } = req.body;
  if (!Array.isArray(contractors)) return res.status(400).json({ error: "contractors must be array" });
  let imported = 0;
  for (const c of contractors) {
    try {
      await pool.query(
        `INSERT INTO acc_contractors (organization_id,name,edrpou,ipn,vat_number,address)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [orgId, c.name, c.edrpou ?? null, c.ipn ?? null, c.vat_number ?? null, c.address ?? null],
      );
      imported++;
    } catch (_) {}
  }
  res.json({ imported });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — зведення
// ═══════════════════════════════════════════════════════════════════════════

router.get("/dashboard", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await seedChart(orgId);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [docsQ, vatQ, recQ, payQ, entQ] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*) as cnt, COALESCE(SUM(total),0) as total
       FROM acc_documents WHERE organization_id=$1
         AND EXTRACT(YEAR FROM doc_date)=$2 AND EXTRACT(MONTH FROM doc_date)=$3
       GROUP BY status`,
      [orgId, year, month],
    ),
    pool.query(
      `SELECT record_type, COALESCE(SUM(vat_amount),0) as vat
       FROM acc_vat_records WHERE organization_id=$1
         AND EXTRACT(YEAR FROM record_date)=$2 AND EXTRACT(MONTH FROM record_date)=$3
       GROUP BY record_type`,
      [orgId, year, month],
    ),
    pool.query(
      `SELECT COALESCE(SUM(e.amount),0) as amount
       FROM acc_entries e JOIN acc_accounts a ON a.id=e.debit_account_id
       WHERE e.organization_id=$1 AND a.code LIKE '36%'`, [orgId],
    ),
    pool.query(
      `SELECT COALESCE(SUM(e.amount),0) as amount
       FROM acc_entries e JOIN acc_accounts a ON a.id=e.credit_account_id
       WHERE e.organization_id=$1 AND a.code LIKE '63%'`, [orgId],
    ),
    pool.query(
      `SELECT COUNT(*) as cnt FROM acc_entries WHERE organization_id=$1
         AND EXTRACT(YEAR FROM entry_date)=$2 AND EXTRACT(MONTH FROM entry_date)=$3`,
      [orgId, year, month],
    ),
  ]);

  const issued   = vatQ.rows.find((r: any) => r.record_type === "issued")   ?? { vat: 0 };
  const received = vatQ.rows.find((r: any) => r.record_type === "received") ?? { vat: 0 };
  const vatToPay = Math.max(0, parseFloat(issued.vat) - parseFloat(received.vat));

  res.json({
    period: { year, month },
    documents: docsQ.rows,
    vat: {
      to_pay:    vatToPay,
      liability: parseFloat(issued.vat)   || 0,
      credit:    parseFloat(received.vat) || 0,
    },
    receivables: parseFloat(recQ.rows[0]?.amount ?? 0),
    payables:    parseFloat(payQ.rows[0]?.amount ?? 0),
    entries_count: parseInt(entQ.rows[0]?.cnt ?? 0),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOURIST TAX — Туристичний збір (ст. 268 ПКУ)
// ═══════════════════════════════════════════════════════════════════════════

async function ensureTouristTaxTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_tourist_tax (
      id               SERIAL PRIMARY KEY,
      organization_id  INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      record_date      DATE NOT NULL,
      guest_name       VARCHAR(200),
      check_in         DATE NOT NULL,
      check_out        DATE NOT NULL,
      nights           INT NOT NULL DEFAULT 1,
      rate_per_night   NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount           NUMERIC(14,2) GENERATED ALWAYS AS (nights * rate_per_night) STORED,
      is_paid          BOOLEAN NOT NULL DEFAULT false,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_tourist_tax_org ON acc_tourist_tax(organization_id);
    CREATE INDEX IF NOT EXISTS idx_acc_tourist_tax_date ON acc_tourist_tax(record_date);
  `);
}

router.get("/tourist-tax", async (req: any, res) => {
  await ensureTouristTaxTable();
  const orgId = await resolveOrgId(req);
  const { from, to, year, month } = req.query as Record<string, string>;
  let where = "WHERE organization_id=$1";
  const params: any[] = [orgId];
  if (year && month) {
    params.push(parseInt(year), parseInt(month));
    where += ` AND EXTRACT(YEAR FROM record_date)=$${params.length-1} AND EXTRACT(MONTH FROM record_date)=$${params.length}`;
  } else if (from && to) {
    params.push(from, to);
    where += ` AND record_date>=$${params.length-1} AND record_date<=$${params.length}`;
  }
  const { rows } = await pool.query(`SELECT * FROM acc_tourist_tax ${where} ORDER BY record_date DESC, id DESC`, params);
  res.json(rows);
});

router.post("/tourist-tax", async (req: any, res) => {
  await ensureTouristTaxTable();
  const orgId = await resolveOrgId(req);
  const { record_date, guest_name, check_in, check_out, nights, rate_per_night, notes } = req.body;
  if (!record_date || !check_in || !check_out || !nights || rate_per_night == null)
    return res.status(400).json({ error: "Missing required fields" });
  const { rows } = await pool.query(
    `INSERT INTO acc_tourist_tax (organization_id, record_date, guest_name, check_in, check_out, nights, rate_per_night, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [orgId, record_date, guest_name || null, check_in, check_out, parseInt(nights), parseFloat(rate_per_night), notes || null],
  );
  res.json(rows[0]);
});

router.patch("/tourist-tax/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { id } = req.params;
  const { is_paid, rate_per_night, nights, notes, guest_name, check_in, check_out } = req.body;
  await pool.query(
    `UPDATE acc_tourist_tax SET
       is_paid=$3, rate_per_night=COALESCE($4,rate_per_night), nights=COALESCE($5,nights),
       notes=COALESCE($6,notes), guest_name=COALESCE($7,guest_name),
       check_in=COALESCE($8::date,check_in), check_out=COALESCE($9::date,check_out)
     WHERE id=$1 AND organization_id=$2`,
    [id, orgId, is_paid ?? false, rate_per_night ?? null, nights ?? null, notes ?? null, guest_name ?? null, check_in ?? null, check_out ?? null],
  );
  res.json({ ok: true });
});

router.delete("/tourist-tax/:id", requireRole("admin","owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await pool.query(`DELETE FROM acc_tourist_tax WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  res.json({ ok: true });
});

// Monthly report: nights, guests, total collected
router.get("/tourist-tax/report", async (req: any, res) => {
  await ensureTouristTaxTable();
  const orgId = await resolveOrgId(req);
  const { year } = req.query as Record<string, string>;
  const y = parseInt(year ?? new Date().getFullYear().toString());
  const { rows } = await pool.query(
    `SELECT
       EXTRACT(MONTH FROM record_date)::int AS month,
       COUNT(*) AS guests_count,
       SUM(nights) AS total_nights,
       SUM(amount) AS total_amount,
       SUM(CASE WHEN is_paid THEN amount ELSE 0 END) AS paid_amount,
       SUM(CASE WHEN NOT is_paid THEN amount ELSE 0 END) AS unpaid_amount
     FROM acc_tourist_tax
     WHERE organization_id=$1 AND EXTRACT(YEAR FROM record_date)=$2
     GROUP BY EXTRACT(MONTH FROM record_date)
     ORDER BY month`,
    [orgId, y],
  );
  const totalYear = rows.reduce((s: any, r: any) => ({
    guests: s.guests + parseInt(r.guests_count),
    nights: s.nights + parseInt(r.total_nights),
    amount: s.amount + parseFloat(r.total_amount),
  }), { guests: 0, nights: 0, amount: 0 });
  res.json({ year: y, months: rows, total: totalYear });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYROLL — Зарплата (нарахування, ПДФО 18%, ВЗ 1.5%, ЄСВ 22%)
// ═══════════════════════════════════════════════════════════════════════════

async function ensurePayrollTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_payroll_employees (
      id              SERIAL PRIMARY KEY,
      organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      full_name       VARCHAR(200) NOT NULL,
      position        VARCHAR(200),
      ipn             VARCHAR(20),
      base_salary     NUMERIC(14,2) NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      hire_date       DATE,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_payroll_emp_org ON acc_payroll_employees(organization_id);

    CREATE TABLE IF NOT EXISTS acc_payroll_accruals (
      id              SERIAL PRIMARY KEY,
      organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id     INT NOT NULL REFERENCES acc_payroll_employees(id) ON DELETE CASCADE,
      period_year     INT NOT NULL,
      period_month    INT NOT NULL,
      accrual_type    VARCHAR(30) NOT NULL DEFAULT 'salary',
      gross_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
      pdfo_amount     NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(gross_amount * 0.18, 2)) STORED,
      vz_amount       NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(gross_amount * 0.015, 2)) STORED,
      esv_amount      NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(gross_amount * 0.22, 2)) STORED,
      net_amount      NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(gross_amount * (1 - 0.18 - 0.015), 2)) STORED,
      is_posted       BOOLEAN NOT NULL DEFAULT false,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(employee_id, period_year, period_month, accrual_type)
    );
    CREATE INDEX IF NOT EXISTS idx_acc_payroll_acc_org ON acc_payroll_accruals(organization_id);
  `);
}

router.get("/payroll/employees", async (req: any, res) => {
  await ensurePayrollTables();
  const orgId = await resolveOrgId(req);
  const { rows } = await pool.query(
    `SELECT * FROM acc_payroll_employees WHERE organization_id=$1 ORDER BY full_name`,
    [orgId],
  );
  res.json(rows);
});

router.post("/payroll/employees", async (req: any, res) => {
  await ensurePayrollTables();
  const orgId = await resolveOrgId(req);
  const { full_name, position, ipn, base_salary, hire_date, notes } = req.body;
  if (!full_name) return res.status(400).json({ error: "full_name required" });
  const { rows } = await pool.query(
    `INSERT INTO acc_payroll_employees (organization_id,full_name,position,ipn,base_salary,hire_date,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, full_name, position||null, ipn||null, parseFloat(base_salary)||0, hire_date||null, notes||null],
  );
  res.json(rows[0]);
});

router.patch("/payroll/employees/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { full_name, position, ipn, base_salary, hire_date, is_active, notes } = req.body;
  await pool.query(
    `UPDATE acc_payroll_employees SET
       full_name=COALESCE($3,full_name), position=COALESCE($4,position), ipn=COALESCE($5,ipn),
       base_salary=COALESCE($6,base_salary), hire_date=COALESCE($7::date,hire_date),
       is_active=COALESCE($8,is_active), notes=COALESCE($9,notes)
     WHERE id=$1 AND organization_id=$2`,
    [req.params.id, orgId, full_name||null, position||null, ipn||null,
     base_salary ? parseFloat(base_salary) : null, hire_date||null, is_active??null, notes||null],
  );
  res.json({ ok: true });
});

router.delete("/payroll/employees/:id", requireRole("admin","owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await pool.query(`DELETE FROM acc_payroll_employees WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  res.json({ ok: true });
});

router.get("/payroll/accruals", async (req: any, res) => {
  await ensurePayrollTables();
  const orgId = await resolveOrgId(req);
  const { year, month } = req.query as Record<string, string>;
  const params: any[] = [orgId];
  let where = "WHERE a.organization_id=$1";
  if (year)  { params.push(parseInt(year));  where += ` AND a.period_year=$${params.length}`; }
  if (month) { params.push(parseInt(month)); where += ` AND a.period_month=$${params.length}`; }
  const { rows } = await pool.query(
    `SELECT a.*, e.full_name, e.position, e.ipn
     FROM acc_payroll_accruals a JOIN acc_payroll_employees e ON e.id=a.employee_id
     ${where} ORDER BY e.full_name, a.period_year, a.period_month`,
    params,
  );
  res.json(rows);
});

router.post("/payroll/accruals", async (req: any, res) => {
  await ensurePayrollTables();
  const orgId = await resolveOrgId(req);
  const { employee_id, period_year, period_month, accrual_type, gross_amount, notes } = req.body;
  if (!employee_id || !period_year || !period_month || !gross_amount)
    return res.status(400).json({ error: "Missing required fields" });
  const { rows } = await pool.query(
    `INSERT INTO acc_payroll_accruals (organization_id,employee_id,period_year,period_month,accrual_type,gross_amount,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (employee_id,period_year,period_month,accrual_type) DO UPDATE
       SET gross_amount=$6, notes=COALESCE($7,acc_payroll_accruals.notes)
     RETURNING *`,
    [orgId, parseInt(employee_id), parseInt(period_year), parseInt(period_month),
     accrual_type||"salary", parseFloat(gross_amount), notes||null],
  );
  res.json(rows[0]);
});

// Відомість нарахування зарплати за місяць
router.get("/payroll/sheet", async (req: any, res) => {
  await ensurePayrollTables();
  const orgId = await resolveOrgId(req);
  const { year, month } = req.query as Record<string, string>;
  const y = parseInt(year ?? new Date().getFullYear().toString());
  const m = parseInt(month ?? (new Date().getMonth() + 1).toString());
  const { rows } = await pool.query(
    `SELECT e.id as employee_id, e.full_name, e.position, e.ipn,
       COALESCE(SUM(a.gross_amount),0) as gross_total,
       COALESCE(SUM(a.pdfo_amount),0)  as pdfo_total,
       COALESCE(SUM(a.vz_amount),0)    as vz_total,
       COALESCE(SUM(a.esv_amount),0)   as esv_total,
       COALESCE(SUM(a.net_amount),0)   as net_total,
       BOOL_OR(a.is_posted) as is_posted
     FROM acc_payroll_employees e
     LEFT JOIN acc_payroll_accruals a ON a.employee_id=e.id
       AND a.period_year=$2 AND a.period_month=$3 AND a.organization_id=$1
     WHERE e.organization_id=$1 AND e.is_active=true
     GROUP BY e.id, e.full_name, e.position, e.ipn
     ORDER BY e.full_name`,
    [orgId, y, m],
  );
  const totals = rows.reduce((s: any, r: any) => ({
    gross: s.gross + parseFloat(r.gross_total),
    pdfo:  s.pdfo  + parseFloat(r.pdfo_total),
    vz:    s.vz    + parseFloat(r.vz_total),
    esv:   s.esv   + parseFloat(r.esv_total),
    net:   s.net   + parseFloat(r.net_total),
  }), { gross: 0, pdfo: 0, vz: 0, esv: 0, net: 0 });
  res.json({ period: { year: y, month: m }, employees: rows, totals });
});

// ── Timesheet ──────────────────────────────────────────────────────────────

async function ensureTimesheetTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_payroll_timesheet (
      id              SERIAL PRIMARY KEY,
      organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id     INT NOT NULL REFERENCES acc_payroll_employees(id) ON DELETE CASCADE,
      period_year     INT NOT NULL,
      period_month    INT NOT NULL,
      day_num         INT NOT NULL CHECK(day_num BETWEEN 1 AND 31),
      day_code        VARCHAR(3) NOT NULL DEFAULT 'Р',
      hours           NUMERIC(4,1) NOT NULL DEFAULT 8,
      UNIQUE(employee_id, period_year, period_month, day_num)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_ts_org ON acc_payroll_timesheet(organization_id, period_year, period_month);
  `);
}

// GET /payroll/timesheet?year=&month= — повна сітка (employees × days)
router.get("/payroll/timesheet", async (req: any, res) => {
  try {
    await ensurePayrollTables();
    await ensureTimesheetTable();
    const orgId = await resolveOrgId(req);
    const y = parseInt(String(req.query.year  ?? new Date().getFullYear()));
    const m = parseInt(String(req.query.month ?? new Date().getMonth() + 1));

    const { rows: emps } = await pool.query(
      `SELECT DISTINCT e.id, e.full_name, e.position
       FROM acc_payroll_employees e
       WHERE e.organization_id=$1
         AND (e.is_active=true OR EXISTS (
           SELECT 1 FROM acc_payroll_timesheet t
           WHERE t.employee_id=e.id AND t.organization_id=$1
             AND t.period_year=$2 AND t.period_month=$3
         ))
       ORDER BY e.full_name`,
      [orgId, y, m],
    );

    const { rows: entries } = await pool.query(
      `SELECT employee_id, day_num, day_code, hours FROM acc_payroll_timesheet
       WHERE organization_id=$1 AND period_year=$2 AND period_month=$3`,
      [orgId, y, m],
    );

    // Build map: employee_id → { day_num → {code, hours} }
    const map: Record<number, Record<number, { code: string; hours: number }>> = {};
    for (const e of entries) {
      if (!map[e.employee_id]) map[e.employee_id] = {};
      map[e.employee_id][e.day_num] = { code: e.day_code, hours: +e.hours };
    }

    // Days in month
    const daysInMonth = new Date(y, m, 0).getDate();

    // Build rows with summary
    const rows = emps.map((emp: any) => {
      const empMap = map[emp.id] ?? {};
      const days: any[] = [];
      let workDays = 0, sickDays = 0, vacDays = 0, tripDays = 0, totalHours = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const entry = empMap[d];
        const dow = new Date(y, m - 1, d).getDay(); // 0=Sun,6=Sat
        const isWeekend = dow === 0 || dow === 6;
        const code = entry?.code ?? (isWeekend ? "В" : "Р");
        const hours = entry?.hours ?? (isWeekend ? 0 : 8);
        days.push({ d, code, hours, isWeekend });
        if (code === "Р") { workDays++; totalHours += hours; }
        else if (code === "Л") sickDays++;
        else if (code === "ВД") vacDays++;
        else if (code === "К") { tripDays++; totalHours += hours; }
      }
      return { employee_id: emp.id, full_name: emp.full_name, position: emp.position, days, workDays, sickDays, vacDays, tripDays, totalHours };
    });

    res.json({ year: y, month: m, days_in_month: daysInMonth, rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /payroll/timesheet — upsert single cell
router.post("/payroll/timesheet", async (req: any, res) => {
  try {
    await ensureTimesheetTable();
    const orgId = await resolveOrgId(req);
    const { employee_id, period_year, period_month, day_num, day_code, hours } = req.body;
    if (!employee_id || !period_year || !period_month || !day_num)
      return res.status(400).json({ error: "employee_id, period_year, period_month, day_num required" });
    const { rows } = await pool.query(`
      INSERT INTO acc_payroll_timesheet (organization_id, employee_id, period_year, period_month, day_num, day_code, hours)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (employee_id, period_year, period_month, day_num)
      DO UPDATE SET day_code=$6, hours=$7
      RETURNING *
    `, [orgId, employee_id, period_year, period_month, day_num, day_code ?? "Р", hours ?? 8]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /payroll/timesheet/fill — авто-заповнення місяця для співробітника
router.post("/payroll/timesheet/fill", async (req: any, res) => {
  try {
    await ensureTimesheetTable();
    const orgId = await resolveOrgId(req);
    const { employee_id, period_year, period_month, hours_per_day } = req.body;
    const y = parseInt(String(period_year));
    const m = parseInt(String(period_month));
    const hpd = parseFloat(String(hours_per_day ?? 8));
    const daysInMonth = new Date(y, m, 0).getDate();
    let filled = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(y, m - 1, d).getDay();
      const isWeekend = dow === 0 || dow === 6;
      await pool.query(`
        INSERT INTO acc_payroll_timesheet (organization_id, employee_id, period_year, period_month, day_num, day_code, hours)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (employee_id, period_year, period_month, day_num) DO NOTHING
      `, [orgId, employee_id, y, m, d, isWeekend ? "В" : "Р", isWeekend ? 0 : hpd]);
      filled++;
    }
    res.json({ ok: true, filled });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Statutory Reports ───────────────────────────────────────────────────────

// GET /payroll/report/d4?year=&month= — Додаток 4 (ЄСВ) до Об'єднаної звітності
router.get("/payroll/report/d4", async (req: any, res) => {
  try {
    await ensurePayrollTables();
    await ensureTimesheetTable();
    const orgId = await resolveOrgId(req);
    const y = parseInt(String(req.query.year  ?? new Date().getFullYear()));
    const m = parseInt(String(req.query.month ?? new Date().getMonth() + 1));

    const { rows } = await pool.query(`
      SELECT
        e.full_name,
        e.ipn,
        a.accrual_type,
        a.gross_amount,
        a.esv_amount,
        -- days worked from timesheet (or 0 if no timesheet)
        COALESCE(ts.work_days, 0) AS work_days,
        COALESCE(ts.total_hours, 0) AS total_hours
      FROM acc_payroll_accruals a
      JOIN acc_payroll_employees e ON e.id = a.employee_id
      LEFT JOIN (
        SELECT employee_id,
          COUNT(*) FILTER (WHERE day_code='Р') AS work_days,
          SUM(hours) AS total_hours
        FROM acc_payroll_timesheet
        WHERE organization_id=$1 AND period_year=$2 AND period_month=$3
        GROUP BY employee_id
      ) ts ON ts.employee_id = a.employee_id
      WHERE a.organization_id=$1 AND a.period_year=$2 AND a.period_month=$3
      ORDER BY e.full_name, a.accrual_type
    `, [orgId, y, m]);

    // Map accrual_type → D4 category code (ознака)
    const oznakaMap: Record<string, number> = { salary: 1, bonus: 1, sick: 29, vacation: 39, other: 1 };

    // Group by employee
    const byEmp: Record<string, any> = {};
    for (const r of rows) {
      const key = r.ipn ?? r.full_name;
      if (!byEmp[key]) byEmp[key] = {
        full_name: r.full_name, ipn: r.ipn ?? "—",
        rows: [], total_gross: 0, total_esv: 0,
        work_days: +r.work_days, total_hours: +r.total_hours,
      };
      byEmp[key].rows.push({
        oznaka: oznakaMap[r.accrual_type] ?? 1,
        accrual_type: r.accrual_type,
        gross: +r.gross_amount,
        esv:   +r.esv_amount,
      });
      byEmp[key].total_gross += +r.gross_amount;
      byEmp[key].total_esv  += +r.esv_amount;
    }

    const totals = Object.values(byEmp).reduce((s: any, e: any) => ({
      gross: s.gross + e.total_gross,
      esv:   s.esv  + e.total_esv,
    }), { gross: 0, esv: 0 });

    res.json({
      report_type: "D4",
      period: { year: y, month: m },
      employees: Object.values(byEmp),
      totals,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /payroll/report/1df?year=&quarter= — Форма 1-ДФ (ПДФО/ВЗ квартальна)
router.get("/payroll/report/1df", async (req: any, res) => {
  try {
    await ensurePayrollTables();
    const orgId = await resolveOrgId(req);
    const y = parseInt(String(req.query.year    ?? new Date().getFullYear()));
    const q = parseInt(String(req.query.quarter ?? Math.ceil((new Date().getMonth() + 1) / 3)));
    const monthFrom = (q - 1) * 3 + 1;
    const monthTo   = q * 3;

    const { rows } = await pool.query(`
      SELECT
        e.full_name,
        e.ipn,
        SUM(a.gross_amount) AS gross_accrued,
        SUM(a.gross_amount) AS gross_paid,
        SUM(a.pdfo_amount)  AS pdfo_accrued,
        SUM(a.pdfo_amount)  AS pdfo_paid,
        SUM(a.vz_amount)    AS vz_accrued,
        SUM(a.vz_amount)    AS vz_paid,
        COUNT(DISTINCT a.period_month) AS months_count
      FROM acc_payroll_accruals a
      JOIN acc_payroll_employees e ON e.id = a.employee_id
      WHERE a.organization_id=$1 AND a.period_year=$2
        AND a.period_month BETWEEN $3 AND $4
      GROUP BY e.id, e.full_name, e.ipn
      ORDER BY e.full_name
    `, [orgId, y, monthFrom, monthTo]);

    const totals = rows.reduce((s: any, r: any) => ({
      gross_accrued: s.gross_accrued + +r.gross_accrued,
      pdfo_accrued:  s.pdfo_accrued  + +r.pdfo_accrued,
      vz_accrued:    s.vz_accrued    + +r.vz_accrued,
    }), { gross_accrued: 0, pdfo_accrued: 0, vz_accrued: 0 });

    res.json({
      report_type: "1DF",
      period: { year: y, quarter: q, month_from: monthFrom, month_to: monthTo },
      employees: rows.map((r: any, i: number) => ({
        row_num: i + 1,
        full_name: r.full_name,
        ipn: r.ipn ?? "—",
        oznaka_dokhodu: 101, // salary
        gross_accrued: +r.gross_accrued,
        gross_paid:    +r.gross_paid,
        pdfo_accrued:  +r.pdfo_accrued,
        pdfo_paid:     +r.pdfo_paid,
        vz_accrued:    +r.vz_accrued,
        vz_paid:       +r.vz_paid,
        months_count:  +r.months_count,
        sign_of_income: "1", // hired employee
      })),
      totals,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /payroll/payslip/:employee_id?year=&month= — розрахунковий листок
router.get("/payroll/payslip/:employee_id", async (req: any, res) => {
  try {
    await ensurePayrollTables();
    await ensureTimesheetTable();
    const orgId = await resolveOrgId(req);
    const empId = parseInt(req.params.employee_id);
    const y = parseInt(String(req.query.year  ?? new Date().getFullYear()));
    const m = parseInt(String(req.query.month ?? new Date().getMonth() + 1));

    const { rows: empRows } = await pool.query(
      `SELECT * FROM acc_payroll_employees WHERE id=$1 AND organization_id=$2`,
      [empId, orgId],
    );
    if (!empRows[0]) return res.status(404).json({ error: "Employee not found" });
    const emp = empRows[0];

    const { rows: accruals } = await pool.query(
      `SELECT * FROM acc_payroll_accruals WHERE employee_id=$1 AND period_year=$2 AND period_month=$3 AND organization_id=$4`,
      [empId, y, m, orgId],
    );

    const { rows: tsRows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE day_code='Р') AS work_days,
        COUNT(*) FILTER (WHERE day_code='Л') AS sick_days,
        COUNT(*) FILTER (WHERE day_code='ВД') AS vacation_days,
        SUM(hours) FILTER (WHERE day_code='Р') AS total_hours
      FROM acc_payroll_timesheet
      WHERE employee_id=$1 AND period_year=$2 AND period_month=$3 AND organization_id=$4
    `, [empId, y, m, orgId]);

    const totals = accruals.reduce((s: any, a: any) => ({
      gross: s.gross + +a.gross_amount,
      pdfo:  s.pdfo  + +a.pdfo_amount,
      vz:    s.vz    + +a.vz_amount,
      esv:   s.esv   + +a.esv_amount,
      net:   s.net   + +a.net_amount,
    }), { gross: 0, pdfo: 0, vz: 0, esv: 0, net: 0 });

    res.json({
      employee: emp,
      period: { year: y, month: m },
      accruals,
      timesheet: tsRows[0] ?? { work_days: 0, sick_days: 0, vacation_days: 0, total_hours: 0 },
      totals,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Провести зарплату (створити проводки 661/641/642/651)
router.post("/payroll/post", requireRole("admin","owner"), async (req: any, res) => {
  await ensurePayrollTables();
  const orgId = await resolveOrgId(req);
  const { year, month } = req.body;
  const y = parseInt(year), m = parseInt(month);
  if (!y || !m) return res.status(400).json({ error: "year and month required" });

  const sheetQ = await pool.query(
    `SELECT COALESCE(SUM(gross_amount),0) as gross, COALESCE(SUM(pdfo_amount),0) as pdfo,
            COALESCE(SUM(vz_amount),0) as vz, COALESCE(SUM(esv_amount),0) as esv
     FROM acc_payroll_accruals WHERE organization_id=$1 AND period_year=$2 AND period_month=$3 AND NOT is_posted`,
    [orgId, y, m],
  );
  const sheet = sheetQ.rows[0];
  if (parseFloat(sheet.gross) === 0) return res.status(400).json({ error: "Немає непроведених нарахувань" });

  // Ensure accounts exist
  await seedChart(orgId);
  const getAcc = async (code: string) => {
    const q = await pool.query(`SELECT id FROM acc_accounts WHERE organization_id=$1 AND code=$2`, [orgId, code]);
    return q.rows[0]?.id;
  };
  const [acc92, acc661, acc641, acc642, acc651, acc311] = await Promise.all([
    getAcc("92"), getAcc("661"), getAcc("641"), getAcc("642"), getAcc("651"), getAcc("311"),
  ]);

  const period = `${y}-${String(m).padStart(2,"0")}`;
  const entries: any[] = [];

  if (parseFloat(sheet.gross) > 0 && acc92 && acc661) {
    entries.push({ dt: acc92, ct: acc661, amount: parseFloat(sheet.gross), desc: `[ЗАРПЛАТА ${period}] Нарахування 92→661` });
  }
  if (parseFloat(sheet.pdfo) > 0 && acc661 && acc641) {
    entries.push({ dt: acc661, ct: acc641, amount: parseFloat(sheet.pdfo), desc: `[ЗАРПЛАТА ${period}] ПДФО 18% 661→641` });
  }
  if (parseFloat(sheet.vz) > 0 && acc661 && acc642) {
    entries.push({ dt: acc661, ct: acc642, amount: parseFloat(sheet.vz), desc: `[ЗАРПЛАТА ${period}] ВЗ 1.5% 661→642` });
  }
  if (parseFloat(sheet.esv) > 0 && acc92 && acc651) {
    entries.push({ dt: acc92, ct: acc651, amount: parseFloat(sheet.esv), desc: `[ЗАРПЛАТА ${period}] ЄСВ 22% 92→651` });
  }

  const now = new Date();
  const entryDate = new Date(y, m - 1, now.getMonth() + 1 === m && now.getFullYear() === y ? now.getDate() : new Date(y, m, 0).getDate());

  for (const e of entries) {
    await pool.query(
      `INSERT INTO acc_entries (organization_id,entry_date,debit_account_id,credit_account_id,amount,description,is_manual,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7)`,
      [orgId, entryDate.toISOString().split("T")[0], e.dt, e.ct, e.amount, e.desc, req.user.id],
    );
  }
  await pool.query(
    `UPDATE acc_payroll_accruals SET is_posted=true WHERE organization_id=$1 AND period_year=$2 AND period_month=$3`,
    [orgId, y, m],
  );
  res.json({ ok: true, entriesCreated: entries.length, gross: parseFloat(sheet.gross), esv: parseFloat(sheet.esv) });
});

// ═══════════════════════════════════════════════════════════════════════════
// FIXED ASSETS — Основні засоби (рах. 10x, амортизація 131)
// ═══════════════════════════════════════════════════════════════════════════

async function ensureFixedAssetsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_fixed_assets (
      id                  SERIAL PRIMARY KEY,
      organization_id     INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name                VARCHAR(300) NOT NULL,
      inventory_number    VARCHAR(50),
      account_code        VARCHAR(10) NOT NULL DEFAULT '104',
      initial_cost        NUMERIC(16,2) NOT NULL DEFAULT 0,
      liquidation_value   NUMERIC(16,2) NOT NULL DEFAULT 0,
      useful_life_months  INT NOT NULL DEFAULT 60,
      depreciation_method VARCHAR(20) NOT NULL DEFAULT 'straight-line',
      start_date          DATE NOT NULL,
      category            VARCHAR(100),
      notes               TEXT,
      is_disposed         BOOLEAN NOT NULL DEFAULT false,
      disposed_at         DATE,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_fa_org ON acc_fixed_assets(organization_id);

    CREATE TABLE IF NOT EXISTS acc_asset_depreciation (
      id              SERIAL PRIMARY KEY,
      asset_id        INT NOT NULL REFERENCES acc_fixed_assets(id) ON DELETE CASCADE,
      organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      period_year     INT NOT NULL,
      period_month    INT NOT NULL,
      amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
      accumulated     NUMERIC(14,2) NOT NULL DEFAULT 0,
      entry_id        INT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(asset_id, period_year, period_month)
    );
    CREATE INDEX IF NOT EXISTS idx_acc_depr_org ON acc_asset_depreciation(organization_id);
  `);
}

router.get("/fixed-assets", async (req: any, res) => {
  await ensureFixedAssetsTables();
  const orgId = await resolveOrgId(req);
  const { include_disposed } = req.query;
  const { rows } = await pool.query(
    `SELECT fa.*,
       COALESCE((SELECT SUM(d.amount) FROM acc_asset_depreciation d WHERE d.asset_id=fa.id), 0) AS accumulated_depreciation,
       fa.initial_cost - COALESCE((SELECT SUM(d.amount) FROM acc_asset_depreciation d WHERE d.asset_id=fa.id), 0) AS residual_value
     FROM acc_fixed_assets fa
     WHERE fa.organization_id=$1 ${include_disposed === "true" ? "" : "AND fa.is_disposed=false"}
     ORDER BY fa.account_code, fa.name`,
    [orgId],
  );
  res.json(rows);
});

router.post("/fixed-assets", async (req: any, res) => {
  await ensureFixedAssetsTables();
  const orgId = await resolveOrgId(req);
  const { name, inventory_number, account_code, initial_cost, liquidation_value, useful_life_months, depreciation_method, start_date, category, notes } = req.body;
  if (!name || !initial_cost || !start_date) return res.status(400).json({ error: "name, initial_cost, start_date required" });
  const { rows } = await pool.query(
    `INSERT INTO acc_fixed_assets (organization_id,name,inventory_number,account_code,initial_cost,liquidation_value,useful_life_months,depreciation_method,start_date,category,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [orgId, name, inventory_number||null, account_code||"104", parseFloat(initial_cost), parseFloat(liquidation_value)||0,
     parseInt(useful_life_months)||60, depreciation_method||"straight-line", start_date, category||null, notes||null],
  );
  res.json(rows[0]);
});

router.patch("/fixed-assets/:id", async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  const { name, inventory_number, account_code, useful_life_months, depreciation_method, category, notes, is_disposed, disposed_at } = req.body;
  await pool.query(
    `UPDATE acc_fixed_assets SET
       name=COALESCE($3,name), inventory_number=COALESCE($4,inventory_number),
       account_code=COALESCE($5,account_code), useful_life_months=COALESCE($6,useful_life_months),
       depreciation_method=COALESCE($7,depreciation_method), category=COALESCE($8,category),
       notes=COALESCE($9,notes), is_disposed=COALESCE($10,is_disposed),
       disposed_at=COALESCE($11::date,disposed_at)
     WHERE id=$1 AND organization_id=$2`,
    [req.params.id, orgId, name||null, inventory_number||null, account_code||null,
     useful_life_months ? parseInt(useful_life_months) : null, depreciation_method||null, category||null,
     notes||null, is_disposed??null, disposed_at||null],
  );
  res.json({ ok: true });
});

router.delete("/fixed-assets/:id", requireRole("admin","owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await pool.query(`DELETE FROM acc_fixed_assets WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  res.json({ ok: true });
});

// Нарахування амортизації за місяць для одного ОЗ
router.post("/fixed-assets/:id/depreciate", requireRole("admin","owner"), async (req: any, res) => {
  await ensureFixedAssetsTables();
  const orgId = await resolveOrgId(req);
  const assetId = parseInt(req.params.id);
  const { year, month } = req.body;
  const y = parseInt(year), m = parseInt(month);
  if (!y || !m) return res.status(400).json({ error: "year and month required" });

  const assetQ = await pool.query(`SELECT * FROM acc_fixed_assets WHERE id=$1 AND organization_id=$2`, [assetId, orgId]);
  if (!assetQ.rows.length) return res.status(404).json({ error: "Asset not found" });
  const asset = assetQ.rows[0];

  const accQ = await pool.query(`SELECT SUM(amount) as total FROM acc_asset_depreciation WHERE asset_id=$1`, [assetId]);
  const accumulated = parseFloat(accQ.rows[0]?.total ?? 0);
  const depreciableBase = parseFloat(asset.initial_cost) - parseFloat(asset.liquidation_value);
  const monthlyAmount = Math.max(0, Math.min(
    parseFloat((depreciableBase / asset.useful_life_months).toFixed(2)),
    depreciableBase - accumulated,
  ));

  if (monthlyAmount <= 0) return res.status(400).json({ error: "Амортизацію вже нараховано повністю або актив досяг ліквідаційної вартості" });

  // Create accounting entry: Дт 92 → Кт 131
  await seedChart(orgId);
  const [acc92Q, acc131Q] = await Promise.all([
    pool.query(`SELECT id FROM acc_accounts WHERE organization_id=$1 AND code='92'`, [orgId]),
    pool.query(`SELECT id FROM acc_accounts WHERE organization_id=$1 AND code='131'`, [orgId]),
  ]);
  const acc92  = acc92Q.rows[0]?.id;
  const acc131 = acc131Q.rows[0]?.id;
  let entryId: number | null = null;

  if (acc92 && acc131) {
    const entryDate = `${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`;
    const eQ = await pool.query(
      `INSERT INTO acc_entries (organization_id,entry_date,debit_account_id,credit_account_id,amount,description,is_manual,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING id`,
      [orgId, entryDate, acc92, acc131, monthlyAmount, `[АМОРТИЗАЦІЯ ${y}-${String(m).padStart(2,"0")}] ${asset.name}`, req.user.id],
    );
    entryId = eQ.rows[0].id;
  }

  const { rows } = await pool.query(
    `INSERT INTO acc_asset_depreciation (asset_id,organization_id,period_year,period_month,amount,accumulated,entry_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (asset_id,period_year,period_month) DO UPDATE
       SET amount=$5, accumulated=$6, entry_id=$7
     RETURNING *`,
    [assetId, orgId, y, m, monthlyAmount, accumulated + monthlyAmount, entryId],
  );
  res.json({ ...rows[0], asset_name: asset.name });
});

// Відомість по ОЗ (усі активи з залишковою вартістю)
router.get("/fixed-assets/report", async (req: any, res) => {
  await ensureFixedAssetsTables();
  const orgId = await resolveOrgId(req);
  const { date } = req.query as Record<string, string>;
  const { rows } = await pool.query(
    `SELECT fa.*,
       COALESCE((SELECT SUM(d.amount) FROM acc_asset_depreciation d WHERE d.asset_id=fa.id
                 ${date ? "AND (d.period_year*100+d.period_month) <= (EXTRACT(YEAR FROM $2::date)*100+EXTRACT(MONTH FROM $2::date))::int" : ""}
                ), 0) AS accumulated_depreciation,
       fa.initial_cost - COALESCE((SELECT SUM(d.amount) FROM acc_asset_depreciation d WHERE d.asset_id=fa.id
                 ${date ? "AND (d.period_year*100+d.period_month) <= (EXTRACT(YEAR FROM $2::date)*100+EXTRACT(MONTH FROM $2::date))::int" : ""}
                ), 0) AS residual_value
     FROM acc_fixed_assets fa
     WHERE fa.organization_id=$1
     ORDER BY fa.account_code, fa.name`,
    date ? [orgId, date] : [orgId],
  );
  const totals = rows.reduce((s: any, r: any) => ({
    initial_cost:             s.initial_cost             + parseFloat(r.initial_cost),
    accumulated_depreciation: s.accumulated_depreciation + parseFloat(r.accumulated_depreciation),
    residual_value:           s.residual_value           + parseFloat(r.residual_value),
  }), { initial_cost: 0, accumulated_depreciation: 0, residual_value: 0 });
  res.json({ rows, totals, as_of: date ?? null });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG — незмінний журнал аудиту (Ст.9 Закону №996-XIV)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/audit-log", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = await resolveOrgId(req);
  await ensureKernelTables();
  const { entity_type, entity_id, action, limit = 200, offset = 0 } = req.query;
  let q = `SELECT a.*, u.name as user_display_name
           FROM acc_audit_log a
           LEFT JOIN users u ON u.id=a.user_id
           WHERE a.organization_id=$1`;
  const p: any[] = [orgId];
  if (entity_type) { p.push(entity_type); q += ` AND a.entity_type=$${p.length}`; }
  if (entity_id)   { p.push(entity_id);   q += ` AND a.entity_id=$${p.length}`; }
  if (action)      { p.push(`%${action}%`); q += ` AND a.action ILIKE $${p.length}`; }
  p.push(Number(limit), Number(offset));
  q += ` ORDER BY a.created_at DESC LIMIT $${p.length-1} OFFSET $${p.length}`;
  const { rows } = await pool.query(q, p);
  res.json({ rows, total: rows.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — TAX ENGINE
// ПДВ (ПКУ Розділ V) · ЄСВ (ЗУ №2464-VI) · ПДФО+ВЗ (ПКУ ст.167-168)
// Податок на прибуток 18% (ПКУ ст.133) · Туристичний збір (ПКУ ст.268)
// ═══════════════════════════════════════════════════════════════════════════

async function ensureTaxPaymentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acc_tax_payments (
      id              SERIAL PRIMARY KEY,
      organization_id INT  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      payment_date    DATE NOT NULL,
      tax_type        VARCHAR(30) NOT NULL,
      period_year     INT  NOT NULL,
      period_month    INT  NOT NULL,
      amount          NUMERIC(14,2) NOT NULL,
      bank_ref        VARCHAR(100),
      notes           TEXT,
      entry_id        INT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acc_tax_pay_org
      ON acc_tax_payments(organization_id, period_year, period_month);
  `);
}

async function ensureVatRecordsNotes() {
  await pool.query(`ALTER TABLE acc_vat_records ADD COLUMN IF NOT EXISTS notes TEXT`);
}

// --- POST /vat — manual VAT record creation + auto acc_entry
router.post("/vat", async (req: any, res) => {
  try {
    await ensureVatRecordsNotes();
    const orgId = await resolveOrgId(req);
    const { record_date, record_type, vat_rate, amount_excl_vat, vat_amount, contractor_id, notes } = req.body;
    if (!record_date || !record_type || vat_amount == null)
      return res.status(400).json({ error: "record_date, record_type, vat_amount required" });

    try { await assertPeriodOpen(orgId, record_date); }
    catch (e: any) { return res.status(e.statusCode ?? 422).json({ error: e.message }); }

    const rate      = parseFloat(String(vat_rate ?? 20));
    const vat       = parseFloat(String(vat_amount));
    const base      = parseFloat(String(amount_excl_vat ?? 0)) || (rate > 0 ? vat / (rate / 100) : 0);
    const periodId  = await ensurePeriod(orgId, new Date(record_date));

    const { rows } = await pool.query(
      `INSERT INTO acc_vat_records
         (organization_id, record_type, record_date, contractor_id,
          amount_excl_vat, vat_amount, vat_rate, period_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [orgId, record_type, record_date, contractor_id ?? null, base, vat, rate, periodId, notes ?? null],
    );

    // Auto accounting: issued → Дт 703 Кт 6411 | received → Дт 644 Кт 631
    await seedChart(orgId);
    const [debitCode, creditCode] = record_type === "issued"
      ? ["703", "6411"]
      : ["644", "631"];
    const debitId  = await getAccId(orgId, debitCode);
    const creditId = await getAccId(orgId, creditCode);
    let entryId: number | null = null;
    if (debitId && creditId && vat > 0) {
      const { rows: er } = await pool.query(
        `INSERT INTO acc_entries
           (organization_id,entry_date,period_id,debit_account_id,credit_account_id,
            amount,description,is_manual,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8) RETURNING id`,
        [orgId, record_date, periodId, debitId, creditId, vat,
         `ПДВ ${record_type === "issued" ? "зобов'язання" : "вхідний кредит"} ${vat}₴ (${rate}%)`,
         req.user?.userId ?? req.user?.id ?? null],
      );
      entryId = er[0]?.id ?? null;
    }

    await logAudit({
      organizationId: orgId, action: "vat_record_created", entityType: "vat_record",
      entityId: rows[0].id, userId: req.user?.userId ?? req.user?.id ?? null,
      afterData: rows[0], note: `ПДВ ${record_type} ${vat}₴ (${rate}%)`,
    });
    res.json({ ...rows[0], entry_id: entryId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- DELETE /vat/:id — remove VAT record
router.delete("/vat/:id", requireRole("admin", "owner"), async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { rows } = await pool.query(
      `DELETE FROM acc_vat_records WHERE id=$1 AND organization_id=$2 RETURNING *`,
      [req.params.id, orgId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    await logAudit({
      organizationId: orgId, action: "vat_record_deleted", entityType: "vat_record",
      entityId: rows[0].id, userId: req.user?.userId ?? req.user?.id ?? null,
      beforeData: rows[0], note: `Видалено ПДВ запис ${rows[0].vat_amount}₴`,
    });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- GET /tax-calendar — live tax calendar with real amounts from DB
router.get("/tax-calendar", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const now   = new Date();
    const y  = parseInt(String(req.query.year  ?? now.getFullYear()));
    const m  = parseInt(String(req.query.month ?? (now.getMonth() + 1)));
    const q  = Math.ceil(m / 3);

    await ensureTaxPaymentsTable();
    await ensurePayrollTables();
    await ensureTouristTaxTable();

    const [vatQ, payrollQ, touristQ, incQ, expQ, paidQ] = await Promise.all([
      pool.query(
        `SELECT record_type, COALESCE(SUM(vat_amount),0) as vat
         FROM acc_vat_records WHERE organization_id=$1
           AND EXTRACT(YEAR FROM record_date)=$2 AND EXTRACT(MONTH FROM record_date)=$3
         GROUP BY record_type`,
        [orgId, y, m],
      ),
      pool.query(
        `SELECT COALESCE(SUM(gross_amount),0) as gross,
                COALESCE(SUM(esv_amount),0)   as esv,
                COALESCE(SUM(pdfo_amount),0)  as pdfo,
                COALESCE(SUM(vz_amount),0)    as vz
         FROM acc_payroll_accruals
         WHERE organization_id=$1 AND period_year=$2 AND period_month=$3`,
        [orgId, y, m],
      ),
      pool.query(
        `SELECT COALESCE(SUM(CASE WHEN NOT is_paid THEN amount ELSE 0 END),0) as unpaid
         FROM acc_tourist_tax WHERE organization_id=$1
           AND EXTRACT(YEAR FROM record_date)=$2
           AND CEIL(EXTRACT(MONTH FROM record_date)/3.0) = $3`,
        [orgId, y, q],
      ),
      // Income (кл.7 — доходи) for quarter
      pool.query(
        `SELECT COALESCE(SUM(e.amount),0) as total
         FROM acc_entries e JOIN acc_accounts a ON a.id=e.credit_account_id
         WHERE e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
           AND CEIL(EXTRACT(MONTH FROM e.entry_date)/3.0)=$3 AND a.class=7`,
        [orgId, y, q],
      ),
      // Expenses (кл.9 — витрати) for quarter
      pool.query(
        `SELECT COALESCE(SUM(e.amount),0) as total
         FROM acc_entries e JOIN acc_accounts a ON a.id=e.debit_account_id
         WHERE e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
           AND CEIL(EXTRACT(MONTH FROM e.entry_date)/3.0)=$3 AND a.class=9`,
        [orgId, y, q],
      ),
      // Already paid taxes this period
      pool.query(
        `SELECT tax_type, COALESCE(SUM(amount),0) as paid
         FROM acc_tax_payments WHERE organization_id=$1
           AND period_year=$2 AND period_month=$3
         GROUP BY tax_type`,
        [orgId, y, m],
      ),
    ]);

    const paid = (type: string) =>
      parseFloat(paidQ.rows.find((r: any) => r.tax_type === type)?.paid ?? 0);

    const vatIssued   = parseFloat(vatQ.rows.find((r: any) => r.record_type === "issued")?.vat   ?? 0);
    const vatReceived = parseFloat(vatQ.rows.find((r: any) => r.record_type === "received")?.vat ?? 0);
    const vatToPay    = Math.max(0, vatIssued - vatReceived);
    const pw          = payrollQ.rows[0];
    const esv         = parseFloat(pw?.esv  ?? 0);
    const pdfo        = parseFloat(pw?.pdfo ?? 0);
    const vz          = parseFloat(pw?.vz   ?? 0);
    const touristUnpaid = parseFloat(touristQ.rows[0]?.unpaid ?? 0);
    const income      = parseFloat(incQ.rows[0]?.total ?? 0);
    const expenses    = parseFloat(expQ.rows[0]?.total ?? 0);
    const profit      = income - expenses;
    const incomeTax   = Math.max(0, profit * 0.18);

    const dt = (yr: number, mo0: number, day: number) =>
      new Date(yr, mo0, day).toISOString().slice(0, 10);

    const makeItem = (
      id: string, label: string, amount: number,
      deadline: string, type: string, tab: string, paidKey: string, hint: string,
    ) => {
      const paidAmt   = paid(paidKey);
      const remaining = Math.max(0, amount - paidAmt);
      const daysLeft  = Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86400000);
      const status    = amount === 0                       ? "zero"
                      : paidAmt >= amount                  ? "paid"
                      : daysLeft < 0                       ? "overdue"
                      : daysLeft <= 5                      ? "critical"
                      : daysLeft <= 14                     ? "warning"
                      :                                      "pending";
      return { id, label, amount, paid: paidAmt, remaining, deadline, days_left: daysLeft,
               status, type, tab, hint, period_year: y, period_month: m };
    };

    const items = [
      makeItem("vat_monthly",  "ПДВ декларація (Р18)",
        vatToPay,    dt(y, m, 20), "vat",     "acc-vat",
        "vat",     `Зобов'язання ${vatIssued.toFixed(2)} − Кредит ${vatReceived.toFixed(2)} = до сплати`),
      makeItem("esv_monthly",  "ЄСВ 22% (роботодавець)",
        esv,         dt(y, m, 20), "esv",     "acc-payroll",
        "esv",     "ЄСВ роботодавця 22% від нарахованої зарплати (ЗУ №2464-VI, ст.7)"),
      makeItem("pdfo_vz",      "ПДФО 18% + ВЗ 1.5%",
        pdfo + vz,   dt(y, m, 30), "pdfo",    "acc-payroll",
        "pdfo",    "Утримані з зарплати ПДФО 18% і військовий збір 1.5% (ПКУ ст.167-168)"),
      makeItem("tourist_q",    `Тур. збір Q${q}`,
        touristUnpaid, dt(y, q * 3, 10), "tourist", "acc-tourist",
        "tourist", "Туристичний збір (ст.268 ПКУ) — щоквартально до 10-го числа наступного місяця"),
      makeItem("income_tax_q", `Податок на прибуток Q${q}`,
        incomeTax,   dt(y, q * 3, 10), "income",  "acc-tax-hub",
        "income_tax", `Прибуток Q${q}: ${profit.toFixed(0)} ₴ × 18% (ПКУ ст.133). Квартальний аванс.`),
    ].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

    const totalPending = items.reduce((s, i) => s + i.remaining, 0);
    res.json({ year: y, month: m, quarter: q, items, total_pending: totalPending });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- GET /income-tax — quarterly corporate income tax (ПКУ ст.133, ставка 18%)
router.get("/income-tax", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const now   = new Date();
    const y = parseInt(String(req.query.year    ?? now.getFullYear()));
    const q = parseInt(String(req.query.quarter ?? Math.ceil((now.getMonth() + 1) / 3)));

    await ensureTaxPaymentsTable();

    const [incQ, expQ, paidQ, monthQ] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(e.amount),0) as total
         FROM acc_entries e JOIN acc_accounts a ON a.id=e.credit_account_id
         WHERE e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
           AND CEIL(EXTRACT(MONTH FROM e.entry_date)/3.0)=$3 AND a.class=7`,
        [orgId, y, q],
      ),
      pool.query(
        `SELECT COALESCE(SUM(e.amount),0) as total
         FROM acc_entries e JOIN acc_accounts a ON a.id=e.debit_account_id
         WHERE e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
           AND CEIL(EXTRACT(MONTH FROM e.entry_date)/3.0)=$3 AND a.class=9`,
        [orgId, y, q],
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount),0) as paid FROM acc_tax_payments
         WHERE organization_id=$1 AND tax_type='income_tax' AND period_year=$2
           AND period_month BETWEEN ($3-1)*3+1 AND $3*3`,
        [orgId, y, q],
      ),
      // Monthly breakdown by class
      pool.query(
        `SELECT EXTRACT(MONTH FROM e.entry_date) as month, a.class,
                a.type as acc_type, COALESCE(SUM(e.amount),0) as total
         FROM acc_entries e JOIN acc_accounts a ON a.id=e.debit_account_id
         WHERE e.organization_id=$1 AND EXTRACT(YEAR FROM e.entry_date)=$2
           AND CEIL(EXTRACT(MONTH FROM e.entry_date)/3.0)=$3
         GROUP BY 1,2,3 ORDER BY 1,2`,
        [orgId, y, q],
      ),
    ]);

    const income    = parseFloat(incQ.rows[0]?.total   ?? 0);
    const expenses  = parseFloat(expQ.rows[0]?.total   ?? 0);
    const profit    = income - expenses;
    const taxRate   = 0.18;
    const taxAmount = Math.max(0, profit * taxRate);
    const paidAmt   = parseFloat(paidQ.rows[0]?.paid   ?? 0);

    const months = [1, 2, 3].map(i => {
      const mo = (q - 1) * 3 + i;
      const inc = monthQ.rows.filter((r: any) => +r.month === mo && r.class === 7)
                            .reduce((s: number, r: any) => s + parseFloat(r.total), 0);
      const exp = monthQ.rows.filter((r: any) => +r.month === mo && r.class === 9)
                            .reduce((s: number, r: any) => s + parseFloat(r.total), 0);
      return { month: mo, income: inc, expenses: exp, profit: inc - exp };
    });

    res.json({
      year: y, quarter: q,
      income, expenses, profit,
      tax_rate: taxRate, tax_amount: taxAmount,
      paid: paidAmt, to_pay: Math.max(0, taxAmount - paidAmt),
      months,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- GET /tax-payments — list registered payments
router.get("/tax-payments", async (req: any, res) => {
  try {
    await ensureTaxPaymentsTable();
    const orgId = await resolveOrgId(req);
    const { year, month, tax_type, limit = 50, offset = 0 } = req.query;
    let q = `SELECT * FROM acc_tax_payments WHERE organization_id=$1`;
    const p: any[] = [orgId];
    if (year)     { p.push(year);     q += ` AND period_year=$${p.length}`; }
    if (month)    { p.push(month);    q += ` AND period_month=$${p.length}`; }
    if (tax_type) { p.push(tax_type); q += ` AND tax_type=$${p.length}`; }
    p.push(Number(limit), Number(offset));
    q += ` ORDER BY payment_date DESC LIMIT $${p.length - 1} OFFSET $${p.length}`;
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- POST /tax-payments — register a tax payment → creates acc_entry Дт 64x Кт 311
router.post("/tax-payments", async (req: any, res) => {
  try {
    await ensureTaxPaymentsTable();
    const orgId = await resolveOrgId(req);
    const { payment_date, tax_type, period_year, period_month, amount, bank_ref, notes } = req.body;
    if (!payment_date || !tax_type || amount == null || !period_year || !period_month)
      return res.status(400).json({ error: "payment_date, tax_type, amount, period_year, period_month required" });

    try { await assertPeriodOpen(orgId, payment_date); }
    catch (e: any) { return res.status(e.statusCode ?? 422).json({ error: e.message }); }

    // Debit = tax liability account, Credit = bank 311
    const DEBIT_MAP: Record<string, string> = {
      vat: "6411", esv: "651", pdfo: "641", vz: "642",
      income_tax: "6412", tourist: "64",
    };
    await seedChart(orgId);
    const debitCode = DEBIT_MAP[tax_type] ?? "641";
    const periodId  = await ensurePeriod(orgId, new Date(payment_date));
    const debitId   = await getAccId(orgId, debitCode);
    const creditId  = await getAccId(orgId, "311");

    let entryId: number | null = null;
    if (debitId && creditId) {
      const yr = parseInt(String(period_year));
      const mo = parseInt(String(period_month));
      const { rows: er } = await pool.query(
        `INSERT INTO acc_entries
           (organization_id,entry_date,period_id,debit_account_id,credit_account_id,
            amount,description,is_manual,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8) RETURNING id`,
        [orgId, payment_date, periodId, debitId, creditId, parseFloat(String(amount)),
         `Сплата ${tax_type.toUpperCase()} за ${yr}-${String(mo).padStart(2, "0")}${bank_ref ? ` (${bank_ref})` : ""}`,
         req.user?.userId ?? req.user?.id ?? null],
      );
      entryId = er[0]?.id ?? null;
    }

    const { rows } = await pool.query(
      `INSERT INTO acc_tax_payments
         (organization_id,payment_date,tax_type,period_year,period_month,amount,bank_ref,notes,entry_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [orgId, payment_date, tax_type, parseInt(String(period_year)),
       parseInt(String(period_month)), parseFloat(String(amount)),
       bank_ref ?? null, notes ?? null, entryId],
    );

    await logAudit({
      organizationId: orgId, action: "tax_payment_created", entityType: "tax_payment",
      entityId: rows[0].id, userId: req.user?.userId ?? req.user?.id ?? null,
      afterData: rows[0], note: `Сплата ${tax_type} ${amount}₴`,
    });
    res.json({ ...rows[0], entry_id: entryId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7 — AI FEATURES
// ═══════════════════════════════════════════════════════════════════════════

// ─── Helper: fetch chart of accounts for org (condensed for AI prompt) ───────
async function getAccountsForAI(orgId: number): Promise<string> {
  const { rows } = await pool.query(
    `SELECT code, name, type FROM acc_accounts WHERE organization_id=$1 ORDER BY code LIMIT 120`,
    [orgId],
  );
  // Also include standard UA plan codes as fallback
  const standard = [
    "301-Каса(готівка),asset", "311-Поточний рахунок,asset", "361-Дебітори за товари,asset",
    "371-Аванси видані,asset", "281-Товари на складі,asset", "201-Сировина,asset",
    "631-Кредитори за товари,liability", "641-Розрахунки з бюджетом,liability",
    "661-Розрахунки з зарплати,liability", "651-Розрахунки зі страхування,liability",
    "685-Інші кредитори,liability", "701-Дохід від реалізації продукції,revenue",
    "702-Дохід від реалізації товарів,revenue", "703-Дохід від послуг,revenue",
    "791-Фінансові результати,equity", "901-Собівартість продукції,expense",
    "902-Собівартість товарів,expense", "92-Адміністративні витрати,expense",
    "93-Витрати на збут,expense", "94-Інші операційні витрати,expense",
    "6411-ПДВ зобов'язання,liability", "644-ПДВ кредит,asset",
  ];
  const orgRows = rows.map((r: any) => `${r.code}-${r.name},${r.type}`).join("\n");
  return orgRows.length > 100 ? orgRows : standard.join("\n");
}

// ─── AI CATEGORIZE — single bank statement entry ──────────────────────────────
router.post("/bank/ai-categorize/:id", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const stmtId = parseInt(req.params.id);

    const { rows: stmtRows } = await pool.query(
      `SELECT b.*, c.name as contractor_name
       FROM acc_bank_statements b
       LEFT JOIN acc_contractors c ON c.id=b.contractor_id
       WHERE b.id=$1 AND b.organization_id=$2`,
      [stmtId, orgId],
    );
    if (!stmtRows[0]) return res.status(404).json({ error: "Not found" });
    const stmt = stmtRows[0];

    const accounts = await getAccountsForAI(orgId);
    const amount = parseFloat(stmt.amount);
    const direction = amount > 0 ? "НАДХОДЖЕННЯ (гроші прийшли на рахунок)" : "ВИТРАТА (гроші пішли з рахунку)";

    const { rows: contractorRows } = await pool.query(
      `SELECT name FROM acc_contractors WHERE organization_id=$1 LIMIT 30`,
      [orgId],
    );
    const contractorNames = contractorRows.map((c: any) => c.name).join(", ");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Ти — бухгалтер-асистент для українського бізнесу (готель/ресторан).
Тобі потрібно категоризувати банківську транзакцію згідно з Планом рахунків України (НП(С)БО).

Правила:
- Готівкова виплата зарплати: Дт 661 / Кт 301
- Безготівкова виплата зарплати: Дт 661 / Кт 311
- Надходження від клієнтів: Дт 311 / Кт 361 або Дт 311 / Кт 703
- Оплата постачальнику: Дт 631 / Кт 311
- Аванс постачальнику: Дт 371 / Кт 311
- Отримання авансу від клієнта: Дт 311 / Кт 681
- Оплата податків: Дт 641 / Кт 311
- Оплата ЄСВ: Дт 651 / Кт 311
- Закупка продуктів (METRO, Сільпо, АТБ): Дт 281 / Кт 631 (якщо в кредит) або Дт 902 / Кт 311 (якщо за готівку)
- Комунальні послуги: Дт 92 / Кт 311
- Оренда: Дт 92 / Кт 311
- Реклама: Дт 93 / Кт 311
- Банківська комісія: Дт 92 / Кт 311
- ПДВ: якщо є ПДВ 20%, то для доходів відраховуємо: Дт 703 / Кт 6411

РАХУНКИ ОРГАНІЗАЦІЇ:
${accounts}

ІСНУЮЧІ КОНТРАГЕНТИ:
${contractorNames}

Поверни JSON з полями:
{
  "debit_code": "код рахунку дебету (тільки числа, наприклад: 311)",
  "credit_code": "код рахунку кредиту",
  "vat_percent": 0 або 20 або 7,
  "contractor_name": "назва контрагента (або null якщо невідомо)",
  "category": "коротка категорія (наприклад: Зарплата, Постачальник, Клієнт, Податки, Комунальні, Оренда, Банк, Реклама, Інше)",
  "description": "пояснення проводки українською (1 речення)",
  "confidence": число від 0 до 1,
  "reasoning": "чому так (1 речення)"
}`,
        },
        {
          role: "user",
          content: `Банківська операція:
Дата: ${stmt.statement_date}
Опис: ${stmt.description}
Сума: ${Math.abs(amount).toFixed(2)} грн (${direction})
Банк: ${stmt.bank_name ?? "невідомо"}
Контрагент у базі: ${stmt.contractor_name ?? "невідомо"}`,
        },
      ],
    });

    const suggestion = JSON.parse(completion.choices[0].message.content ?? "{}");

    // Save suggestion to DB
    await pool.query(
      `UPDATE acc_bank_statements
       SET ai_suggestion=to_jsonb($1::text)::jsonb,
           match_status = CASE WHEN match_status='unmatched' THEN 'suggested' ELSE match_status END
       WHERE id=$2 AND organization_id=$3`,
      [JSON.stringify(suggestion), stmtId, orgId],
    ).catch(() => {/* column may not exist yet — non-fatal */});

    res.json({ suggestion, stmt_id: stmtId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI CATEGORIZE BULK — all unmatched entries ───────────────────────────────
router.post("/bank/ai-categorize-bulk", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { from, to, limit: lim = 20 } = req.body as any;

    let q = `SELECT b.*, c.name as contractor_name
             FROM acc_bank_statements b
             LEFT JOIN acc_contractors c ON c.id=b.contractor_id
             WHERE b.organization_id=$1 AND b.match_status IN ('unmatched','suggested')`;
    const params: any[] = [orgId];
    if (from) { params.push(from); q += ` AND b.statement_date>=$${params.length}`; }
    if (to)   { params.push(to);   q += ` AND b.statement_date<=$${params.length}`; }
    params.push(Math.min(Number(lim), 50));
    q += ` ORDER BY b.statement_date DESC LIMIT $${params.length}`;

    const { rows: stmts } = await pool.query(q, params);
    if (stmts.length === 0) return res.json({ processed: 0, results: [] });

    const accounts = await getAccountsForAI(orgId);
    const results: any[] = [];

    // Process in parallel batches of 5
    const BATCH = 5;
    for (let i = 0; i < stmts.length; i += BATCH) {
      const batch = stmts.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (stmt: any) => {
        try {
          const amount = parseFloat(stmt.amount);
          const direction = amount > 0 ? "НАДХОДЖЕННЯ" : "ВИТРАТА";
          const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: `Бухгалтер UA. Категоризуй транзакцію. Рахунки:\n${accounts}\nJSON: {debit_code,credit_code,vat_percent,contractor_name,category,description,confidence}` },
              { role: "user", content: `Дата:${stmt.statement_date} Опис:${stmt.description} Сума:${Math.abs(amount)}грн ${direction}` },
            ],
          });
          const suggestion = JSON.parse(completion.choices[0].message.content ?? "{}");
          await pool.query(
            `UPDATE acc_bank_statements SET ai_suggestion=to_jsonb($1::text)::jsonb WHERE id=$2 AND organization_id=$3`,
            [JSON.stringify(suggestion), stmt.id, orgId],
          ).catch(() => {});
          return { id: stmt.id, suggestion };
        } catch {
          return { id: stmt.id, suggestion: null };
        }
      }));
      results.push(...batchResults);
    }

    res.json({ processed: results.length, results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI APPLY — create journal entry from AI suggestion ─────────────────────
router.post("/bank/ai-apply/:id", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const stmtId = parseInt(req.params.id);
    const { debit_code, credit_code, description, vat_percent, contractor_id } = req.body;

    const { rows: stmtRows } = await pool.query(
      `SELECT * FROM acc_bank_statements WHERE id=$1 AND organization_id=$2`,
      [stmtId, orgId],
    );
    if (!stmtRows[0]) return res.status(404).json({ error: "Not found" });
    const stmt = stmtRows[0];
    const amount = Math.abs(parseFloat(stmt.amount));

    // Resolve account IDs
    const getAccId = async (code: string) => {
      const { rows } = await pool.query(
        `SELECT id FROM acc_accounts WHERE organization_id=$1 AND code=$2 LIMIT 1`,
        [orgId, code],
      );
      return rows[0]?.id ?? null;
    };

    const [debitId, creditId] = await Promise.all([getAccId(debit_code), getAccId(credit_code)]);
    if (!debitId || !creditId) {
      // Try to auto-create accounts from UA standard plan
      const ensureAccount = async (code: string) => {
        const existing = await pool.query(`SELECT id FROM acc_accounts WHERE organization_id=$1 AND code=$2`, [orgId, code]);
        if (existing.rows[0]) return existing.rows[0].id;
        const plan = UA_PLAN.find(p => p.code === code);
        if (!plan) return null;
        const ins = await pool.query(
          `INSERT INTO acc_accounts (organization_id,code,name,type,class) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
          [orgId, plan.code, plan.name, plan.type, plan.class],
        );
        return ins.rows[0]?.id;
      };
      const [dId, cId] = await Promise.all([ensureAccount(debit_code), ensureAccount(credit_code)]);
      if (!dId || !cId) return res.status(400).json({ error: `Account not found: debit=${debit_code} credit=${credit_code}` });
    }

    const [finalDebitId, finalCreditId] = await Promise.all([getAccId(debit_code), getAccId(credit_code)]);

    // Create journal entry
    const { rows: entryRows } = await pool.query(
      `INSERT INTO acc_entries (organization_id, entry_date, debit_account_id, credit_account_id, amount, description, contractor_id, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ai_categorized') RETURNING *`,
      [orgId, stmt.statement_date, finalDebitId, finalCreditId, amount,
       description || stmt.description,
       contractor_id || stmt.contractor_id || null],
    );

    // Mark bank statement as matched
    await pool.query(
      `UPDATE acc_bank_statements SET match_status='matched', entry_id=$1 WHERE id=$2`,
      [entryRows[0].id, stmtId],
    );

    res.json({ entry: entryRows[0], stmt_id: stmtId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── SMART ALERTS ENGINE ──────────────────────────────────────────────────────
router.get("/reports/alerts", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const alerts: any[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}-01`;
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
    const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];

    const [
      cashRow,
      unmatchedRow,
      draftDocsRow,
      overdueRecRow,
      curRevRow,
      prevRevRow,
      curCostRow,
      prevCostRow,
      largeTxRow,
      dupRow,
    ] = await Promise.all([
      // 1. Cash balance
      pool.query(`
        SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE -e.amount END),0) AS cash
        FROM acc_accounts a
        LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
          AND e.organization_id=$1
        WHERE a.organization_id=$1 AND (a.code LIKE '30%' OR a.code LIKE '31%' OR a.code LIKE '33%')`,
        [orgId]),

      // 2. Unreconciled bank entries > 7 days
      pool.query(`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(ABS(amount)),0) AS total
        FROM acc_bank_statements
        WHERE organization_id=$1 AND match_status='unmatched' AND statement_date<=$2`,
        [orgId, sevenDaysAgo]),

      // 3. Draft documents > 3 days
      pool.query(`
        SELECT COUNT(*) AS cnt FROM acc_documents
        WHERE organization_id=$1 AND status='draft' AND doc_date<=$2`,
        [orgId, threeDaysAgo]),

      // 4. Overdue receivables > 30 days
      pool.query(`
        SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE -e.amount END),0) AS amount,
               COUNT(DISTINCT a.id) AS accounts
        FROM acc_accounts a
        LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
          AND e.organization_id=$1
        WHERE a.organization_id=$1 AND (a.code LIKE '36%' OR a.code LIKE '37%')`,
        [orgId]),

      // 5. Current month revenue
      pool.query(`
        SELECT COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE -e.amount END),0) AS rev
        FROM acc_accounts a
        LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
          AND e.organization_id=$1 AND e.entry_date>=$2
        WHERE a.organization_id=$1 AND (a.code LIKE '70%' OR a.code LIKE '71%')`,
        [orgId, monthStart]),

      // 6. Previous month revenue
      pool.query(`
        SELECT COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE -e.amount END),0) AS rev
        FROM acc_accounts a
        LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
          AND e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
        WHERE a.organization_id=$1 AND (a.code LIKE '70%' OR a.code LIKE '71%')`,
        [orgId, prevMonthStart, prevMonthEnd]),

      // 7. Current month costs
      pool.query(`
        SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE -e.amount END),0) AS cost
        FROM acc_accounts a
        LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
          AND e.organization_id=$1 AND e.entry_date>=$2
        WHERE a.organization_id=$1 AND (a.code LIKE '90%' OR a.code LIKE '91%')`,
        [orgId, monthStart]),

      // 8. Previous month costs
      pool.query(`
        SELECT COALESCE(SUM(CASE WHEN e.debit_account_id=a.id THEN e.amount ELSE -e.amount END),0) AS cost
        FROM acc_accounts a
        LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
          AND e.organization_id=$1 AND e.entry_date>=$2 AND e.entry_date<=$3
        WHERE a.organization_id=$1 AND (a.code LIKE '90%' OR a.code LIKE '91%')`,
        [orgId, prevMonthStart, prevMonthEnd]),

      // 9. Unusually large transactions (> 3x average)
      pool.query(`
        WITH avg AS (SELECT AVG(amount) AS a, STDDEV(amount) AS s FROM acc_entries WHERE organization_id=$1)
        SELECT COUNT(*) AS cnt FROM acc_entries, avg
        WHERE organization_id=$1 AND amount > avg.a + 3 * COALESCE(avg.s, avg.a)
          AND entry_date >= $2`,
        [orgId, sevenDaysAgo]),

      // 10. Duplicate transactions (same amount + date + accounts)
      pool.query(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT debit_account_id, credit_account_id, amount, DATE(entry_date), COUNT(*) AS c
          FROM acc_entries WHERE organization_id=$1 AND entry_date>=$2
          GROUP BY debit_account_id, credit_account_id, amount, DATE(entry_date)
          HAVING COUNT(*) > 1
        ) t`,
        [orgId, sevenDaysAgo]),
    ]);

    const cash       = parseFloat(cashRow.rows[0]?.cash ?? 0);
    const unmatched  = parseInt(unmatchedRow.rows[0]?.cnt ?? 0);
    const unmTotal   = parseFloat(unmatchedRow.rows[0]?.total ?? 0);
    const draftDocs  = parseInt(draftDocsRow.rows[0]?.cnt ?? 0);
    const overdue    = parseFloat(overdueRecRow.rows[0]?.amount ?? 0);
    const curRev     = parseFloat(curRevRow.rows[0]?.rev ?? 0);
    const prevRev    = parseFloat(prevRevRow.rows[0]?.rev ?? 0);
    const curCost    = parseFloat(curCostRow.rows[0]?.cost ?? 0);
    const prevCost   = parseFloat(prevCostRow.rows[0]?.cost ?? 0);
    const largeTx    = parseInt(largeTxRow.rows[0]?.cnt ?? 0);
    const dups       = parseInt(dupRow.rows[0]?.cnt ?? 0);

    const fmt2 = (n: number) => n.toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    if (cash < 5000 && cash >= 0)
      alerts.push({ id: "low_cash", severity: "critical", type: "cash",
        title: "Низький залишок коштів", description: `Залишок на рахунках 30/31: ₴${fmt2(cash)}. Загроза касового розриву.`,
        value: cash, action: "acc-bank" });

    if (cash < 0)
      alerts.push({ id: "negative_cash", severity: "critical", type: "cash",
        title: "Від'ємний залишок коштів", description: `Балансовий залишок коштів: –₴${fmt2(Math.abs(cash))}. Перевірте проводки.`,
        value: cash, action: "acc-bank" });

    if (unmatched > 0)
      alerts.push({ id: "unmatched_bank", severity: unmatched > 10 ? "high" : "medium", type: "bank",
        title: `${unmatched} незвірених банківських операцій`, description: `Операцій старше 7 днів без проводки: ₴${fmt2(unmTotal)}`,
        value: unmatched, action: "acc-bank" });

    if (draftDocs > 0)
      alerts.push({ id: "draft_docs", severity: "medium", type: "documents",
        title: `${draftDocs} непроведених документів`, description: `Документи у статусі "Чернетка" більше 3 днів. Ризик невідображення в обліку.`,
        value: draftDocs, action: "acc-documents" });

    if (overdue > 1000)
      alerts.push({ id: "overdue_receivables", severity: overdue > 50000 ? "high" : "medium", type: "receivables",
        title: "Прострочена дебіторська заборгованість", description: `Залишок на рах. 36/37: ₴${fmt2(overdue)}. Можливий ризик незакритих розрахунків.`,
        value: overdue, action: "acc-reports" });

    if (prevRev > 0 && curRev < prevRev * 0.8)
      alerts.push({ id: "revenue_drop", severity: "high", type: "revenue",
        title: "Падіння виручки", description: `Дохід цього місяця ₴${fmt2(curRev)} vs ₴${fmt2(prevRev)} минулого місяця (–${Math.round((prevRev - curRev) / prevRev * 100)}%).`,
        value: curRev - prevRev, action: "acc-reports" });

    if (prevCost > 0 && curCost > prevCost * 1.2 && curRev > 0) {
      const curFoodcost = curCost / curRev;
      const prevFoodcost = prevCost / prevRev;
      if (curFoodcost > prevFoodcost * 1.1)
        alerts.push({ id: "foodcost_spike", severity: "medium", type: "cost",
          title: "Зростання foodcost/собівартості", description: `Собівартість зросла з ₴${fmt2(prevCost)} до ₴${fmt2(curCost)} (+${Math.round((curCost - prevCost) / prevCost * 100)}% vs попер. місяць).`,
          value: curCost - prevCost, action: "acc-reports" });
    }

    if (largeTx > 0)
      alerts.push({ id: "large_transactions", severity: "medium", type: "anomaly",
        title: `${largeTx} нетипових транзакцій`, description: `За останні 7 днів виявлено ${largeTx} транзакцій значно більших за середній розмір.`,
        value: largeTx, action: "acc-journal" });

    if (dups > 0)
      alerts.push({ id: "duplicates", severity: "high", type: "anomaly",
        title: `Можливі дублікати проводок`, description: `${dups} груп проводок з однаковою сумою, датою та рахунками за останні 7 днів.`,
        value: dups, action: "acc-journal" });

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    res.json({ alerts, count: alerts.length, generated_at: new Date().toISOString() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── OCR DOCUMENT SCANNING ────────────────────────────────────────────────────
router.post("/documents/ocr", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { image_base64, mime_type = "image/jpeg" } = req.body as { image_base64: string; mime_type?: string };
    if (!image_base64) return res.status(400).json({ error: "image_base64 required" });

    const contractors = await pool.query(
      `SELECT name FROM acc_contractors WHERE organization_id=$1 LIMIT 40`, [orgId],
    );
    const contractorList = contractors.rows.map((c: any) => c.name).join(", ");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Ти — OCR-асистент для бухгалтерії. Прочитай документ (накладну/рахунок/акт) і поверни JSON.
Існуючі контрагенти: ${contractorList}

Поверни JSON:
{
  "doc_type": "invoice_in" | "invoice_out" | "act_in" | "act_out" | "receipt",
  "doc_number": "номер документу або null",
  "doc_date": "YYYY-MM-DD або null",
  "supplier_name": "назва постачальника або null",
  "supplier_edrpou": "ЄДРПОУ або null",
  "buyer_name": "назва покупця або null",
  "line_items": [
    {
      "description": "назва товару/послуги",
      "qty": число,
      "unit": "шт/кг/л/пос/год або null",
      "unit_price": число без ПДВ,
      "vat_rate": 0 або 20 або 7,
      "total_with_vat": загальна сума з ПДВ
    }
  ],
  "subtotal_without_vat": число,
  "vat_total": число,
  "total_with_vat": загальна сума,
  "currency": "UAH" або інша,
  "notes": "примітки якщо є або null",
  "confidence": число від 0 до 1,
  "ocr_warnings": ["попередження якщо текст нечіткий"]
}

Якщо поле не видно — повертай null. НЕ вигадуй дані.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Розпізнай цей документ:" },
            { type: "image_url", image_url: { url: `data:${mime_type};base64,${image_base64}`, detail: "high" } },
          ] as any,
        },
      ],
    });

    const result = JSON.parse(completion.choices[0].message.content ?? "{}");
    res.json({ ...result, raw_prompt_tokens: completion.usage?.prompt_tokens });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── OCR CREATE DOCUMENT — from OCR result create acc_document + entries ──────
router.post("/documents/ocr/create", async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { ocr_data, contractor_id, debit_code = "281", credit_code = "631", auto_post = false } = req.body as any;
    const { doc_type, doc_number, doc_date, total_with_vat, vat_total, line_items, supplier_name } = ocr_data;

    // Resolve or create contractor
    let contractorId = contractor_id ?? null;
    if (!contractorId && supplier_name) {
      const ex = await pool.query(
        `SELECT id FROM acc_contractors WHERE organization_id=$1 AND name ILIKE $2 LIMIT 1`,
        [orgId, `%${supplier_name}%`],
      );
      contractorId = ex.rows[0]?.id ?? null;
    }

    // Create document
    const { rows: docRows } = await pool.query(
      `INSERT INTO acc_documents (organization_id, doc_type, doc_number, doc_date, contractor_id, total, vat, status, notes)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,'draft','OCR auto-created') RETURNING *`,
      [orgId, doc_type ?? "invoice_in", doc_number ?? `OCR-${Date.now()}`,
       doc_date ?? new Date().toISOString().split("T")[0],
       contractorId, total_with_vat ?? 0, vat_total ?? 0],
    );
    const doc = docRows[0];

    // If auto_post, create journal entry
    let entry = null;
    if (auto_post) {
      const getAccId = async (code: string) => {
        const { rows } = await pool.query(
          `SELECT id FROM acc_accounts WHERE organization_id=$1 AND code=$2 LIMIT 1`, [orgId, code],
        );
        return rows[0]?.id;
      };
      const [dId, cId] = await Promise.all([getAccId(debit_code), getAccId(credit_code)]);
      if (dId && cId) {
        const amount = parseFloat(total_with_vat) - parseFloat(vat_total ?? 0);
        const { rows: entryRows } = await pool.query(
          `INSERT INTO acc_entries (organization_id, entry_date, debit_account_id, credit_account_id, amount, description, contractor_id, document_id, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ocr') RETURNING *`,
          [orgId, doc.doc_date, dId, cId, amount,
           `OCR: ${supplier_name ?? "Постачальник"} — ${doc_number ?? "накладна"}`,
           contractorId, doc.id],
        );
        entry = entryRows[0];
        await pool.query(`UPDATE acc_documents SET status='posted' WHERE id=$1`, [doc.id]);
      }
    }

    res.json({ document: doc, entry, contractor_id: contractorId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── ADD ai_suggestion column if not exists ───────────────────────────────────
pool.query(`
  ALTER TABLE acc_bank_statements ADD COLUMN IF NOT EXISTS ai_suggestion JSONB;
`).catch(() => {});

export default router;

