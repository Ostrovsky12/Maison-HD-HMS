import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { pool } from "@workspace/db";
import crypto from "crypto";

const router = Router();
router.use(requireAuth);
const org = (req: any): number => req.user?.organizationId ?? req.user?.organization_id;

// ─── Auto-create tables ────────────────────────────────────────────────────────
async function ensureAccessTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_positions (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      permissions JSONB NOT NULL DEFAULT '{}',
      color VARCHAR(20) DEFAULT 'blue',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_registers (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      register_type VARCHAR(20) NOT NULL DEFAULT 'standard',
      outlet_id INT,
      login VARCHAR(100),
      password VARCHAR(200),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_login_sessions (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      staff_id INT,
      staff_name VARCHAR(200),
      device VARCHAR(200),
      browser VARCHAR(100),
      ip_address VARCHAR(45),
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_api_tokens (
      id SERIAL PRIMARY KEY,
      organization_id INT NOT NULL,
      staff_id INT,
      staff_name VARCHAR(200),
      app_name VARCHAR(200) NOT NULL,
      token TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Extend fb_staff with new columns if needed
  await pool.query(`ALTER TABLE fb_staff ADD COLUMN IF NOT EXISTS position_id INT REFERENCES fb_positions(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE fb_staff ADD COLUMN IF NOT EXISTS pin_plain VARCHAR(10)`).catch(() => {});
  await pool.query(`ALTER TABLE fb_staff ADD COLUMN IF NOT EXISTS login VARCHAR(150)`).catch(() => {});
  await pool.query(`ALTER TABLE fb_staff ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`).catch(() => {});
  await pool.query(`ALTER TABLE fb_staff ADD COLUMN IF NOT EXISTS invitation_email VARCHAR(150)`).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITIONS / ПОСАДИ
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PERMISSIONS = {
  full_access: false,
  statistics: false, finances: false, menu: false, warehouse: false,
  marketing: false, access: false, settings: false,
  cashier: false, cashier_admin: false, courier: false,
};

const PERMISSION_LABELS: Record<string, string> = {
  full_access: "Повний доступ",
  statistics: "Статистика", finances: "Фінанси", menu: "Меню",
  warehouse: "Склад", marketing: "Маркетинг", access: "Доступ",
  settings: "Налаштування", cashier: "Робота з касою",
  cashier_admin: "Адміністрування залу", courier: "Кур'єр",
};

router.get("/positions", async (req, res) => {
  try {
    await ensureAccessTables();
    const { rows } = await pool.query(
      `SELECT p.*, COUNT(s.id)::int AS staff_count
       FROM fb_positions p
       LEFT JOIN fb_staff s ON s.position_id = p.id AND s.is_active = TRUE
       WHERE p.organization_id = $1
       GROUP BY p.id ORDER BY p.name`, [org(req)]
    );
    res.json({ positions: rows, permission_labels: PERMISSION_LABELS });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/positions", async (req, res) => {
  try {
    await ensureAccessTables();
    const { name, permissions, color } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    const perms = { ...DEFAULT_PERMISSIONS, ...(permissions || {}) };
    const { rows } = await pool.query(
      `INSERT INTO fb_positions (organization_id, name, permissions, color) VALUES ($1,$2,$3,$4) RETURNING *`,
      [org(req), name, JSON.stringify(perms), color || "blue"]
    );
    res.json({ position: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/positions/:id", async (req, res) => {
  try {
    const { name, permissions, color } = req.body;
    await pool.query(
      `UPDATE fb_positions SET
         name=COALESCE($1,name), permissions=COALESCE($2,permissions), color=COALESCE($3,color)
       WHERE id=$4 AND organization_id=$5`,
      [name??null, permissions ? JSON.stringify(permissions) : null, color??null, req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/positions/:id", async (req, res) => {
  try {
    await pool.query(`UPDATE fb_staff SET position_id=NULL WHERE position_id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    await pool.query(`DELETE FROM fb_positions WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// STAFF ENHANCED (with position, pin_plain, login)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/staff", async (req, res) => {
  try {
    await ensureAccessTables();
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.email, s.phone, s.role, s.pin_plain, s.login,
              s.is_active, s.created_at, s.last_login_at, s.position_id,
              p.name AS position_name, p.color AS position_color
       FROM fb_staff s
       LEFT JOIN fb_positions p ON p.id = s.position_id
       WHERE s.organization_id = $1 ORDER BY s.name`, [org(req)]
    );
    res.json({ staff: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/staff", async (req, res) => {
  try {
    await ensureAccessTables();
    const { name, phone, login, email, pin, role, position_id, is_active } = req.body;
    if (!name) return res.status(400).json({ error: "Ім'я обов'язкове" });
    const pinHash = pin ? crypto.createHash("sha256").update(String(pin)).digest("hex") : null;
    const { rows } = await pool.query(
      `INSERT INTO fb_staff (organization_id, name, phone, login, email, pin_plain, pin_hash, role, position_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, name, phone, login, email, pin_plain, role, position_id, is_active, created_at`,
      [org(req), name, phone||null, login||email||null, email||login||null,
       pin ? String(pin) : null, pinHash, role||'waiter', position_id||null, is_active !== false]
    );
    res.json({ staff: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/staff/:id", async (req, res) => {
  try {
    const { name, phone, login, email, pin, role, position_id, is_active } = req.body;
    const pinHash = pin !== undefined && pin
      ? crypto.createHash("sha256").update(String(pin)).digest("hex") : undefined;
    await pool.query(
      `UPDATE fb_staff SET
         name=COALESCE($1,name), phone=COALESCE($2,phone),
         login=COALESCE($3,login), email=COALESCE($4,email),
         pin_plain=COALESCE($5,pin_plain), pin_hash=COALESCE($6,pin_hash),
         role=COALESCE($7,role), position_id=COALESCE($8::int,position_id),
         is_active=COALESCE($9,is_active)
       WHERE id=$10 AND organization_id=$11`,
      [name??null, phone??null, login??null, email??null,
       pin !== undefined ? (pin ? String(pin) : null) : null,
       pinHash??null,
       role??null, position_id||null, is_active??null, req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/staff/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM fb_staff WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Invitations
router.get("/invitations", async (req, res) => {
  try {
    await ensureAccessTables();
    const { rows } = await pool.query(
      `SELECT id, name, invitation_email AS email, role, is_active, created_at
       FROM fb_staff WHERE organization_id=$1 AND invitation_email IS NOT NULL ORDER BY created_at DESC`,
      [org(req)]
    );
    res.json({ invitations: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/invitations", async (req, res) => {
  try {
    await ensureAccessTables();
    const { name, email, role, position_id } = req.body;
    if (!email) return res.status(400).json({ error: "Email обов'язковий" });
    const { rows } = await pool.query(
      `INSERT INTO fb_staff (organization_id, name, email, invitation_email, role, position_id, is_active, pin_hash, permissions)
       VALUES ($1,$2,$3,$3,$4,$5,FALSE,NULL,'{}') RETURNING id, name, email, role`,
      [org(req), name || email, email, role || 'waiter', position_id || null]
    );
    res.json({ invitation: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTERS / КАСИ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/registers", async (req, res) => {
  try {
    await ensureAccessTables();
    const { rows } = await pool.query(
      `SELECT r.*, o.name AS outlet_name
       FROM fb_registers r
       LEFT JOIN fb_outlets o ON o.id = r.outlet_id
       WHERE r.organization_id = $1 ORDER BY r.id`, [org(req)]
    );
    res.json({ registers: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/registers", async (req, res) => {
  try {
    await ensureAccessTables();
    const { name, register_type, outlet_id, login, password } = req.body;
    if (!name) return res.status(400).json({ error: "Назва обов'язкова" });
    const { rows } = await pool.query(
      `INSERT INTO fb_registers (organization_id, name, register_type, outlet_id, login, password)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [org(req), name, register_type || 'standard', outlet_id || null, login || null, password || null]
    );
    res.json({ register: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/registers/:id", async (req, res) => {
  try {
    const { name, register_type, outlet_id, login, password, is_active } = req.body;
    await pool.query(
      `UPDATE fb_registers SET
         name=COALESCE($1,name), register_type=COALESCE($2,register_type),
         outlet_id=COALESCE($3::int,outlet_id), login=COALESCE($4,login),
         password=COALESCE($5,password), is_active=COALESCE($6,is_active)
       WHERE id=$7 AND organization_id=$8`,
      [name??null, register_type??null, outlet_id||null, login??null,
       password??null, is_active??null, req.params.id, org(req)]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/registers/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM fb_registers WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS / СЕСІЇ КОРИСТУВАЧІВ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions", async (req, res) => {
  try {
    await ensureAccessTables();
    const { rows } = await pool.query(
      `SELECT * FROM fb_login_sessions WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [org(req)]
    );
    res.json({ sessions: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Record session (called on login)
router.post("/sessions", async (req, res) => {
  try {
    await ensureAccessTables();
    const { staff_id, staff_name, device, browser, ip_address } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO fb_login_sessions (organization_id, staff_id, staff_name, device, browser, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [org(req), staff_id||null, staff_name||null, device||null, browser||null, ip_address||null]
    );
    res.json({ session: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// API INTEGRATIONS / ІНТЕГРАЦІЇ
// ═══════════════════════════════════════════════════════════════════════════

router.get("/integrations", async (req, res) => {
  try {
    await ensureAccessTables();
    const { rows } = await pool.query(
      `SELECT * FROM fb_api_tokens WHERE organization_id=$1 ORDER BY created_at DESC`,
      [org(req)]
    );
    res.json({ integrations: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/integrations", async (req, res) => {
  try {
    await ensureAccessTables();
    const { staff_id, staff_name, app_name } = req.body;
    if (!app_name) return res.status(400).json({ error: "Назва застосунку обов'язкова" });
    const token = crypto.randomBytes(24).toString("hex");
    const { rows } = await pool.query(
      `INSERT INTO fb_api_tokens (organization_id, staff_id, staff_name, app_name, token)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [org(req), staff_id||null, staff_name||null, app_name, token]
    );
    res.json({ integration: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/integrations/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM fb_api_tokens WHERE id=$1 AND organization_id=$2`, [req.params.id, org(req)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
