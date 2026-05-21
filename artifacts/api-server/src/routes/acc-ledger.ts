/**
 * Maison Finance — Ledger (подвійне проведення)
 * План рахунків, журнал проводок, ПДВ-реєстр, звіти
 * Замінник 1С для українського SMB
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth.js";

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

export default router;
