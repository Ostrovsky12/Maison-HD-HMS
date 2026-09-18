ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payment_session_id" integer;
ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_payment_session_uq"
  ON "payments" ("payment_session_id")
  WHERE "payment_session_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_org_liqpay_order_uq"
  ON "payments" ("organization_id", "liqpay_order_id")
  WHERE "liqpay_order_id" IS NOT NULL;