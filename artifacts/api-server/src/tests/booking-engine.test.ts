import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), encrypt: vi.fn(), upload: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: fixture.query, connect: fixture.connect } }));
vi.mock("../lib/servio-sales.js", () => ({
  servioSalesReadiness: vi.fn(async () => ({ issues: ["Servio: продавець і пошта ще не налаштовані"], seller: null, mailbox: null, categories: [] })),
}));
vi.mock("../lib/encrypt.js", () => ({ encrypt: fixture.encrypt }));
vi.mock("../lib/objectStorage.js", () => ({ ObjectStorageService: class {
  getObjectEntityUploadURL = fixture.upload;
  normalizeObjectEntityPath() { return "/objects/uploads/qa-only"; }
} }));
vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) { res.status(401).json({ error: "Unauthorized" }); return; }
    req.user = { organizationId: Number(req.headers["x-test-org"] || 1), role: req.headers["x-test-role"] || "owner" };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }),
}));
import router, { publicEngineRouter } from "../routes/booking-engine.js";
import { engineConfig, engineIssues, engineQuote, engineSalesGuard, publicEngineConfig, validBookingDates, bookingUnitMedia, validBookingMediaUrl, bookingAppearance } from "../lib/booking-engine.js";
import { servioFingerprint } from "../lib/servio-connection.js";

const app = express();
app.use(express.json());
app.use("/api/booking-engine", router);
app.use("/api/public/booking-engine", publicEngineRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
// Structured request logger for the successful mutation path.
app.request.log = { info: vi.fn() } as any;

const ready = () => ({
  provider: "maison" as const, published: false, displayName: "Test hotel", description: "Actual hotel description",
  accentColor: "#1f5648", logoUrl: "", phone: "+380000000000", email: "",
  checkInTime: "14:00", checkOutTime: "12:00", terms: "Hotel booking terms",
  privacy: "Hotel privacy policy", servioBaseUrl: "", servioHotelId: "",
});
let org: any;
let units = 2;

beforeEach(() => {
  vi.clearAllMocks(); units = 2;
  org = { id: 1, name: "Test hotel", slug: "test-hotel", is_active: true, booking_engine_config: ready() };
  fixture.encrypt.mockImplementation(() => "enc:opaque-test-value");
  fixture.upload.mockResolvedValue("https://storage.example.invalid/upload");
  fixture.connect.mockResolvedValue({ query: fixture.query, release: vi.fn() });
  fixture.query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("FROM organizations")) return { rows: values[0] === 2 ? [] : [{ ...org }] };
    if (sql.includes("FROM properties WHERE")) return { rows: [{ id: 10, name: "Property" }] };
    if (sql.includes("count(*)::int AS count")) return { rows: [{ count: units }] };
    if (sql.includes("FROM units u")) return { rows: [{ id: 11, name: "House", propertyId: 10, propertyName: "Property" }] };
    if (sql.startsWith("UPDATE organizations")) { org.booking_engine_config = JSON.parse(values[1]); return { rows: [] }; }
    if (sql.includes("FROM bookings")) return { rows: [] };
    throw new Error("Unexpected fixture SQL");
  });
});

