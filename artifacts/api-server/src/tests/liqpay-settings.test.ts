import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query, connect: f.connect } }));
vi.mock("../lib/auth.js", () => ({
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }),
}));
vi.mock("express-rate-limit", () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
import router from "../routes/booking-liqpay-settings.js";
import { checkLiqpayCredentials } from "../lib/liqpay-connection.js";
import { decrypt, encrypt } from "../lib/encrypt.js";

const app = express();
app.use(express.json(), (req: any, _res, next) => { req.user = { organizationId: 1, role: req.headers["x-role"] || "owner" }; next(); });
app.use("/settings", router);
let seller: any, property: any, verification: Record<string, unknown>, outstanding: boolean, foreign: boolean, rotate: boolean;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SESSION_SECRET", "test-only-session-secret-with-over-32-bytes");
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://booking.example.invalid");
  verification = {}; outstanding = false; foreign = false; rotate = false;
  seller = { id: 7, name: "QA Seller", liqpay_public_key: "i_test_public", liqpay_private_key: encrypt("test_secret_123") };
  property = { id: 10, name: "QA Property", legal_entity_id: 7 };
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "error", err_code: "payment_not_found" })));
  f.connect.mockResolvedValue({ query: f.query, release: vi.fn() });
  f.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT id FROM organizations")) return { rows: [{ id: 1 }] };
    if (sql.startsWith("SELECT booking_engine_config")) return { rows: [{ booking_engine_config: { liqpayVerification: verification } }] };
    if (sql.startsWith("SELECT id,name,legal_entity_id")) return { rows: [{ id: 10, name: "QA Property", legalEntityId: property.legal_entity_id }] };
    if (sql.startsWith("SELECT id,name,liqpay_public_key")) return { rows: [{ ...seller }] };
    if (sql.includes("FROM properties WHERE id=")) return { rows: foreign ? [] : [{ ...property }] };
    if (sql.includes("FROM legal_entities WHERE id=")) {
      if (rotate && sql.includes("FOR SHARE")) return { rows: [{ ...seller, liqpay_public_key: "i_changed_key" }] };
      return { rows: foreign || values[0] !== 7 ? [] : [{ ...seller }] };
    }
    if (sql.includes("FROM bookings b")) return { rows: outstanding ? [{ id: 100 }] : [] };
    if (sql.startsWith("UPDATE legal_entities")) {
      seller.liqpay_public_key = values[0]; seller.liqpay_private_key = values[1]; return { rows: [] };
    }
    if (sql.startsWith("UPDATE properties")) { property.legal_entity_id = values[0]; return { rows: [] }; }
    if (sql.startsWith("UPDATE organizations")) { verification[String(values[1])] = JSON.parse(values[2]); return { rows: [] }; }
    throw new Error("Unexpected LiqPay settings fixture query");
  });
});
const save = (extra = {}, role = "owner") => request(app).put("/settings").set("x-role", role).send({ propertyId: 10, legalEntityId: 7, publicKey: "i_test_public", ...extra });
const check = () => request(app).post("/settings/check").send({ legalEntityId: 7 });

