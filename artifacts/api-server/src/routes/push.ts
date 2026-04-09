import { Router } from "express";
import webpush from "web-push";
import { requireAuth } from "../lib/auth.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@maisonhd.com",
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || ""
);

// ─── Get VAPID public key ──────────────────────────────────────────────────────
router.get("/vapid-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

// ─── Subscribe ─────────────────────────────────────────────────────────────────
router.post("/subscribe", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const orgId = req.user.organizationId;
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription object" });
    }
    await db.execute(sql`
      INSERT INTO push_subscriptions (user_id, organization_id, endpoint, p256dh, auth)
      VALUES (${userId}, ${orgId}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
      ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = ${keys.p256dh}, auth = ${keys.auth}
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Unsubscribe ───────────────────────────────────────────────────────────────
router.post("/unsubscribe", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { endpoint } = req.body;
    await db.execute(sql`
      DELETE FROM push_subscriptions WHERE user_id = ${userId} AND endpoint = ${endpoint}
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router };

// ─── Helper: send push to specific users ──────────────────────────────────────
export async function sendPushToUsers(userIds: number[], payload: object) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const subs = await db.execute(sql`
      SELECT * FROM push_subscriptions WHERE user_id = ANY(${userIds}::int[])
    `);
    for (const sub of subs.rows as any[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`);
        }
      }
    }
  } catch (e) {
    console.error("Push send error:", e);
  }
}

// ─── Helper: send push to entire org ──────────────────────────────────────────
export async function sendPushToOrg(orgId: number, payload: object, excludeUserId?: number) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const subs = await db.execute(sql`
      SELECT * FROM push_subscriptions
      WHERE organization_id = ${orgId}
        AND (${excludeUserId ?? null}::int IS NULL OR user_id != ${excludeUserId ?? null})
    `);
    for (const sub of subs.rows as any[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`);
        }
      }
    }
  } catch (e) {
    console.error("Push send error:", e);
  }
}
