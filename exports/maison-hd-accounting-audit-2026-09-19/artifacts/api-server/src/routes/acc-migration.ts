import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// ── DB INIT ───────────────────────────────────────────────────────────────────

async function initMigrationCenterTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mig_projects (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      source_system TEXT NOT NULL DEFAULT 'excel',
      source_version TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      cutoff_date DATE,
      go_live_date DATE,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS mig_files (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mig_projects(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0,
      parse_status TEXT DEFAULT 'pending',
      parse_result JSONB DEFAULT '{}',
      entities_found INTEGER DEFAULT 0,
      uploaded_by INTEGER,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mig_entities (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mig_projects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT,
      source_payload JSONB DEFAULT '{}',
      target_type TEXT,
      target_id TEXT,
      status TEXT DEFAULT 'pending',
      confidence_score NUMERIC(5,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mig_mappings (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mig_projects(id) ON DELETE CASCADE,
      mapping_type TEXT NOT NULL,
      source_value TEXT NOT NULL,
      source_label TEXT,
      target_value TEXT,
      target_label TEXT,
      confidence_score NUMERIC(5,2) DEFAULT 0,
      is_ai_suggested BOOLEAN DEFAULT FALSE,
      approved_by INTEGER,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mig_validation_errors (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mig_projects(id) ON DELETE CASCADE,
      entity_type TEXT,
      entity_id TEXT,
      severity TEXT NOT NULL DEFAULT 'warning',
      error_code TEXT,
      message TEXT NOT NULL,
      suggested_fix TEXT,
      status TEXT DEFAULT 'open',
      resolved_by INTEGER,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mig_import_batches (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES mig_projects(id) ON DELETE CASCADE,
      batch_type TEXT DEFAULT 'trial',
      status TEXT DEFAULT 'pending',
      records_total INTEGER DEFAULT 0,
      records_imported INTEGER DEFAULT 0,
      records_failed INTEGER DEFAULT 0,
      records_skipped INTEGER DEFAULT 0,
      rollback_available BOOLEAN DEFAULT TRUE,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      report JSONB DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS mig_audit_logs (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      org_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      user_id INTEGER,
      prev_value JSONB,
      new_value JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

initMigrationCenterTables().catch(console.error);

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function addAudit(orgId: number, projectId: number | null, action: string, entityType: string, entityId: string | null, userId: number | null, prev: any = null, next: any = null) {
  await pool.query(
    `INSERT INTO mig_audit_logs (org_id, project_id, action, entity_type, entity_id, user_id, prev_value, new_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [orgId, projectId, action, entityType, entityId, userId, prev ? JSON.stringify(prev) : null, next ? JSON.stringify(next) : null]
  );
}

async function computeHealth(projectId: number): Promise<number> {
  const [entities, errors, mappings] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total FROM mig_entities WHERE project_id=$1`, [projectId]),
    pool.query(`SELECT severity, COUNT(*) as cnt FROM mig_validation_errors WHERE project_id=$1 AND status='open' GROUP BY severity`, [projectId]),
    pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN target_value IS NULL THEN 1 END) as unmapped FROM mig_mappings WHERE project_id=$1`, [projectId]),
  ]);

  const total = parseInt(entities.rows[0]?.total || '0');
  if (total === 0) return 72;

  let score = 100;
  const errMap: Record<string, number> = {};
  for (const r of errors.rows) errMap[r.severity] = parseInt(r.cnt);

  score -= (errMap['critical'] || 0) * 12;
  score -= (errMap['warning'] || 0) * 3;
  score -= (errMap['info'] || 0) * 0.5;

  const totalMappings = parseInt(mappings.rows[0]?.total || '0');
  const unmapped = parseInt(mappings.rows[0]?.unmapped || '0');
  if (totalMappings > 0) score -= (unmapped / totalMappings) * 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseCSV(content: string): any[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const entities: any[] = [];

  for (let i = 1; i < Math.min(lines.length, 2000); i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

    let sourceType = 'general_record';
    if (headers.some(h => ['debit','credit','дебет','кредит','amount','сума'].includes(h))) sourceType = 'journal_entry';
    else if (headers.some(h => ['counterparty','контрагент','edrpou','єдрпоу','company'].includes(h))) sourceType = 'counterparty';
    else if (headers.some(h => ['product','товар','product_name','артикул','sku'].includes(h))) sourceType = 'product';
    else if (headers.some(h => ['account','рахунок','account_code','код рахунку'].includes(h))) sourceType = 'account';
    else if (headers.some(h => ['balance','залишок','balance_dt','balance_ct'].includes(h))) sourceType = 'balance';

    entities.push({ source_type: sourceType, source_id: `csv_${i}`, source_payload: row });
  }
  return entities;
}

function parseBasXml(content: string): any[] {
  const entities: any[] = [];
  const getTag = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
    return m?.[1]?.trim() || '';
  };

  const docPatterns = [
    /<ХозяйственнаяОперация[^>]*>[\s\S]*?<\/ХозяйственнаяОперация>/g,
    /<Документ[^>]*>[\s\S]*?<\/Документ>/g,
    /<JournalEntry[^>]*>[\s\S]*?<\/JournalEntry>/g,
  ];

  for (const pattern of docPatterns) {
    const matches = content.match(pattern) || [];
    for (let i = 0; i < Math.min(matches.length, 1000); i++) {
      entities.push({
        source_type: 'journal_entry',
        source_id: `xml_je_${i}`,
        source_payload: {
          date: getTag(matches[i], 'Дата') || getTag(matches[i], 'Date'),
          debit: getTag(matches[i], 'Дебет') || getTag(matches[i], 'Debit'),
          credit: getTag(matches[i], 'Кредит') || getTag(matches[i], 'Credit'),
          amount: getTag(matches[i], 'Сумма') || getTag(matches[i], 'Сума') || getTag(matches[i], 'Amount'),
          description: getTag(matches[i], 'Наименование') || getTag(matches[i], 'Комментарий'),
          counterparty: getTag(matches[i], 'Контрагент'),
        },
      });
    }
    if (matches.length > 0) break;
  }

  const cpMatches = content.match(/<Контрагент[^>]*>[\s\S]*?<\/Контрагент>/g) || [];
  for (let i = 0; i < Math.min(cpMatches.length, 500); i++) {
    entities.push({
      source_type: 'counterparty',
      source_id: `xml_cp_${i}`,
      source_payload: {
        name: getTag(cpMatches[i], 'Наименование') || getTag(cpMatches[i], 'Name'),
        edrpou: getTag(cpMatches[i], 'ИНН') || getTag(cpMatches[i], 'ЕДРПОУ'),
        address: getTag(cpMatches[i], 'ЮридическийАдрес'),
      },
    });
  }

  return entities;
}

async function parseAndIngestFile(projectId: number, fileId: number, fileType: string, contentB64: string, filename: string) {
  try {
    const content = contentB64 ? Buffer.from(contentB64, 'base64').toString('utf-8') : '';
    let entities: any[] = [];
    let parseResult: any = {};

    const lower = filename.toLowerCase();
    if (lower.endsWith('.xml') || fileType === 'xml') {
      entities = parseBasXml(content);
      parseResult = { format: 'bas_xml', rows: entities.length };
    } else {
      entities = parseCSV(content);
      parseResult = { format: 'csv', rows: entities.length };
    }

    for (const ent of entities) {
      await pool.query(
        `INSERT INTO mig_entities (project_id, source_type, source_id, source_payload) VALUES ($1,$2,$3,$4)`,
        [projectId, ent.source_type, ent.source_id, JSON.stringify(ent.source_payload)]
      );
    }

    await pool.query(
      `UPDATE mig_files SET parse_status='done', parse_result=$1, entities_found=$2 WHERE id=$3`,
      [JSON.stringify(parseResult), entities.length, fileId]
    );
    await pool.query(`UPDATE mig_projects SET status='data_scanned' WHERE id=$1 AND status IN ('draft','source_connected')`, [projectId]);
  } catch (e: any) {
    await pool.query(
      `UPDATE mig_files SET parse_status='error', parse_result=$1 WHERE id=$2`,
      [JSON.stringify({ error: e.message }), fileId]
    );
  }
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────

router.get("/projects", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { rows } = await pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM mig_files WHERE project_id = p.id) AS file_count,
        (SELECT COUNT(*) FROM mig_entities WHERE project_id = p.id) AS entity_count,
        (SELECT COUNT(*) FROM mig_validation_errors WHERE project_id = p.id AND status='open' AND severity='critical') AS critical_errors,
        (SELECT COUNT(*) FROM mig_validation_errors WHERE project_id = p.id AND status='open' AND severity='warning') AS warnings
       FROM mig_projects p WHERE p.org_id=$1 ORDER BY p.created_at DESC`,
      [orgId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/projects", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { name, source_system, source_version, cutoff_date, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO mig_projects (org_id, name, source_system, source_version, cutoff_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [orgId, name, source_system || 'excel', source_version, cutoff_date || null, notes, req.user!.id]
    );
    await addAudit(orgId, rows[0].id, 'project_created', 'project', String(rows[0].id), req.user!.id, null, { name, source_system });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/projects/:id", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { rows } = await pool.query(
      `SELECT * FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    const [health, files, errStats, entityStats] = await Promise.all([
      computeHealth(parseInt(req.params.id)),
      pool.query(`SELECT * FROM mig_files WHERE project_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]),
      pool.query(`SELECT severity, COUNT(*) as cnt FROM mig_validation_errors WHERE project_id=$1 AND status='open' GROUP BY severity`, [req.params.id]),
      pool.query(`SELECT source_type, COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 GROUP BY source_type ORDER BY cnt DESC`, [req.params.id]),
    ]);

    res.json({ ...rows[0], health_score: health, files: files.rows, error_stats: errStats.rows, entity_stats: entityStats.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/projects/:id", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { status, go_live_date, cutoff_date, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE mig_projects SET
        status = COALESCE($1, status),
        go_live_date = COALESCE($2::DATE, go_live_date),
        cutoff_date = COALESCE($3::DATE, cutoff_date),
        notes = COALESCE($4, notes)
       WHERE id=$5 AND org_id=$6 RETURNING *`,
      [status, go_live_date, cutoff_date, notes, req.params.id, orgId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    await addAudit(orgId, parseInt(req.params.id), 'project_updated', 'project', req.params.id, req.user!.id, null, req.body);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── FILES ─────────────────────────────────────────────────────────────────────

router.post("/projects/:id/files", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { filename, file_type, content_base64 } = req.body;
    // Validate file type allowlist
    const ALLOWED_FILE_TYPES = ["csv", "xlsx", "xls", "xml", "json"];
    if (file_type && !ALLOWED_FILE_TYPES.includes(file_type)) {
      return res.status(400).json({ error: `Unsupported file type. Allowed: ${ALLOWED_FILE_TYPES.join(", ")}` });
    }
    // Validate decoded size — reject files >10MB
    const sizeBytes = content_base64 ? Math.round(content_base64.length * 0.75) : 0;
    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (sizeBytes > MAX_FILE_BYTES) {
      return res.status(413).json({ error: "File too large. Maximum size is 10 MB." });
    }
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Project not found" });
    const { rows } = await pool.query(
      `INSERT INTO mig_files (project_id, filename, file_type, size_bytes, parse_status, uploaded_by) VALUES ($1,$2,$3,$4,'parsing',$5) RETURNING *`,
      [req.params.id, filename, file_type || 'csv', sizeBytes, req.user!.id]
    );

    const projectId = parseInt(req.params.id);
    parseAndIngestFile(projectId, rows[0].id, file_type || 'csv', content_base64 || '', filename).catch(console.error);
    await addAudit(orgId, projectId, 'file_uploaded', 'file', String(rows[0].id), req.user!.id, null, { filename, file_type, sizeBytes });

    res.json({ ...rows[0], message: "Parsing in progress" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/projects/:id/files", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });
    const { rows } = await pool.query(`SELECT * FROM mig_files WHERE project_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── SCAN / ENTITIES ───────────────────────────────────────────────────────────

router.get("/projects/:id/scan", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT * FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const [entityStats, total, files] = await Promise.all([
      pool.query(`SELECT source_type, COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 GROUP BY source_type ORDER BY cnt DESC`, [req.params.id]),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1`, [req.params.id]),
      pool.query(`SELECT * FROM mig_files WHERE project_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]),
    ]);

    const health = await computeHealth(parseInt(req.params.id));
    res.json({
      total_entities: parseInt(total.rows[0]?.cnt || '0'),
      entity_breakdown: entityStats.rows,
      files: files.rows,
      health_score: health,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/projects/:id/entities", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const type = req.query.type as string | undefined;
    const offset = (page - 1) * limit;

    const baseParams: any[] = [req.params.id];
    const typeFilter = type ? `AND source_type=$2` : '';
    if (type) baseParams.push(type);

    const dataParams = [...baseParams, limit, offset];
    const { rows } = await pool.query(
      `SELECT * FROM mig_entities WHERE project_id=$1 ${typeFilter} ORDER BY id LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
      dataParams
    );
    const countRes = await pool.query(
      `SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 ${typeFilter}`, baseParams
    );
    res.json({ rows, total: parseInt(countRes.rows[0]?.cnt || '0'), page, limit });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── MAPPINGS ──────────────────────────────────────────────────────────────────

router.get("/projects/:id/mappings", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const type = req.query.type as string | undefined;
    const params: any[] = [req.params.id];
    if (type) params.push(type);
    const { rows } = await pool.query(
      `SELECT * FROM mig_mappings WHERE project_id=$1 ${type ? 'AND mapping_type=$2' : ''} ORDER BY is_ai_suggested DESC, confidence_score DESC`,
      params
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/projects/:id/mappings", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const { mapping_type, source_value, source_label, target_value, target_label } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO mig_mappings (project_id, mapping_type, source_value, source_label, target_value, target_label, confidence_score, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,100,$7,NOW()) RETURNING *`,
      [req.params.id, mapping_type, source_value, source_label, target_value, target_label, req.user!.id]
    );
    await addAudit(orgId, parseInt(req.params.id), 'mapping_created', 'mapping', `${mapping_type}:${source_value}`, req.user!.id, null, { target_value });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/projects/:id/mappings/:mappingId", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const { target_value, target_label } = req.body;
    const { rows } = await pool.query(
      `UPDATE mig_mappings SET target_value=$1, target_label=$2, approved_by=$3, approved_at=NOW(), confidence_score=100, is_ai_suggested=FALSE
       WHERE id=$4 AND project_id=$5 RETURNING *`,
      [target_value, target_label, req.user!.id, req.params.mappingId, req.params.id]
    );
    await addAudit(orgId, parseInt(req.params.id), 'mapping_approved', 'mapping', req.params.mappingId, req.user!.id, null, { target_value });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/projects/:id/mappings/ai-suggest", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const mappingType = req.body.mapping_type || 'account';
    const entities = await pool.query(
      `SELECT DISTINCT source_payload FROM mig_entities WHERE project_id=$1 AND source_type=$2 LIMIT 30`,
      [req.params.id, mappingType]
    );

    if (entities.rows.length === 0) return res.json({ suggestions: [], message: "No entities found" });

    const sourceItems = entities.rows.map((r: any, i: number) =>
      `${i + 1}. ${JSON.stringify(r.source_payload)}`
    ).join('\n');

    const STANDARD_CHART = `10-Основні засоби, 11-Малоцінні необоротні активи, 12-Нематеріальні активи, 13-Знос, 20-Виробничі запаси, 22-МШП, 23-Виробництво, 26-Готова продукція, 28-Товари, 30-Готівка, 31-Рахунки в банках, 36-Розрахунки з покупцями, 37-Інші дебітори, 38-Резерв сумнівних боргів, 40-Зареєстрований капітал, 43-Резервний капітал, 44-Нерозподілені прибутки, 46-Неоплачений капітал, 60-Короткострокові позики, 63-Постачальники та підрядники, 64-Розрахунки за податками, 65-Страхування, 66-Оплата праці, 67-Розрахунки з учасниками, 68-Інші поточні зобов'язання, 70-Дохід від реалізації, 71-Інший операційний дохід, 72-Фінансові доходи, 79-Фінансові результати, 90-Собівартість реалізації, 91-Загальновиробничі, 92-Адміністративні, 93-Збут, 94-Інші операційні витрати`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Ukrainian accounting migration expert specializing in BAS/1C to MaisonHD migrations under P(S)BO standards. Map source entities to MaisonHD accounts. Return JSON: { "suggestions": [{ "source_value": "str", "source_label": "str", "target_value": "str", "target_label": "str", "confidence": 0-100, "reasoning": "str" }] }`
        },
        {
          role: "user",
          content: `Map these source ${mappingType} records to MaisonHD:\n${sourceItems}\n\nMaisonHD Chart of Accounts:\n${STANDARD_CHART}`
        }
      ],
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    const suggestions = result.suggestions || [];

    for (const s of suggestions) {
      await pool.query(
        `INSERT INTO mig_mappings (project_id, mapping_type, source_value, source_label, target_value, target_label, confidence_score, is_ai_suggested)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT DO NOTHING`,
        [req.params.id, mappingType, s.source_value, s.source_label, s.target_value, s.target_label, s.confidence || 70]
      );
    }

    await addAudit(orgId, parseInt(req.params.id), 'ai_mappings_suggested', 'mapping', null, req.user!.id, null, { count: suggestions.length, mappingType });
    res.json({ suggestions, total: suggestions.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── VALIDATION ────────────────────────────────────────────────────────────────

router.get("/projects/:id/validation", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });
    const { rows } = await pool.query(
      `SELECT * FROM mig_validation_errors WHERE project_id=$1
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/projects/:id/validate", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT * FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const projectId = parseInt(req.params.id);
    await pool.query(`DELETE FROM mig_validation_errors WHERE project_id=$1`, [projectId]);
    const errors: Array<{ severity: string; error_code: string; message: string; suggested_fix: string }> = [];

    const [totalEntities, unmapped, badJE, noDate, mappingCount] = await Promise.all([
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1`, [projectId]),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 AND status='pending'`, [projectId]),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 AND source_type='journal_entry' AND (source_payload->>'debit' = '' OR source_payload->>'credit' = '')`, [projectId]),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 AND source_type='journal_entry' AND (source_payload->>'date' IS NULL OR source_payload->>'date' = '')`, [projectId]),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_mappings WHERE project_id=$1`, [projectId]),
    ]);

    const total = parseInt(totalEntities.rows[0]?.cnt || '0');
    if (total === 0) {
      errors.push({ severity: 'critical', error_code: 'NO_DATA', message: 'Немає даних для валідації', suggested_fix: 'Завантажте файли у розділі "Файли джерела"' });
    }

    const badJECount = parseInt(badJE.rows[0]?.cnt || '0');
    if (badJECount > 0) {
      errors.push({ severity: 'critical', error_code: 'MISSING_ACCOUNTS', message: `${badJECount} проводок без рахунків Дт/Кт`, suggested_fix: 'Перевірте формат файлу: колонки Дебет та Кредит обов\'язкові' });
    }

    const noDateCount = parseInt(noDate.rows[0]?.cnt || '0');
    if (noDateCount > 0) {
      errors.push({ severity: 'warning', error_code: 'MISSING_DATE', message: `${noDateCount} проводок без дати`, suggested_fix: 'Відфільтруйте або виправте записи без дати' });
    }

    if (parseInt(mappingCount.rows[0]?.cnt || '0') === 0) {
      errors.push({ severity: 'warning', error_code: 'NO_MAPPINGS', message: 'Маппінги рахунків не налаштовані', suggested_fix: 'Перейдіть до Mapping Center та запустіть AI-маппінг' });
    }

    const unmappedCount = parseInt(unmapped.rows[0]?.cnt || '0');
    if (unmappedCount > total * 0.3) {
      errors.push({ severity: 'warning', error_code: 'HIGH_UNMAPPED', message: `${unmappedCount} сутностей (${Math.round(unmappedCount/Math.max(total,1)*100)}%) без відповідника`, suggested_fix: 'Перейдіть до Mapping Center для налаштування' });
    }

    // AI semantic check on a sample
    const sample = await pool.query(`SELECT source_payload FROM mig_entities WHERE project_id=$1 LIMIT 5`, [projectId]);
    if (sample.rows.length > 0) {
      try {
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: 'You are a Ukrainian P(S)BO accounting auditor. Analyze records for data quality issues. Return JSON: { "issues": [{"severity":"critical|warning|info","code":"str","message":"str","fix":"str"}] }' },
            { role: "user", content: `Check these records:\n${JSON.stringify(sample.rows.map((r: any) => r.source_payload))}` }
          ],
        });
        const aiResult = JSON.parse(aiRes.choices[0].message.content || '{}');
        for (const issue of (aiResult.issues || []).slice(0, 5)) {
          errors.push({ severity: issue.severity || 'info', error_code: issue.code || 'AI_CHECK', message: issue.message, suggested_fix: issue.fix });
        }
      } catch (_) {}
    }

    for (const err of errors) {
      await pool.query(
        `INSERT INTO mig_validation_errors (project_id, severity, error_code, message, suggested_fix) VALUES ($1,$2,$3,$4,$5)`,
        [projectId, err.severity, err.error_code, err.message, err.suggested_fix]
      );
    }

    const critCount = errors.filter(e => e.severity === 'critical').length;
    await pool.query(
      `UPDATE mig_projects SET status=$1 WHERE id=$2`,
      [critCount > 0 ? 'validation_failed' : 'ready_for_trial', projectId]
    );

    await addAudit(orgId, projectId, 'validation_run', 'project', String(projectId), req.user!.id, null, { errors_found: errors.length });
    res.json({ errors_found: errors.length, critical: critCount, warnings: errors.filter(e => e.severity === 'warning').length, errors });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/projects/:id/validation/:errorId/resolve", requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE mig_validation_errors SET status='resolved', resolved_by=$1, resolved_at=NOW() WHERE id=$2`,
      [req.user!.id, req.params.errorId]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── TRIAL IMPORT ──────────────────────────────────────────────────────────────

router.post("/projects/:id/trial-import", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT * FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const projectId = parseInt(req.params.id);
    const entities = await pool.query(`SELECT * FROM mig_entities WHERE project_id=$1`, [projectId]);
    const total = entities.rows.length;

    const { rows: batchRows } = await pool.query(
      `INSERT INTO mig_import_batches (project_id, batch_type, status, records_total, started_at) VALUES ($1,'trial','running',$2,NOW()) RETURNING *`,
      [projectId, total]
    );
    const batchId = batchRows[0].id;

    runTrialImport(projectId, batchId, entities.rows).catch(console.error);

    await pool.query(`UPDATE mig_projects SET status='trial_imported' WHERE id=$1`, [projectId]);
    await addAudit(orgId, projectId, 'trial_import_started', 'batch', String(batchId), req.user!.id, null, { total });

    res.json({ batch_id: batchId, total, message: "Trial import started" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

async function runTrialImport(projectId: number, batchId: number, entities: any[]) {
  let imported = 0, failed = 0;
  for (const ent of entities) {
    try {
      await pool.query(
        `UPDATE mig_entities SET status='imported', target_type=$1 WHERE id=$2`,
        [ent.source_type, ent.id]
      );
      imported++;
    } catch (_) { failed++; }
  }
  const report = {
    imported, failed, skipped: 0,
    accuracy: imported > 0 ? Math.round((imported / Math.max(imported + failed, 1)) * 100) : 0
  };
  await pool.query(
    `UPDATE mig_import_batches SET status='completed', records_imported=$1, records_failed=$2, finished_at=NOW(), report=$3 WHERE id=$4`,
    [imported, failed, JSON.stringify(report), batchId]
  );
}

router.get("/projects/:id/batches", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });
    const { rows } = await pool.query(`SELECT * FROM mig_import_batches WHERE project_id=$1 ORDER BY started_at DESC`, [req.params.id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/projects/:id/batches/:batchId/rollback", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const projectId = parseInt(req.params.id);
    await pool.query(`UPDATE mig_import_batches SET status='rolled_back', rollback_available=FALSE WHERE id=$1`, [req.params.batchId]);
    await pool.query(`UPDATE mig_entities SET status='pending', target_type=NULL WHERE project_id=$1`, [projectId]);
    await pool.query(`UPDATE mig_projects SET status='mapping_required' WHERE id=$1`, [projectId]);
    await addAudit(orgId, projectId, 'batch_rollback', 'batch', req.params.batchId, req.user!.id, null, null);
    res.json({ ok: true, message: "Rollback completed" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── RECONCILIATION ────────────────────────────────────────────────────────────

router.get("/projects/:id/reconciliation", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT * FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const projectId = parseInt(req.params.id);
    const [total, imported, failed, breakdown, lastBatch] = await Promise.all([
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1`, [projectId]),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 AND status='imported'`, [projectId]),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_entities WHERE project_id=$1 AND status='failed'`, [projectId]),
      pool.query(`SELECT source_type, COUNT(*) as total, COUNT(CASE WHEN status='imported' THEN 1 END) as imported FROM mig_entities WHERE project_id=$1 GROUP BY source_type`, [projectId]),
      pool.query(`SELECT * FROM mig_import_batches WHERE project_id=$1 ORDER BY started_at DESC LIMIT 1`, [projectId]),
    ]);

    const totalN = parseInt(total.rows[0]?.cnt || '0');
    const importedN = parseInt(imported.rows[0]?.cnt || '0');
    const failedN = parseInt(failed.rows[0]?.cnt || '0');
    const accuracy = totalN > 0 ? (importedN / totalN) * 100 : 0;

    res.json({
      accuracy: Math.round(accuracy * 100) / 100,
      total: totalN,
      imported: importedN,
      failed: failedN,
      skipped: totalN - importedN - failedN,
      breakdown: breakdown.rows,
      last_batch: lastBatch.rows[0] || null,
      status: accuracy >= 99 ? 'excellent' : accuracy >= 95 ? 'good' : accuracy >= 80 ? 'acceptable' : 'poor',
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GO LIVE ───────────────────────────────────────────────────────────────────

router.post("/projects/:id/go-live", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    if (!['owner', 'super_admin'].includes(req.user!.role)) {
      return res.status(403).json({ error: "Тільки Власник або Адміністратор може підтвердити Go Live" });
    }
    const proj = await pool.query(`SELECT * FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });

    const projectId = parseInt(req.params.id);
    const [health, critErrors] = await Promise.all([
      computeHealth(projectId),
      pool.query(`SELECT COUNT(*) as cnt FROM mig_validation_errors WHERE project_id=$1 AND severity='critical' AND status='open'`, [projectId]),
    ]);

    if (parseInt(critErrors.rows[0]?.cnt || '0') > 0) {
      return res.status(400).json({ error: `Є критичні помилки які потрібно вирішити перед Go Live` });
    }
    if (health < 70) {
      return res.status(400).json({ error: `Health Score (${health}%) нижче мінімуму 70% для Go Live` });
    }

    await pool.query(
      `UPDATE mig_projects SET status='completed', completed_at=NOW(), go_live_date=NOW() WHERE id=$1`, [projectId]
    );
    await addAudit(orgId, projectId, 'go_live_approved', 'project', String(projectId), req.user!.id, null, { health_score: health });

    res.json({ ok: true, message: "Go Live підтверджено! MaisonHD тепер є основною системою.", health_score: health });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────

router.get("/projects/:id/audit", requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId;
    const proj = await pool.query(`SELECT id FROM mig_projects WHERE id=$1 AND org_id=$2`, [req.params.id, orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: "Not found" });
    const { rows } = await pool.query(
      `SELECT l.*, u.name as user_name FROM mig_audit_logs l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE l.project_id=$1 ORDER BY l.created_at DESC LIMIT 200`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
