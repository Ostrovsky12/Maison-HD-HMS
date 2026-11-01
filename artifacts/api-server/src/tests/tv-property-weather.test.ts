import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { effectiveWeather, parseWeatherConfig, weatherMode } from "../services/tv-weather-config.js";

vi.mock("../lib/auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers["x-test-org"]) return res.sendStatus(401);
    req.user = { organizationId: Number(req.headers["x-test-org"]) || null };
    next();
  },
}));
vi.mock("../services/tv-weather.js", () => ({ getTvWeather: vi.fn().mockResolvedValue({ status: "unavailable" }) }));
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), execute: vi.fn() },
  propertiesTable: { id: "property.id", organizationId: "property.org", tvWeather: "property.weather" },
  unitsTable: { id: "unit.id", propertyId: "unit.property" },
  tvScreensTable: { id: "screen.id", organizationId: "screen.org" },
  bookingsTable: {}, spaServicesTable: {}, fbItemsTable: {}, eventsTable: {},
}));

import { db } from "@workspace/db";
import { getTvWeather } from "../services/tv-weather.js";
import router from "../routes/tv.js";

const app = express();
app.use(express.json());
app.use("/tv", router);
const hotel = { location: "Львів", latitude: 49.84, longitude: 24.03 };
const override = { location: "Київ" };

function chain(rows: any[]) {
  const query: any = { then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
  for (const name of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "set", "returning"]) {
    query[name] = vi.fn().mockReturnValue(query);
  }
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.execute).mockResolvedValue({ rows: [] } as any);
});

describe("TV weather inheritance", () => {
  it("new and empty legacy screens inherit the property location", () => {
    for (const config of [null, {}, { weather: {} }, { weather: { location: "", latitude: "" as any, longitude: "" as any } }]) {
      expect(weatherMode(config)).toBe("inherit");
      expect(effectiveWeather(config, hotel)).toEqual(hotel);
    }
  });
  it("preserves configured legacy locations and explicit overrides", () => {
    expect(effectiveWeather({ weather: override }, hotel)).toEqual(override);
    expect(effectiveWeather({ weatherMode: "override", weather: override }, hotel)).toEqual(override);
    expect(effectiveWeather({ weather: { latitude: 0, longitude: 0 } }, hotel)).toEqual({ latitude: 0, longitude: 0 });
  });
  it("can return to inheritance even when old screen coordinates remain", () => {
    expect(effectiveWeather({ weatherMode: "inherit", weather: override }, hotel)).toEqual(hotel);
    expect(effectiveWeather({ weatherMode: "override", weather: {} }, hotel)).toEqual({});
    expect(effectiveWeather({}, null)).toEqual({});
  });
  it("normalizes form coordinates, permits clearing, rejects malformed and partial coordinates", () => {
    expect(parseWeatherConfig({ location: " Львів ", latitude: "0", longitude: "0" })).toEqual({ location: "Львів", latitude: 0, longitude: 0 });
    expect(parseWeatherConfig({ location: "", latitude: "", longitude: "" })).toEqual({ location: "" });
    for (const config of [null, [], { latitude: 1 }, { longitude: 1 }, { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: -181 }, { latitude: true, longitude: 0 }, { location: 9 },
      { latitude: " ", longitude: "0" }, { latitude: "NaN", longitude: 0 }]) {
      expect(() => parseWeatherConfig(config)).toThrow();
    }
  });
});

describe("property weather API", () => {
  it("requires authentication and an organization", async () => {
    expect((await request(app).get("/tv/properties/weather")).status).toBe(401);
    expect((await request(app).get("/tv/properties/weather").set("x-test-org", "0")).status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });
  it("lists only properties of the authenticated organization", async () => {
    const query = chain([{ id: 4, name: "Готель", weather: hotel }]);
    vi.mocked(db.select).mockReturnValue(query);
    const response = await request(app).get("/tv/properties/weather").set("x-test-org", "7");
    expect(response.body.properties[0].weather).toEqual(hotel);
    expect(query.where).toHaveBeenCalledWith({ op: "eq", args: ["property.org", 7] });
  });
  it("scopes saving and clearing by both property id and organization", async () => {
    const query = chain([{ id: 4, name: "Готель", weather: {} }]);
    vi.mocked(db.update).mockReturnValue(query);
    const response = await request(app).patch("/tv/properties/4/weather").set("x-test-org", "7").send({});
    expect(response.status).toBe(200);
    expect(query.where).toHaveBeenCalledWith({ op: "and", args: [
      { op: "eq", args: ["property.id", 4] }, { op: "eq", args: ["property.org", 7] },
    ] });
    expect(query.set.mock.calls[0][0].tvWeather).toEqual({ location: "" });
  });
  it("returns 404 for foreign or missing properties", async () => {
    vi.mocked(db.update).mockReturnValue(chain([]));
    const response = await request(app).patch("/tv/properties/999/weather").set("x-test-org", "7").send(hotel);
    expect(response.status).toBe(404);
  });
  it("rejects invalid input before a database write", async () => {
    for (const body of [{ latitude: 49 }, { latitude: 100, longitude: 0 }, { location: 7 }]) {
      expect((await request(app).patch("/tv/properties/4/weather").set("x-test-org", "7").send(body)).status).toBe(400);
    }
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("public TV weather resolution", () => {
  it.each([
    { config: {}, property: hotel, expected: hotel },
    { config: { weather: override }, property: hotel, expected: override },
    { config: { weatherMode: "inherit", weather: override }, property: hotel, expected: hotel },
    { config: {}, property: null, expected: {} },
  ])("resolves live defaults without copying them into the screen: $config", async ({ config, property, expected }) => {
    const propertyQuery = chain(property ? [{ id: 4, name: "Готель", weather: property }] : []);
    vi.mocked(db.select)
      .mockReturnValueOnce(chain([{ id: 1, organizationId: 7, unitId: 10, isActive: true, contentConfig: config }]))
      .mockReturnValueOnce(propertyQuery);
    const response = await request(app).get("/tv/display/test-room");
    expect(response.status).toBe(200);
    expect(getTvWeather).toHaveBeenCalledWith(7, expected);
    expect(propertyQuery.where).toHaveBeenCalledWith({ op: "and", args: [
      { op: "eq", args: ["unit.id", 10] }, { op: "eq", args: ["property.org", 7] },
    ] });
  });
  it("does not guess a property for an unassigned screen", async () => {
    vi.mocked(db.select).mockReturnValueOnce(chain([{ id: 1, organizationId: 7, unitId: null, isActive: true, contentConfig: {} }]));
    expect((await request(app).get("/tv/display/unassigned")).status).toBe(200);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(getTvWeather).toHaveBeenCalledWith(7, {});
  });
});
