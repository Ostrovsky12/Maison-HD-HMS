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

// Додаток Д5 — розшифровка кредиту по контрагентах (BEFORE /declaration to avoid routing conflict)
router.get("/vat/declaration/d5", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
// ACCOUNT CARD — картка рахунку
// ═══════════════════════════════════════════════════════════════════════════

router.get("/reports/account-card", async (req: any, res) => {
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
  const orgId = req.user.organizationId;
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
