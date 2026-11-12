import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  PairPosterPosBody, PairPosterPosResponse, PollPosterPosBody, PollPosterPosResponse,
  AcknowledgePosterPosBody, AcknowledgePosterPosResponse,
  PollPosterKitchenBody, PollPosterKitchenResponse, ClaimPosterKitchenBody, ClaimPosterKitchenResponse,
  RecordPosterKitchenResultBody, RecordPosterKitchenResultResponse,
} from "@workspace/api-zod";
import { verifyPosSignature, authenticatePos, pollPos, acknowledgePos, PosterPosError } from "../lib/poster-pos-notifications.js";
import { pollKitchen, claimKitchen, recordKitchen } from "../lib/poster-kitchen.js";

const router = Router();
router.use(rateLimit({ windowMs: 60000, max: 300, standardHeaders: true, legacyHeaders: false }));
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try { verifyPosSignature(req.originalUrl, req.body, req.headers); next(); }
  catch (e) { fail(req, res, e); }
});
function fail(req: any, res: any, e: unknown) {
  if (e instanceof PosterPosError) {
    if (e.signatureFailure) {
      // An allowlisted category only: never log bodies, credentials or signature values.
      req.log?.warn({ operation: "poster_pos_signature", reason: e.signatureFailure }, "Poster signature rejected");
    }
    return res.status(e.status).json({ error: e.message });
  }
  req.log?.warn({ operation: "poster_pos" }, "Poster terminal notification unavailable");
  return res.status(503).json({ error: "Зв’язок із касовим модулем не підтверджено." });
}
router.post("/kitchen/poll", async (req, res): Promise<void> => {
  const input = PollPosterKitchenBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Некоректний запит каси." }); return; }
  try { res.json(PollPosterKitchenResponse.parse(await pollKitchen(input.data, input.data.token))); }
  catch (e) { fail(req, res, e); }
});
router.post("/kitchen/claim", async (req, res): Promise<void> => {
  const input = ClaimPosterKitchenBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Перевірте завдання бігунків." }); return; }
  try { res.json(ClaimPosterKitchenResponse.parse(await claimKitchen(input.data, input.data.token, input.data))); }
  catch (e) { fail(req, res, e); }
});
router.post("/kitchen/result", async (req, res): Promise<void> => {
  const input = RecordPosterKitchenResultBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Некоректний результат каси." }); return; }
  try { res.json(RecordPosterKitchenResultResponse.parse(await recordKitchen(input.data, input.data.token, input.data))); }
  catch (e) { fail(req, res, e); }
});
router.post("/pair", async (req, res) => {
  const input = PairPosterPosBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Перевірте код підключення." }); return; }
  try {
    const session = await authenticatePos(input.data, input.data.code, true);
    res.json(PairPosterPosResponse.parse({ token: session.token }));
  } catch (e) { fail(req, res, e); }
});
router.post("/poll", async (req, res) => {
  const input = PollPosterPosBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Некоректний запит каси." }); return; }
  try { res.json(PollPosterPosResponse.parse(await pollPos(input.data, input.data.token))); }
  catch (e) { fail(req, res, e); }
});
router.post("/ack", async (req, res) => {
  const input = AcknowledgePosterPosBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Некоректне підтвердження показу." }); return; }
  try { const d = input.data; res.json(AcknowledgePosterPosResponse.parse(await acknowledgePos(d, d.token, d.id, d.posterNotificationId))); }
  catch (e) { fail(req, res, e); }
});
export default router;
