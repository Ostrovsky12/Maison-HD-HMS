/**
 * Audit Log — записує хто, коли, яку дію виконав над чутливими даними
 * Table: audit_logs (created in ensureSchema)
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type AuditAction =
  | "view_sensitive"        // перегляд чутливих даних
  | "update_sensitive"      // зміна чутливих даних
  | "delete"                // видалення запису
  | "anonymize"             // GDPR: анонімізація гостя
  | "export"                // експорт даних
  | "login"                 // вхід в систему
  | "login_failed"          // невдалий вхід
  | "view_keys"             // перегляд API ключів
  | "backup_created"        // створено резервну копію
  | "backup_failed";        // помилка резервної копії

export interface AuditEntry {
  orgId?: number | null;
  userId?: number | null;
  userEmail?: string | null;
  action: AuditAction;
  resourceType: string;      // "guest", "legal_entity", "booking", "settings", "backup"
  resourceId?: string | null;
  meta?: Record<string, any> | null;
  ipAddress?: string | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO audit_logs
        (org_id, user_id, user_email, action, resource_type, resource_id, meta, ip_address, created_at)
      VALUES
        (${entry.orgId ?? null}, ${entry.userId ?? null}, ${entry.userEmail ?? null},
         ${entry.action}, ${entry.resourceType}, ${entry.resourceId ?? null},
         ${entry.meta ? JSON.stringify(entry.meta) : null}::jsonb,
         ${entry.ipAddress ?? null}, NOW())
    `);
  } catch (e) {
    console.error("[audit] Failed to write audit log:", e);
  }
}

export function auditFromReq(req: any): Pick<AuditEntry, "orgId" | "userId" | "userEmail" | "ipAddress"> {
  const user = req.user || {};
  return {
    orgId: user.organizationId ?? null,
    userId: user.userId ?? user.id ?? null,
    userEmail: user.email ?? null,
    ipAddress: req.ip ?? req.headers?.["x-forwarded-for"] ?? null,
  };
}

export async function getAuditLogs(orgId: number, opts: {
  resourceType?: string;
  resourceId?: string;
  action?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ logs: any[]; total: number }> {
  const { resourceType, resourceId, action, limit = 50, offset = 0 } = opts;

  const conditions: string[] = ["org_id = $1"];
  const params: any[] = [orgId];
  let paramIdx = 2;

  if (resourceType) { conditions.push(`resource_type = $${paramIdx++}`); params.push(resourceType); }
  if (resourceId)   { conditions.push(`resource_id = $${paramIdx++}`); params.push(resourceId); }
  if (action)       { conditions.push(`action = $${paramIdx++}`); params.push(action); }

  const where = conditions.join(" AND ");
  const db_ = (db as any).$client;

  const countR = await db_.query(`SELECT COUNT(*) as total FROM audit_logs WHERE ${where}`, params);
  const logsR  = await db_.query(
    `SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return { logs: logsR.rows, total: Number(countR.rows[0]?.total || 0) };
}