describe("Tenant-owned LiqPay cabinet settings", () => {
  it("never returns the plaintext or encrypted secret, only its presence", async () => {
    const result = await request(app).get("/settings");
    expect(result.status).toBe(200);
    expect(result.body.legalEntities[0].hasSecretKey).toBe(true);
    expect(result.body.legalEntities[0].verification.status).toBe("not_checked");
    expect(JSON.stringify(result.body)).not.toContain("test_secret_123");
    expect(JSON.stringify(result.body)).not.toContain(seller.liqpay_private_key);
  });
  it("stores new secret keys encrypted and returns no secret to the browser", async () => {
    const result = await save({ secretKey: "new_secret_456" });
    expect(result.status).toBe(200); expect(seller.liqpay_private_key).toMatch(/^enc:/);
    expect(decrypt(seller.liqpay_private_key)).toBe("new_secret_456");
    expect(JSON.stringify(result.body)).not.toContain("new_secret_456");
  });
  it("preserves an existing secret when omitted with an unchanged public key", async () => {
    const previous = seller.liqpay_private_key;
    expect((await save()).status).toBe(200); expect(seller.liqpay_private_key).toBe(previous);
  });
  it("requires a new secret when the public key changes", async () => {
    expect((await save({ publicKey: "i_other_public" })).status).toBe(400);
    expect(seller.liqpay_public_key).toBe("i_test_public");
  });
  it.each(["manager", "staff", "waiter"])("cannot change credentials as %s", async role => {
    expect((await save({ secretKey: "new_secret_456" }, role)).status).toBe(403);
    expect(f.query).not.toHaveBeenCalled();
  });
  it("cannot assign a foreign property's or seller's credentials", async () => {
    foreign = true; expect((await save({ secretKey: "new_secret_456" })).status).toBe(404);
    expect((await check()).status).toBe(404); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("blocks rotation while existing signed checkout links remain unreconciled", async () => {
    outstanding = true;
    expect((await save({ secretKey: "new_secret_456" })).status).toBe(409);
    expect(decrypt(seller.liqpay_private_key)).toBe("test_secret_123");
  });
  it("retains a checked status across reloads but invalidates it after key changes", async () => {
    expect((await check()).body.status).toBe("connected");
    const reload = await request(app).get("/settings");
    expect(reload.body.legalEntities[0].verification.status).toBe("connected");
    expect(reload.body.legalEntities[0].verification.checkedAt).toBeTruthy();
    expect(JSON.stringify(reload.body)).not.toContain("fingerprint");
    await save({ secretKey: "new_secret_456" });
    expect((await request(app).get("/settings")).body.legalEntities[0].verification.status).toBe("not_checked");
  });
  it("does not persist a stale success if another session changes keys during the check", async () => {
    rotate = true; expect((await check()).status).toBe(409); expect(verification).toEqual({});
  });
  it("rejects missing keys and masked placeholders", async () => {
    expect((await save({ secretKey: "••••••••" })).status).toBe(400);
    seller.liqpay_private_key = null;
    expect((await check()).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Read-only LiqPay API verification", () => {
  it("signs only a status lookup for a random nonexistent order, never a charge", async () => {
    const result = await checkLiqpayCredentials("i_test_public", "test_secret_123");
    expect(result.status).toBe("connected"); expect(result.mode).toBe("live");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.liqpay.ua/api/request"); expect(options.redirect).toBe("error");
    const params = new URLSearchParams(options.body);
    const payload = JSON.parse(Buffer.from(params.get("data")!, "base64").toString());
    expect(payload.action).toBe("status"); expect(payload.order_id).toMatch(/^mhd_connection_[0-9a-f]{32}$/);
    expect(payload).not.toHaveProperty("amount"); expect(params.get("signature")).toBeTruthy();
  });
  it.each(["invalid_signature", "err_signature", "err_auth", "public_key_not_found"])("does not mistake %s for a working connection", async err_code => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "error", err_code })));
    expect((await checkLiqpayCredentials("i_test_public", "test_secret_123")).status).toBe("failed");
  });
  it("does not mistake HTTP 200 alone for a valid connection", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "success" })));
    expect((await checkLiqpayCredentials("i_test_public", "test_secret_123")).status).toBe("failed");
  });
  it("clearly distinguishes test keys from live credentials", async () => {
    const result = await checkLiqpayCredentials("sandbox_i_test_public", "test_secret_123");
    expect(result.mode).toBe("test"); expect(result.message).toContain("не підтверджує");
  });
  it("handles network errors without exposing credentials or declaring success", async () => {
    fetchMock.mockRejectedValue(new Error("test_secret_123"));
    const result = await checkLiqpayCredentials("i_test_public", "test_secret_123");
    expect(result.status).toBe("failed"); expect(result.code).toBe("connection_failed");
    expect(JSON.stringify(result)).not.toContain("test_secret_123");
  });
});
