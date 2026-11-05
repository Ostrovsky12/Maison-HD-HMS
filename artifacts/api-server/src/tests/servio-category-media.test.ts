import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: f.query, connect: f.connect } }));
import router from "../routes/booking-servio-category-media.js";
import { engineConfig, publicEngineConfig } from "../lib/booking-engine.js";
import { servioFingerprint } from "../lib/servio-connection.js";
import { servioCategoryMediaList, servioCategorySource } from "../lib/servio-category-media.js";
const app = express();
app.use(express.json(), (req: any, _res, next) => {
  req.user = { organizationId: Number(req.get("x-org") || 7), role: req.get("x-role") || "owner" }; next();
});
app.use(router);
let org: any, clientQuery: ReturnType<typeof vi.fn>;
const media = { photos: ["https://example.invalid/house.jpg"], videoUrl: "https://example.invalid/tour.mp4", description: "Actual category description" };
function verified(config: any) {
  config.servioVerification = { fingerprint: servioFingerprint(config), result: {
    status: "connected", code: "ok", message: "Connected", pingOk: true, checkedAt: new Date().toISOString(),
    categories: [{ hotelId: 7, id: 11, name: "House" }, { hotelId: 8, id: 11, name: "Other hotel house" }],
  } };
}
beforeEach(() => {
  vi.clearAllMocks();
  org = { name: "Fixture", booking_engine_config: {
    provider: "servio", servioBaseUrl: "https://example.servio.support/ReservationService_1_10",
    servioHotelId: "7", servioToken: "opaque-credential", unitMedia: { "11": { ...media, description: "Local room" } },
  } };
  verified(org.booking_engine_config);
  f.query.mockImplementation(async (_sql: string, values: any[]) => ({ rows: values[0] === 7 ? [org] : [] }));
  clientQuery = vi.fn(async (sql: string, values: any[] = []) => {
    if (sql.startsWith("SELECT")) return { rows: values[0] === 7 ? [org] : [] };
    if (sql.startsWith("UPDATE")) org.booking_engine_config.servioCategoryMedia = JSON.parse(values[1]);
    return { rows: [] };
  });
  f.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() });
});
const input = () => ({ sourceId: servioCategorySource(engineConfig(org)), hotelId: 7, categoryId: 11, expectedRevision: 0, media });
describe("independent Servio category media", () => {
  it("uses only the verified saved category catalog, never local room media with the same integer ID", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body.categories).toHaveLength(2);
    expect(response.body.categories[0]).toMatchObject({ hotelId: 7, categoryId: 11, revision: 0, media: { photos: [], description: "" } });
    expect(JSON.stringify(response.body)).not.toContain("opaque-credential");
    expect(JSON.stringify(response.body)).not.toContain("Local room");
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("saves, reloads, clears and revisions a category without updating inventory or overwriting other config", async () => {
    const saved = await request(app).put("/").send(input());
    expect(saved.status).toBe(200); expect(saved.body).toMatchObject({ revision: 1, media });
    expect((await request(app).get("/")).body.categories[0].media).toEqual(media);
    const empty = { photos: [], videoUrl: "", description: "" };
    expect((await request(app).put("/").send({ ...input(), expectedRevision: 1, media: empty })).status).toBe(200);
    expect((await request(app).get("/")).body.categories[0]).toMatchObject({ revision: 2, media: empty });
    expect(org.booking_engine_config.unitMedia["11"].description).toBe("Local room");
    expect(org.booking_engine_config.servioToken).toBe("opaque-credential");
    expect(clientQuery.mock.calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql)).every(([sql]) => sql.startsWith("UPDATE organizations"))).toBe(true);
  });
  it("keeps identical category IDs in different Servio hotels separate", async () => {
    await request(app).put("/").send(input());
    const categories = (await request(app).get("/")).body.categories;
    expect(categories[0].media).toEqual(media);
    expect(categories[1].media.description).toBe("");
  });
  it("saves, reloads, edits and clears guest characteristics and tariff copy without editing Servio inventory", async () => {
    const details = { displayName: "Будинок з 1 спальнею", occupancyText: "до 4 гостей", sofaText: "1 диван",
      bedsText: "2 односпальних або 1 двоспальне ліжко", areaText: "42 м²", amenities: ["Сауна", "Кухня"],
      tariffTitle: "Безповоротний тариф", tariffDescription: "100% передоплата. Туристичний збір — за правилами готелю." };
    expect((await request(app).put("/").send({ ...input(), media: { ...media, details } })).status).toBe(200);
    expect((await request(app).get("/")).body.categories[0].media.details).toEqual(details);
    const edited = { ...details, areaText: "43 м²", tariffDescription: "Оновлені умови", amenities: [] };
    expect((await request(app).put("/").send({ ...input(), expectedRevision: 1, media: { ...media, details: edited } })).status).toBe(200);
    expect((await request(app).get("/")).body.categories[0].media.details).toEqual(edited);
    expect((await request(app).put("/").send({ ...input(), expectedRevision: 2, media })).status).toBe(200);
    expect((await request(app).get("/")).body.categories[0].media.details).toBeUndefined();
    expect(clientQuery.mock.calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql)).every(([sql]) => sql.startsWith("UPDATE organizations"))).toBe(true);
  });
  it("rejects stale revisions without silently replacing another editor's work", async () => {
    await request(app).put("/").send(input());
    expect((await request(app).put("/").send({ ...input(), media: { ...media, description: "Stale" } })).status).toBe(409);
    expect((await request(app).get("/")).body.categories[0].media.description).toBe(media.description);
    expect(clientQuery.mock.calls.filter(([sql]) => sql.startsWith("UPDATE"))).toHaveLength(1);
  });
  it.each(["manager", "staff"])("does not let %s modify category media", async role => {
    expect((await request(app).put("/").set("x-role", role).send(input())).status).toBe(403);
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("scopes every database read and write to the authenticated organization, ignoring body organization IDs", async () => {
    expect((await request(app).get("/").set("x-org", "8")).status).toBe(404);
    expect((await request(app).put("/").set("x-org", "8").send({ ...input(), organizationId: 7 })).status).toBe(404);
    expect(clientQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });
  it.each(["javascript:alert(1)", "http://example.invalid/photo.jpg", "/api/storage/objects/../secret", "data:image/png;base64,bad"])("rejects unsafe media %s", async photo => {
    expect((await request(app).put("/").send({ ...input(), media: { ...media, photos: [photo] } })).status).toBe(400);
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("rejects unknown categories, changed source IDs and unverified token rotations", async () => {
    expect((await request(app).put("/").send({ ...input(), categoryId: 99 })).status).toBe(409);
    expect((await request(app).put("/").send({ ...input(), sourceId: "0".repeat(64) })).status).toBe(409);
    const oldInput = input(); org.booking_engine_config.servioToken = "rotated-credential";
    expect((await request(app).get("/")).body).toMatchObject({ ready: false, sourceId: null, categories: [] });
    expect((await request(app).put("/").send(oldInput)).status).toBe(409);
  });
  it("retains media through credential rotation after re-verification but isolates another hotel/source", async () => {
    await request(app).put("/").send(input());
    const original = servioCategorySource(engineConfig(org));
    org.booking_engine_config.servioToken = "rotated-credential"; verified(org.booking_engine_config);
    expect(servioCategorySource(engineConfig(org))).toBe(original);
    expect(servioCategoryMediaList(engineConfig(org)).categories[0].media).toEqual(media);
    org.booking_engine_config.servioHotelId = "8"; verified(org.booking_engine_config);
    expect(servioCategorySource(engineConfig(org))).not.toBe(original);
    expect(servioCategoryMediaList(engineConfig(org)).categories[0].media.description).toBe("");
    expect(publicEngineConfig(engineConfig(org))).not.toHaveProperty("servioCategoryMedia");
  });
});