describe("DOGODA guest appearance and private read-only preview", () => {
  it("enables the brand only for the exact DOGODA tenant, never an editable hotel name", () => {
    expect(engineConfig({ ...org, slug: "dogoda" }).appearance).toMatchObject({
      preset: "dogoda", textColor: "#292D05", mutedColor: "#A19958",
      backgroundColor: "#FFDDB2", buttonColor: "#DF7D3C", font: "brand",
    });
    expect(engineConfig({ ...org, name: "DOGODA" }).appearance?.preset).toBe("standard");
    expect(engineConfig({ ...org, slug: "another", booking_engine_config: { appearance: { preset: "dogoda" } } }).appearance?.preset).toBe("standard");
  });
  it("preserves stored appearance for internal callers that do not select the tenant slug", () => {
    const appearance = { ...bookingAppearance(undefined, true), backgroundColor: "#FFEEDD" };
    const { slug: _slug, ...internalOrg } = { ...org, booking_engine_config: { ...ready(), appearance } };
    expect(engineConfig(internalOrg).appearance).toEqual(appearance);
    expect(engineConfig({ id: 7, name: "Hotel", booking_engine_config: ready() }).appearance).toBeUndefined();
  });
  it("saves and reloads custom tenant colors, typography, hero and gallery visibility", async () => {
    org.slug = "dogoda";
    const appearance = { ...bookingAppearance(undefined, true), backgroundColor: "#FFEEDD", font: "system",
      heroPhotoUrl: "https://example.invalid/saved-hero.jpg", showGallery: false };
    const saved = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), appearance });
    expect(saved.status).toBe(200);
    const reloaded = await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test");
    expect(reloaded.body.config).toMatchObject({ appearance, dogodaBrandAvailable: true });
    expect(org.booking_engine_config.published).toBe(false);
  });
  it("preserves previous appearance on an older client's general settings save", async () => {
    org.slug = "dogoda";
    org.booking_engine_config.appearance = { ...bookingAppearance(undefined, true), buttonColor: "#765432" };
    const saved = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send(ready());
    expect(saved.status).toBe(200);
    expect(org.booking_engine_config.appearance.buttonColor).toBe("#765432");
  });
  it("rejects another tenant selecting DOGODA and managers changing the design", async () => {
    const appearance = bookingAppearance(undefined, true);
    expect((await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), appearance })).status).toBe(403);
    org.slug = "dogoda";
    expect((await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").set("x-test-role", "manager")
      .send({ ...ready(), appearance: { ...appearance, textColor: "#123456" } })).status).toBe(403);
  });
  it.each(["javascript:alert(1)", "http://example.invalid/a.jpg", "//elsewhere/a.jpg", "/objects/../secret", "https://user:password@example.invalid/a.jpg"])("rejects unsafe hero photo %s", async heroPhotoUrl => {
    org.slug = "dogoda";
    const response = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), appearance: { ...bookingAppearance(undefined, true), heroPhotoUrl } });
    expect(response.status).toBe(400);
  });
  it("rejects arbitrary CSS colors and unapproved fonts", async () => {
    org.slug = "dogoda";
    for (const invalid of [{ textColor: "red; background:url(x)" }, { font: "Unapproved Font" }]) {
      expect((await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
        .send({ ...ready(), appearance: { ...bookingAppearance(undefined, true), ...invalid } })).status).toBe(400);
    }
  });
  it("allows preview only to the same tenant owner/admin and makes no mutation", async () => {
    org.slug = "dogoda"; org.booking_engine_config.provider = "servio";
    const preview = "/api/public/booking-engine/dogoda?preview=true";
    expect((await request(app).get(preview)).status).toBe(401);
    expect((await request(app).get(preview).set("Authorization", "Bearer test").set("x-test-role", "manager")).status).toBe(403);
    expect((await request(app).get(preview).set("Authorization", "Bearer test").set("x-test-org", "99")).status).toBe(404);
    const result = await request(app).get(preview).set("Authorization", "Bearer test");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ preview: true, salesEnabled: false, config: { appearance: { preset: "dogoda" } } });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(fixture.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
    expect((await request(app).get("/api/public/booking-engine/dogoda")).status).toBe(404);
    expect((await request(app).get("/api/public/booking-engine/dogoda?preview=false")).status).toBe(404);
  });
  it("returns only the verified Servio category media in preview, not local rooms or credentials", async () => {
    const { servioFingerprint } = await import("../lib/servio-connection.js");
    const { servioCategorySource } = await import("../lib/servio-category-media.js");
    org.slug = "dogoda";
    const config = { ...ready(), provider: "servio", servioBaseUrl: "https://example.servio.support/ReservationService_1_10",
      servioHotelId: "7", servioToken: "test-only-opaque" } as any;
    config.servioVerification = { fingerprint: servioFingerprint(config),
      result: { status: "connected", code: "CONNECTED", message: "Ready", pingOk: true, checkedAt: "2026-01-01T00:00:00.000Z",
        hotelId: 7, categories: [{ id: 11, name: "Servio category", hotelId: 7 }] } };
    config.servioCategoryMedia = { [servioCategorySource(config)!]: { "7:11": {
      revision: 2, media: { photos: ["https://example.invalid/category.jpg"], videoUrl: "https://example.invalid/tour.mp4", description: "Saved description" },
    } } };
    org.booking_engine_config = config;
    const response = await request(app).get("/api/public/booking-engine/dogoda?preview=1").set("Authorization", "Bearer test");
    expect(response.status).toBe(200);
    expect(response.body.accommodationCatalog).toEqual([{
      id: "servio:7:11", name: "Servio category", category: "Категорія розміщення",
      photos: ["https://example.invalid/category.jpg"], videoUrl: "https://example.invalid/tour.mp4", description: "Saved description",
    }]);
    expect(JSON.stringify(response.body)).not.toContain("test-only-opaque");
    expect(response.body.config).not.toHaveProperty("servioVerification");
    expect(response.body.config).not.toHaveProperty("servioBaseUrl");
  });
  it("exposes only visible local room media, while standard tenants keep standard branding", async () => {
    org.booking_engine_config.published = true;
    org.booking_engine_config.unitMedia = { "11": { photos: ["https://example.invalid/visible.jpg"], videoUrl: "", description: "Saved" },
      "99": { photos: ["https://example.invalid/hidden.jpg"], videoUrl: "", description: "Hidden" } };
    const response = await request(app).get("/api/public/booking-engine/test-hotel");
    expect(response.body.config.appearance.preset).toBe("standard");
    expect(response.body.accommodationCatalog).toEqual([expect.objectContaining({
      id: "unit:11", name: "House", photos: ["https://example.invalid/visible.jpg"], description: "Saved",
    })]);
    expect(JSON.stringify(response.body)).not.toContain("hidden.jpg");
    expect(response.body.salesEnabled).toBe(true);
  });
});

