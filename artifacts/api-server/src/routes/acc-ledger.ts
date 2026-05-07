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

// ═══════════════════════════════════════════════════════════════════════════
// CHART OF ACCOUNTS — план рахунків
// ═══════════════════════════════════════════════════════════════════════════

router.get("/accounts", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
  const { rows } = await pool.query(
    `SELECT * FROM acc_periods WHERE organization_id=$1 ORDER BY year DESC, month DESC`,
    [orgId],
  );
  res.json(rows);
});

router.post("/periods/:id/close", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { rows } = await pool.query(
    `UPDATE acc_periods SET status='closed', closed_at=NOW(), closed_by=$1
     WHERE id=$2 AND organization_id=$3 RETURNING *`,
    [req.user.userId, req.params.id, orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.post("/periods/:id/reopen", requireRole("admin", "owner"), async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { rows } = await pool.query(
    `UPDATE acc_periods SET status='open', closed_at=NULL, closed_by=NULL
     WHERE id=$1 AND organization_id=$2 RETURNING *`,
    [req.params.id, orgId],
  );
  res.json(rows[0] ?? { error: "Not found" });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS — первинні документи
// ═══════════════════════════════════════════════════════════════════════════

router.get("/documents", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
  const userId = req.user.userId;

  const { rows: docs } = await pool.query(
    `SELECT * FROM acc_documents WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId],
  );
  if (!docs[0]) return res.status(404).json({ error: "Not found" });
  const doc = docs[0];
  if (doc.status === "posted") return res.status(400).json({ error: "Вже проведено" });
  if (doc.status === "cancelled") return res.status(400).json({ error: "Скасовано" });

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
  res.json(rows[0]);
});

router.post("/documents/:id/cancel", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { rows } = await pool.query(
    `UPDATE acc_documents SET status='cancelled', updated_at=NOW()
     WHERE id=$1 AND organization_id=$2 AND status='draft' RETURNING *`,
    [req.params.id, orgId],
  );
  if (!rows[0]) return res.status(400).json({ error: "Можна скасувати лише чернетку" });
  res.json(rows[0]);
});

router.delete("/documents/:id", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
  const userId = req.user.userId;
  const { entry_date, debit_account_id, credit_account_id, amount, description, currency = "UAH" } = req.body;
  if (!entry_date || !debit_account_id || !credit_account_id || !amount)
    return res.status(400).json({ error: "entry_date, debit_account_id, credit_account_id, amount required" });
  const periodId = await ensurePeriod(orgId, new Date(entry_date));
  const { rows } = await pool.query(
    `INSERT INTO acc_entries
       (organization_id,entry_date,period_id,debit_account_id,credit_account_id,
        amount,currency,description,is_manual,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
    [orgId, entry_date, periodId, debit_account_id, credit_account_id, amount, currency, description ?? null, userId],
  );
  res.status(201).json(rows[0]);
});

router.delete("/entries/:id", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { rows } = await pool.query(
    `SELECT is_manual FROM acc_entries WHERE id=$1 AND organization_id=$2`, [req.params.id, orgId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (!rows[0].is_manual) return res.status(400).json({ error: "Можна видалити лише ручні проводки" });
  await pool.query(`DELETE FROM acc_entries WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// VAT REGISTER — реєстр ПДВ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/vat", async (req: any, res) => {
  const orgId = req.user.organizationId;
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

router.get("/vat/declaration", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { year, month } = req.query;
  const { rows } = await pool.query(
    `SELECT record_type,
       COALESCE(SUM(amount_excl_vat),0) as base,
       COALESCE(SUM(vat_amount),0)      as vat
     FROM acc_vat_records
     WHERE organization_id=$1
       AND ($2::int IS NULL OR EXTRACT(YEAR  FROM record_date)=$2)
       AND ($3::int IS NULL OR EXTRACT(MONTH FROM record_date)=$3)
     GROUP BY record_type`,
    [orgId, year ?? null, month ?? null],
  );
  const issued   = rows.find((r: any) => r.record_type === "issued")   ?? { base: 0, vat: 0 };
  const received = rows.find((r: any) => r.record_type === "received") ?? { base: 0, vat: 0 };
  const liability = parseFloat(issued.vat)   || 0;
  const credit    = parseFloat(received.vat) || 0;
  res.json({
    year, month,
    tax_liability:  liability,
    tax_credit:     credit,
    vat_to_pay:     Math.max(0, liability - credit),
    vat_refund:     Math.max(0, credit - liability),
    issued_base:    parseFloat(issued.base)   || 0,
    received_base:  parseFloat(received.base) || 0,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS — звіти
// ═══════════════════════════════════════════════════════════════════════════

// ОСВ — Оборотно-сальдова відомість
router.get("/reports/trial-balance", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { from, to } = req.query;
  await seedChart(orgId);
  const { rows } = await pool.query(
    `WITH mv AS (
       SELECT debit_account_id  as acc, SUM(amount) as d, 0::numeric as c
       FROM acc_entries WHERE organization_id=$1
         AND ($2::date IS NULL OR entry_date>=$2::date)
         AND ($3::date IS NULL OR entry_date<=$3::date)
       GROUP BY debit_account_id
       UNION ALL
       SELECT credit_account_id as acc, 0::numeric    as d, SUM(amount) as c
       FROM acc_entries WHERE organization_id=$1
         AND ($2::date IS NULL OR entry_date>=$2::date)
         AND ($3::date IS NULL OR entry_date<=$3::date)
       GROUP BY credit_account_id
     ),
     tot AS (SELECT acc, SUM(d) as d, SUM(c) as c FROM mv GROUP BY acc)
     SELECT a.code, a.name, a.type, a.class,
       COALESCE(t.d,0) as debit_turn,
       COALESCE(t.c,0) as credit_turn,
       COALESCE(t.d,0)-COALESCE(t.c,0) as balance
     FROM acc_accounts a LEFT JOIN tot t ON t.acc=a.id
     WHERE a.organization_id=$1 AND (t.d IS NOT NULL OR t.c IS NOT NULL)
     ORDER BY a.code`,
    [orgId, from ?? null, to ?? null],
  );
  res.json(rows);
});

// Звіт про фінансові результати
router.get("/reports/profit-loss", async (req: any, res) => {
  const orgId = req.user.organizationId;
  const { year, month } = req.query;
  const { rows } = await pool.query(
    `SELECT a.code, a.name, a.type, a.class,
       COALESCE(SUM(CASE WHEN e.credit_account_id=a.id THEN e.amount ELSE 0 END),0) -
       COALESCE(SUM(CASE WHEN e.debit_account_id =a.id THEN e.amount ELSE 0 END),0) as net
     FROM acc_accounts a
     LEFT JOIN acc_entries e ON (e.debit_account_id=a.id OR e.credit_account_id=a.id)
       AND e.organization_id=$1
       AND ($2::int IS NULL OR EXTRACT(YEAR  FROM e.entry_date)=$2)
       AND ($3::int IS NULL OR EXTRACT(MONTH FROM e.entry_date)=$3)
     WHERE a.organization_id=$1 AND a.class >= 7
     GROUP BY a.id,a.code,a.name,a.type,a.class
     HAVING COALESCE(SUM(e.amount),0) > 0
     ORDER BY a.code`,
    [orgId, year ?? null, month ?? null],
  );
  const income   = rows.filter((r: any) => r.type === "income");
  const expenses = rows.filter((r: any) => r.type === "expense");
  const totalIn  = income.reduce((s: number, r: any)   => s + parseFloat(r.net), 0);
  const totalEx  = expenses.reduce((s: number, r: any) => s + Math.abs(parseFloat(r.net)), 0);
  res.json({ income, expenses, totalIncome: totalIn, totalExpenses: totalEx, netProfit: totalIn - totalEx });
});

// Баланс
router.get("/reports/balance-sheet", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
  const { bank_account, statement_date, description, amount, contractor_id, external_id } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO acc_bank_statements (organization_id,bank_account,statement_date,description,amount,contractor_id,external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, bank_account ?? null, statement_date, description ?? null, amount, contractor_id ?? null, external_id ?? null],
  );
  res.json(rows[0]);
});

router.post("/bank/import", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
// IMPORT — імпорт з 1С
// ═══════════════════════════════════════════════════════════════════════════

router.post("/import/contractors", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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

export default router;
