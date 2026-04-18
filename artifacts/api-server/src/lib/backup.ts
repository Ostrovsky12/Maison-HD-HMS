/**
 * Database Backup — pg_dump → object storage (GCS)
 * Runs daily via cron scheduler in index.ts
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { objectStorageClient } from "./objectStorage.js";
import { logAudit } from "./audit.js";

const execFileAsync = promisify(execFile);

function getBucketName(): string | null {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;
  return bucketId;
}

export async function runBackup(): Promise<{ ok: boolean; path?: string; size?: number; error?: string }> {
  const bucket = getBucketName();
  if (!bucket) {
    return { ok: false, error: "DEFAULT_OBJECT_STORAGE_BUCKET_ID не налаштовано" };
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { ok: false, error: "DATABASE_URL не налаштовано" };
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${dateStr}.sql`;
  const objectPath = `backups/${filename}`;

  try {
    console.log(`[backup] Starting pg_dump → ${objectPath}`);

    const { stdout } = await execFileAsync("pg_dump", [
      "--no-password",
      "--format=plain",
      "--no-owner",
      "--no-acl",
      dbUrl,
    ], {
      maxBuffer: 200 * 1024 * 1024, // 200MB
      timeout: 120_000, // 2 min
    });

    const dumpBuffer = Buffer.from(stdout, "utf8");
    const gzipped = await gzip(dumpBuffer);

    const gcsFile = objectStorageClient.bucket(bucket).file(`${objectPath}.gz`);
    await gcsFile.save(gzipped, {
      contentType: "application/gzip",
      metadata: {
        description: `Maison HD database backup ${dateStr}`,
        created: now.toISOString(),
      },
    });

    const sizeKb = Math.round(gzipped.length / 1024);
    console.log(`[backup] Done: ${objectPath}.gz (${sizeKb} KB)`);

    await logAudit({
      action: "backup_created",
      resourceType: "backup",
      resourceId: filename,
      meta: { path: `${objectPath}.gz`, sizeKb, timestamp: now.toISOString() },
    });

    await cleanOldBackups(bucket);

    return { ok: true, path: `${objectPath}.gz`, size: gzipped.length };
  } catch (err: any) {
    console.error("[backup] Failed:", err.message);
    await logAudit({
      action: "backup_failed",
      resourceType: "backup",
      meta: { error: err.message, timestamp: now.toISOString() },
    });
    return { ok: false, error: err.message };
  }
}

async function cleanOldBackups(bucket: string, keepCount = 30): Promise<void> {
  try {
    const [files] = await objectStorageClient.bucket(bucket).getFiles({ prefix: "backups/" });
    const sorted = files
      .filter(f => f.name.endsWith(".sql.gz"))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (sorted.length > keepCount) {
      const toDelete = sorted.slice(0, sorted.length - keepCount);
      await Promise.all(toDelete.map(f => f.delete()));
      console.log(`[backup] Cleaned ${toDelete.length} old backup(s)`);
    }
  } catch (e) {
    console.error("[backup] Failed to clean old backups:", e);
  }
}

async function gzip(input: Buffer): Promise<Buffer> {
  const { createGzip } = await import("zlib");
  const { pipeline } = await import("stream/promises");
  const { Readable, Writable } = await import("stream");

  const chunks: Buffer[] = [];
  const gz = createGzip({ level: 6 });

  const dest = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
  });

  await pipeline(Readable.from(input), gz, dest);
  return Buffer.concat(chunks);
}

// ─── Simple daily scheduler ───────────────────────────────────────────────────

let backupTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleBackups(): void {
  const runAt = nextRunTime();
  const msUntil = runAt.getTime() - Date.now();

  console.log(`[backup] Next backup scheduled at ${runAt.toISOString()} (in ${Math.round(msUntil / 60000)} min)`);

  backupTimer = setTimeout(async () => {
    await runBackup();
    scheduleBackups(); // reschedule for next day
  }, msUntil);
}

function nextRunTime(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(2, 0, 0, 0); // 02:00 UTC daily
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
}