describe("configuration and tenant isolation", () => {
  it("trims copied Servio settings without clearing the same account's saved token", async () => {
    const base = "https://example.servio.support/ReservationService_1_10";
    org.booking_engine_config = { ...ready(), provider: "servio", servioBaseUrl: ` ${base} `, servioHotelId: "7 ", servioToken: "enc:existing-token" };
    const response = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), provider: "servio", servioBaseUrl: ` ${base} `, servioHotelId: "7 " });
    expect(response.status).toBe(200);
    expect(org.booking_engine_config.servioBaseUrl).toBe(base);
    expect(org.booking_engine_config.servioHotelId).toBe("7");
    expect(org.booking_engine_config.servioToken).toBe("enc:existing-token");
    expect(response.body.config.hasServioToken).toBe(true);
    expect(response.body.config.servioToken).toBeUndefined();
    expect(fixture.encrypt).not.toHaveBeenCalled();
  });
  it("provides an authorized direct upload without changing accommodation inventory", async () => {
    const res = await request(app).post("/api/booking-engine/media-upload").set("Authorization", "Bearer test")
      .send({ name: "house.jpg", size: 1234, contentType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(res.body.objectPath).toBe("/objects/uploads/qa-only");
    expect(fixture.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  });
  it("rejects unauthenticated media uploads", async () => {
    const res = await request(app).post("/api/booking-engine/media-upload").send({ name: "house.jpg", size: 1234, contentType: "image/jpeg" });
    expect(res.status).toBe(401);
    expect(fixture.upload).not.toHaveBeenCalled();
  });
  it.each([
    { name: "bad.svg", size: 100, contentType: "image/svg+xml" },
    { name: "bad.html", size: 100, contentType: "text/html" },
    { name: "big.jpg", size: 16 * 1024 * 1024, contentType: "image/jpeg" },
    { name: "big.mp4", size: 251 * 1024 * 1024, contentType: "video/mp4" },
  ])("rejects unsafe or oversized uploads %j", async body => {
    const res = await request(app).post("/api/booking-engine/media-upload").set("Authorization", "Bearer test").send(body);
    expect(res.status).toBe(400);
    expect(fixture.upload).not.toHaveBeenCalled();
  });
  it("blocks uploads for Servio until the independent category catalog has been verified", async () => {
    org.booking_engine_config.provider = "servio";
    const res = await request(app).post("/api/booking-engine/media-upload").set("Authorization", "Bearer test")
      .send({ name: "house.jpg", size: 1234, contentType: "image/jpeg" });
    expect(res.status).toBe(409);
    expect(fixture.upload).not.toHaveBeenCalled();
  });
  it("uploads media for verified Servio categories without mapping or creating local units", async () => {
    const config = org.booking_engine_config;
    Object.assign(config, { provider: "servio", servioToken: "opaque-token",
      servioBaseUrl: "https://example.servio.support/ReservationService_1_10", servioHotelId: "7" });
    config.servioVerification = { fingerprint: servioFingerprint(config), result: {
      status: "connected", code: "ok", message: "Connected", pingOk: true, checkedAt: new Date().toISOString(),
      categories: [{ hotelId: 7, id: 11, name: "House" }],
    } };
    const response = await request(app).post("/api/booking-engine/media-upload").set("Authorization", "Bearer test")
      .send({ name: "category.jpg", size: 1234, contentType: "image/jpeg" });
    expect(response.status).toBe(200);
    expect(fixture.upload).toHaveBeenCalledTimes(1);
    expect(fixture.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  });
  it("preserves independently saved Servio category media when general branding settings are saved", async () => {
    const independent = { source: { "7:11": { media: { photos: [], videoUrl: "", description: "Category" }, revision: 2 } } };
    org.booking_engine_config.servioCategoryMedia = independent;
    const response = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send(ready());
    expect(response.status).toBe(200);
    expect(org.booking_engine_config.servioCategoryMedia).toEqual(independent);
  });
  it("does not bind local media to an unconnected Servio inventory", async () => {
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send({
      ...ready(), provider: "servio", unitMedia: { "11": { photos: ["https://example.com/house.jpg"], videoUrl: "", description: "" } },
    });
    expect(res.status).toBe(409);
    expect(fixture.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE organizations"))).toBe(false);
  });
  it("saves and reloads owned accommodation galleries, video and full description", async () => {
    const unitMedia = { "11": { photos: ["https://example.com/house.jpg"], videoUrl: "https://example.com/tour.mp4", description: "Full house description" } };
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send({ ...ready(), unitMedia });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.config.unitMedia).toEqual(unitMedia);
    const reload = await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test");
    expect(reload.body.config.unitMedia).toEqual(unitMedia);
    expect(reload.body.units[0].name).toBe("House");
  });
  it("preserves saved media for older clients that omit the new optional field", async () => {
    org.booking_engine_config.unitMedia = { "11": { photos: ["https://example.com/house.jpg"], videoUrl: "", description: "Saved" } };
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send(ready());
    expect(res.status).toBe(200);
    expect(res.body.config.unitMedia["11"].description).toBe("Saved");
  });
  it("allows explicit removal of a gallery without silently restoring old media", async () => {
    org.booking_engine_config.unitMedia = { "11": { photos: ["https://example.com/house.jpg"], videoUrl: "", description: "Saved" } };
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send({ ...ready(), unitMedia: {} });
    expect(res.status).toBe(200);
    expect(res.body.config.unitMedia).toEqual({});
  });
  it("rejects another tenant's accommodation IDs without persisting", async () => {
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send({ ...ready(),
      unitMedia: { "999": { photos: ["https://example.com/foreign.jpg"], videoUrl: "", description: "" } } });
    expect(res.status).toBe(403);
    expect(fixture.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE organizations"))).toBe(false);
  });
  it.each(["javascript:alert(1)", "data:image/png;base64,abc", "http://example.com/a.jpg", "//evil.example/a.jpg", "https://user:password@example.com/a.jpg"])("rejects unsafe media URL %s", async url => {
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test").send({ ...ready(),
      unitMedia: { "11": { photos: [url], videoUrl: "", description: "" } } });
    expect(res.status).toBe(400);
    expect(fixture.query).not.toHaveBeenCalled();
  });
  it("publishes media only for visible accommodations, never hidden or foreign IDs", async () => {
    org.booking_engine_config.published = true;
    org.booking_engine_config.unitMedia = {
      "11": { photos: ["https://example.com/visible.jpg"], videoUrl: "", description: "Visible" },
      "999": { photos: ["https://example.com/hidden.jpg"], videoUrl: "", description: "Hidden" },
    };
    const res = await request(app).get("/api/public/booking-engine/test-hotel");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.config.unitMedia)).toEqual(["11"]);
    expect(JSON.stringify(res.body)).not.toContain("hidden.jpg");
  });
  it("sanitizes legacy malformed media and accepts public object paths", () => {
    expect(validBookingMediaUrl("/objects/public/house.jpg")).toBe(true);
    expect(bookingUnitMedia({ "11": { photos: ["javascript:alert(1)", "https://example.com/a.jpg", "https://example.com/a.jpg"], videoUrl: "data:text/html,evil", description: "Real" } }))
      .toEqual({ "11": { photos: ["https://example.com/a.jpg"], videoUrl: "", description: "Real" } });
  });
  it("starts as an unpublished local module", () => {
    const config = engineConfig({ name: "Hotel" });
    expect(config.published).toBe(false);
    expect(config.provider).toBe("maison");
    expect(config.terms).toBe("");
  });
  it("rejects unauthenticated settings", async () => {
    expect((await request(app).get("/api/booking-engine/settings")).status).toBe(401);
    expect(fixture.query).not.toHaveBeenCalled();
  });
  it("rejects unsupported staff roles before reading data", async () => {
    expect((await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test").set("x-test-role", "reception")).status).toBe(403);
    expect(fixture.query).not.toHaveBeenCalled();
  });
  it("requires a selected tenant even for super admin", async () => {
    expect((await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test").set("x-test-org", "0")).status).toBe(400);
  });
  it("cannot choose another tenant through query or body", async () => {
    const res = await request(app).get("/api/booking-engine/settings?organizationId=2").set("Authorization", "Bearer test");
    expect(res.status).toBe(200);
    expect(res.body.organization.id).toBe(1);
    expect(fixture.query.mock.calls.every(([, values]) => values[0] === 1)).toBe(true);
  });
  it("returns 404 for an unavailable tenant", async () => {
    expect((await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test").set("x-test-org", "2")).status).toBe(404);
  });
  it("never returns encrypted or plaintext credentials", async () => {
    org.booking_engine_config.servioToken = "enc:secret-ciphertext";
    const res = await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test");
    expect(res.body.config.hasServioToken).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("secret-ciphertext");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
  it("persists edited branding and publication", async () => {
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), displayName: "Published hotel", published: true });
    expect(res.status).toBe(200);
    expect(res.body.config.published).toBe(true);
    const reload = await request(app).get("/api/booking-engine/settings").set("Authorization", "Bearer test");
    expect(reload.body.config.displayName).toBe("Published hotel");
  });
  it("allows owner publication of Servio with readiness warnings", async () => {
    const draft = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), provider: "servio" });
    expect(draft.status).toBe(200);
    expect(draft.body.readiness.canPublish).toBe(true);
    expect(draft.body.readiness.issues.length).toBeGreaterThan(0);
    const published = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), provider: "servio", published: true });
    expect(published.status).toBe(200);
    expect(org.booking_engine_config.published).toBe(true);
    const page = await request(app).get("/api/public/booking-engine/test-hotel");
    expect(page.status).toBe(200);
    expect(page.body.salesEnabled).toBe(false);
  });
  it("keeps missing legal texts and inventory as warnings, not publication blockers", async () => {
    units = 0;
    const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), terms: "", privacy: "", published: true });
    expect(res.status).toBe(200);
    expect(res.body.config.published).toBe(true);
    expect(res.body.readiness.issues.length).toBeGreaterThanOrEqual(3);
  });
  it.each(["http://example.test", "javascript:alert(1)", "https://u:password@example.test", "https://example.test/#token"])(
    "rejects unsafe endpoint syntax %s", async url => {
      const res = await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
        .send({ ...ready(), servioBaseUrl: url });
      expect(res.status).toBe(400);
    });
  it("encrypts a new tenant token, preserves it when blank, and explicitly clears it", async () => {
    const save = (extra: any) => request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), ...extra });
    expect((await save({ servioToken: "test-only-not-a-real-secret" })).status).toBe(200);
    expect(org.booking_engine_config.servioToken).toBe("enc:opaque-test-value");
    expect((await save({ servioToken: "" })).body.config.hasServioToken).toBe(true);
    expect((await save({ clearServioToken: true })).body.config.hasServioToken).toBe(false);
  });
  it("clears credentials when upstream identity changes without a new token", async () => {
    org.booking_engine_config.servioToken = "enc:previous-account";
    await request(app).put("/api/booking-engine/settings").set("Authorization", "Bearer test")
      .send({ ...ready(), servioBaseUrl: "https://different.example.test" });
    expect(org.booking_engine_config.servioToken).toBeUndefined();
  });
  it("public response contains only published branding, not upstream settings", async () => {
    org.booking_engine_config = { ...ready(), published: true, servioToken: "enc:private", servioBaseUrl: "https://private.example.test" };
    const res = await request(app).get("/api/public/booking-engine/test-hotel");
    expect(res.status).toBe(200);
    expect(res.body.properties).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("private");
    expect(publicEngineConfig(org.booking_engine_config)).not.toHaveProperty("servioToken");
  });
  it("does not expose draft, inactive or unsupported-provider pages", async () => {
    expect((await request(app).get("/api/public/booking-engine/test-hotel")).status).toBe(404);
    org.booking_engine_config.provider = "servio";
    expect((await request(app).get("/api/public/booking-engine/test-hotel")).status).toBe(404);
    org.is_active = false;
    expect((await request(app).get("/api/public/booking-engine/test-hotel")).status).toBe(404);
  });
});

