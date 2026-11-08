import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { canConfirmGuestItems } from "../lib/fb-guest-confirmation.js";
import { ServicePointError, resolveServicePoint, openServicePoint, releaseStaffItems, readServicePointBill, requestCashPayment, sharedQrPaymentReadiness } from "../lib/fb-service-points.js";
import rateLimit from "express-rate-limit";
import { isPosterManagedOrder, dispatchPosterOrder } from "../lib/poster-order-bridge.js";
import {
  ResolveFbServicePointBody, ResolveFbServicePointResponse,
  OpenFbServicePointParams, OpenFbServicePointBody, OpenFbServicePointResponse,
  DispatchFbOrderItemsParams, DispatchFbOrderItemsBody, DispatchFbOrderItemsResponse,
  GetFbServicePointBillParams, GetFbServicePointBillResponse,
  RequestFbCashPaymentParams, RequestFbCashPaymentBody, RequestFbCashPaymentResponse,
} from "@workspace/api-zod";

const router = Router();
router.get("/public/service-points/:slug/:id/bill", rateLimit({ windowMs: 60000, max: 120,
  standardHeaders: true, legacyHeaders: false }), async (req: any, res): Promise<void> => {
  const params = GetFbServicePointBillParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Некоректне місце." }); return; }
  try {
    const bill = await readServicePointBill(params.data.slug, params.data.id);
    const managed = bill.order ? await isPosterManagedOrder(bill.orgId, bill.order.id) : false;
    res.setHeader("Cache-Control", "no-store");
    res.json(GetFbServicePointBillResponse.parse({ point: bill.point, order: bill.order, items: bill.items,
      // Credentials alone do not establish payment settlement/receipt closure.
      // The legacy LiqPay callback handles tips, not this shared-bill lifecycle.
      paymentAvailable: sharedQrPaymentReadiness.checkout,
      cashRequestAvailable: bill.payable,
      cashRequestPending: bill.cashRequestPending ?? false,
      cashRequestDestination: "maison_hd",
      tipsAvailable: sharedQrPaymentReadiness.tipPayout,
      tipsMessage: "Доступ до виплат на картки ще не підтверджений. Чайові не списуватимуться.",
      paymentMessage: !bill.order ? "Відкритого рахунку немає."
        : managed ? "Рахунок обслуговує Poster. Онлайн-розрахунок через Poster ще не підключений — зверніться до офіціанта."
        : !bill.payable ? "Оплата стане доступною після прийняття гостьових позицій і перевірки рахунку."
        : "Онлайн-розрахунок спільного рахунку ще не підключений. Для оплати зверніться до офіціанта." }));
  } catch (error) { fail(req, res, error); }
});
router.post("/public/service-points/:slug/:id/cash-request",
  rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }),
  async (req: any, res): Promise<void> => {
    const params = RequestFbCashPaymentParams.safeParse(req.params);
    const body = RequestFbCashPaymentBody.safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: "Перевірте місце та рахунок." }); return; }
    try {
      res.json(RequestFbCashPaymentResponse.parse(await requestCashPayment(params.data.slug, params.data.id, body.data)));
    } catch (error) { fail(req, res, error); }
  });
router.use(["/service-points", "/orders/:id/dispatch-items"], requireAuth, (req: any, res, next) => {
  if (!req.user.organizationId || !canConfirmGuestItems(req.user.role)) {
    res.status(403).json({ error: "Доступно персоналу закладу." }); return;
  }
  next();
});

function fail(req: any, res: any, error: unknown) {
  if (error instanceof ServicePointError) { res.status(error.status).json({ error: error.message }); return; }
  req.log.warn({ operation: "service_point" }, "Service point operation failed");
  res.status(503).json({ error: "Операцію не підтверджено. Оновіть рахунок перед повтором." });
}

router.post("/service-points/resolve", async (req: any, res): Promise<void> => {
  const input = ResolveFbServicePointBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Некоректний QR." }); return; }
  try {
    res.json(ResolveFbServicePointResponse.parse(await resolveServicePoint(req.user.organizationId, input.data.qr)));
  } catch (error) { fail(req, res, error); }
});

router.post("/service-points/:id/open", async (req: any, res): Promise<void> => {
  const params = OpenFbServicePointParams.safeParse(req.params);
  const body = OpenFbServicePointBody.safeParse(req.body || {});
  if (!params.success || !body.success) { res.status(400).json({ error: "Некоректне місце або точка продажу." }); return; }
  try { res.json(OpenFbServicePointResponse.parse(await openServicePoint(req.user.organizationId, params.data.id, undefined, body.data?.outletId))); }
  catch (error) { fail(req, res, error); }
});

router.post("/orders/:id/dispatch-items", async (req: any, res): Promise<void> => {
  const params = DispatchFbOrderItemsParams.safeParse(req.params), input = DispatchFbOrderItemsBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Перевірте замовлення і вибрані страви." }); return; }
  try {
    const orgId = req.user.organizationId, id = params.data.id;
    const posterManaged = await isPosterManagedOrder(orgId, id);
    const releasedCount = await releaseStaffItems(orgId, id, input.data.itemIds);
    // Persist the reviewed snapshot before contacting a provider. The bridge journals all writes.
    const state = posterManaged ? await dispatchPosterOrder(orgId, id) : null;
    res.json(DispatchFbOrderItemsResponse.parse({ releasedCount, posterManaged,
      message: state?.message || (posterManaged ? "Передавання в Poster очікується."
        : "Позиції відправлено. Друк через Poster для цього рахунку не підключений.") }));
  } catch (error) { fail(req, res, error); }
});

export default router;
