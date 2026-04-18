/**
 * Security routes:
 *   GET  /api/security/audit-logs         — перегляд audit log (admin only)
 *   POST /api/security/backup             — ручний запуск резервного копіювання
 *   GET  /api/security/backup/list        — список наявних бекапів
 */
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { getAuditLogs, logAudit, auditFromReq } from "../lib/audit.js";
import { runBackup } from "../lib/backup.js";
import { objectStorageClient } from "../lib/objectStorage.js";

const router = Router();

function requireAdminOrSuperAdmin(req: any, res: any, next: any) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!["admin", "manager", "super_admin"].includes(user.role)) {
    return res.status(403).json({ error: "Forbidden", message: "Admin access required" });
  }
  next();
}

// ── Audit Logs ─────────────────────────────────────────────────────────────────
router.get("/audit-logs", requireAuth, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const orgId: number = user.role === "super_admin"
      ? parseInt(req.query.orgId as string || "0") || user.organizationId
      : user.organizationId;

    if (!orgId) return res.status(400).json({ error: "orgId required" });

    const { logs, total } = await getAuditLogs(orgId, {
      resourceType: req.query.resourceType as string,
      resourceId: req.query.resourceId as string,
      action: req.query.action as string,
      limit: Math.min(parseInt(req.query.limit as string || "50"), 200),
      offset: parseInt(req.query.offset as string || "0"),
    });

    await logAudit({
      ...auditFromReq(req),
      action: "view_sensitive",
      resourceType: "audit_log",
      meta: { filter: req.query },
    });

    res.json({ logs, total });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Manual Backup ──────────────────────────────────────────────────────────────
router.post("/backup", requireAuth, requireAdminOrSuperAdmin, async (req: any, res) => {
  try {
    const user = req.user;
    if (user.role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden", message: "Only super_admin can trigger manual backup" });
    }

    const result = await runBackup();

    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: "Резервна копія успішно створена",
      path: result.path,
      sizeKb: result.size ? Math.round(result.size / 1024) : undefined,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Backup List ────────────────────────────────────────────────────────────────
router.get("/backup/list", requireAuth, requireAdminOrSuperAdmin, async (req: any, res) => {
  try {
    const user = req.user;
    if (user.role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return res.json({ backups: [], error: "Storage not configured" });

    const [files] = await objectStorageClient.bucket(bucketId).getFiles({ prefix: "backups/" });
    const backups = files
      .filter(f => f.name.endsWith(".sql.gz"))
      .sort((a, b) => b.name.localeCompare(a.name))
      .map(f => ({
        name: f.name.replace("backups/", ""),
        path: f.name,
        created: f.metadata?.timeCreated,
        size: f.metadata?.size ? Math.round(Number(f.metadata.size) / 1024) + " KB" : "—",
      }));

    res.json({ backups, count: backups.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