describe("sales guard", () => {
  it("preserves legacy unconfigured local sales but new module requires publication", async () => {
    org.booking_engine_config = null;
    expect(await engineSalesGuard("test-hotel")).toBeNull();
    expect((await engineSalesGuard("test-hotel", true))?.status).toBe(403);
  });
  it("blocks legacy bypass after explicit Servio selection", async () => {
    org.booking_engine_config.provider = "servio";
    expect((await engineSalesGuard("test-hotel"))?.status).toBe(503);
  });
  it("guards inactive organizations even if published", async () => {
    org.is_active = false;
    expect((await engineSalesGuard("test-hotel"))?.status).toBe(404);
  });
  it("can lock the organization while finalizing an order", async () => {
    org.booking_engine_config.published = true;
    expect(await engineSalesGuard("test-hotel", true, { query: fixture.query }, true)).toBeNull();
    expect(fixture.query.mock.calls[0][0]).toContain("FOR SHARE");
  });
});

describe("quote correctness", () => {
  const base = { id: 10, base_price: "1200", capacity: 2, status: "active", is_hidden: false, rate_id: null };
  const quote = (row: any, guests = 2) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: row ? [row] : [] }) };
    return engineQuote(10, "2030-05-10", "2030-05-12", guests, client);
  };
  it("calculates the real base price without synthetic packages", async () => {
    expect(await quote(base)).toEqual({ nightlyRate: 1200, totalPrice: 2400, nights: 2 });
  });
  it("uses per-unit online rate before generic rate", async () => {
    expect((await quote({ ...base, rate_id: 1, actual_rate_id: 1, price_per_night: "1500", unit_prices: { "10": 1350 } }))?.totalPrice).toBe(2700);
  });
  it.each([
    { status: "inactive" }, { is_hidden: true }, { capacity: 1 }, { base_price: null },
    { base_price: "NaN" }, { base_price: "-1" },
    { rate_id: 1, actual_rate_id: null },
    { rate_id: 1, actual_rate_id: 1, is_stop_sale: true },
    { rate_id: 1, actual_rate_id: 1, min_nights: 3 },
    { rate_id: 1, actual_rate_id: 1, date_from: "2030-05-11" },
    { rate_id: 1, actual_rate_id: 1, date_to: "2030-05-11" },
  ])("does not sell invalid or forbidden inventory %j", async overrides => {
    expect(await quote({ ...base, ...overrides })).toBeNull();
  });
  it("permits an explicitly configured free tariff", async () => {
    expect((await quote({ ...base, base_price: "0" }))?.totalPrice).toBe(0);
  });
  it("rejects impossible dates, reversed ranges and overly long stays", () => {
    expect(validBookingDates("2030-02-30", "2030-03-02")).toBe(false);
    expect(validBookingDates("2030-05-12", "2030-05-10")).toBe(false);
    expect(validBookingDates("2030-01-01", "2032-01-01")).toBe(false);
    expect(validBookingDates("2030-05-10", "2030-05-12")).toBe(true);
  });
  it("requires contact, legal policy and inventory independently", () => {
    const config = { ...ready(), phone: "", email: "", terms: "", privacy: "" };
    expect(engineIssues(config, 0, 0)).toHaveLength(5);
  });
});
