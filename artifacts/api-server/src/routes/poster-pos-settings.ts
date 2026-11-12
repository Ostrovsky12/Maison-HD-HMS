import { Router } from "express";
import { GetPosterPosNotificationsResponse, UpdatePosterPosNotificationsBody, UpdatePosterPosNotificationsResponse } from "@workspace/api-zod";
import { bridgeAccount, bridgeCall } from "../lib/poster-order-bridge.js";
import { configurePosChannel, readPosChannel, visiblePosChannel, PosterPosError } from "../lib/poster-pos-notifications.js";

// Mounted below /poster's existing requireAuth and organization boundary.
const router = Router();
router.use((req: any, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!["owner", "manager", "admin", "super_admin"].includes(req.user?.role)) {
    res.status(403).json({ error: "Підключення каси доступне керівнику закладу." }); return;
  }
  next();
});
router.get("/", async (req: any, res) => {
  try { res.json(GetPosterPosNotificationsResponse.parse(visiblePosChannel(await readPosChannel(req.user.organizationId)))); }
  catch { res.status(503).json({ error: "Не вдалося прочитати стан каси." }); }
});
router.put("/", async (req: any, res) => {
  const input = UpdatePosterPosNotificationsBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Вкажіть заклад і касу Poster." }); return; }
  try {
    const { account } = await bridgeAccount(req.user.organizationId);
    if (!account?.apiKey || !account.verified || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(account.accountId)) {
      throw new PosterPosError(409, "Спочатку підключіть Poster і вкажіть точну назву його акаунту.");
    }
    if (input.data.enabled) {
      if (!process.env.POSTER_POS_APPLICATION_SECRET) throw new PosterPosError(503, "Секрет касового застосунку ще не налаштований.");
      const tablets = await bridgeCall(account.apiKey, "access.getTablets");
      if (!Array.isArray(tablets) || !tablets.some((t: any) => Number(t.tablet_id) === input.data.tabletId
        && Number(t.spot_id) === input.data.spotId)) {
        throw new PosterPosError(400, "Вибрана каса не належить цьому закладу Poster.");
      }
    }
    res.json(UpdatePosterPosNotificationsResponse.parse(await configurePosChannel(req.user.organizationId, input.data, account.accountId)));
  } catch (e) {
    if (e instanceof PosterPosError) res.status(e.status).json({ error: e.message });
    else res.status(503).json({ error: "Не вдалося налаштувати касу. Попередній стан не змінено." });
  }
});
export default router;
