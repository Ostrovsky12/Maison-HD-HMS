import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const fixture = vi.hoisted(() => ({ execute: vi.fn(), fetch: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: { execute: fixture.execute } }));
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...params: any[]) => ({ sql: strings.join("?"), params }),
}));
vi.mock("../lib/auth.js", () => ({
  requireAuth(req: any, _res: any, next: any) {
    req.user = { organizationId: req.headers["x-no-org"] ? null : 39, role: req.headers["x-role"] || "owner" };
    next();
  },
}));
import router from "../routes/fb-import-poster.js";

let server: Server;
let base: string;
const http = globalThis.fetch;
let queries: { sql: string; params: any[] }[];
let providerFails: boolean;
let price: any;
let connected: boolean;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/import", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as any).port}/import`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); queries = []; providerFails = false; connected = true; price = { "1": "49500" };
  fixture.execute.mockImplementation(async (q: any) => {
    const query = q; queries.push(query);
    if (query.sql.includes("posterConfig")) return { rows: [{ config: connected ? { apiKey: "fixture-only-token", accountId: "Display label, not a domain" } : {} }] };
    if (query.sql.includes("SELECT id FROM fb_categories")) return { rows: [{ id: 70 }] };
    if (query.sql.includes("SELECT id FROM fb_items")) return { rows: [{ id: 80 }] };
    return { rows: [] };
  });
  fixture.fetch.mockImplementation(async (url: URL) => {
    if (providerFails) return new Response(JSON.stringify({ error: 10 }), { status: 403 });
    let response: any[] = [];
    if (url.pathname.endsWith("menu.getCategories")) response = [{ category_id: "1", category_name: "Soups" }];
    if (url.pathname.endsWith("menu.getProducts")) response = [{ product_id: "2", product_name: "Current soup", category_id: "1", price }];
    return new Response(JSON.stringify({ response }));
  });
  vi.stubGlobal("fetch", fixture.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function call(path: string, body: any = {}, headers: Record<string, string> = {}) {
  const response = await http(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
describe("Saved Poster connection for menu refresh", () => {
  it("previews with the tenant's saved connection without returning its token or writing anything", async () => {
    const result = await call("/preview");
    expect(result.status).toBe(200);
    expect(result.body.items[0].price).toBe(495);
    expect(JSON.stringify(result.body)).not.toContain("fixture-only-token");
    expect(queries.every(q => q.sql.trim().startsWith("SELECT"))).toBe(true);
    for (const [url] of fixture.fetch.mock.calls) {
      expect(url.hostname).toBe("joinposter.com");
      expect(url.searchParams.get("token")).toBe("fixture-only-token");
    }
  });
  it("refreshes an existing price only after an explicit execute with overwrite", async () => {
    const result = await call("/execute", { options: { overwrite_existing: true, import_photos: false } });
    expect(result.status).toBe(200);
    expect(result.body.stats.items_updated).toBe(1);
    const update = queries.find(q => q.sql.includes("UPDATE fb_items"));
    expect(update?.params).toContain(495);
    expect(update?.params).toContain(39);
    expect(queries.some(q => q.sql.includes("INSERT INTO fb_items"))).toBe(false);
    expect(queries.some(q => /fb_ingredients|fb_recipe|stock/i.test(q.sql))).toBe(false);
  });
  it("does not overwrite existing prices when overwrite is off", async () => {
    const result = await call("/execute", { options: { overwrite_existing: false } });
    expect(result.status).toBe(200);
    expect(result.body.stats.items_skipped).toBe(1);
    expect(queries.some(q => q.sql.includes("UPDATE fb_items"))).toBe(false);
  });
  it("fails rather than reporting an empty successful import when Poster rejects access", async () => {
    providerFails = true;
    expect((await call("/preview")).status).toBe(400);
    expect((await call("/execute")).status).toBe(500);
    expect(queries.every(q => q.sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it("never guesses between different location prices or starts writes", async () => {
    price = { "1": "49500", "2": "59500" };
    expect((await call("/execute", { options: { overwrite_existing: true } })).status).toBe(500);
    expect(queries.every(q => q.sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it("does not use a body orgId to switch an authenticated tenant", async () => {
    await call("/preview", { orgId: 999 });
    const configRead = queries.find(q => q.sql.includes("posterConfig"));
    expect(configRead?.params).toContain(39);
    expect(configRead?.params).not.toContain(999);
  });
  it("does not allow an organizationless ordinary user to select a tenant", async () => {
    expect((await call("/preview", { orgId: 39 }, { "x-no-org": "1" })).status).toBe(400);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("explains a missing saved connection without requesting credentials in the response", async () => {
    connected = false;
    const result = await call("/preview");
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("немає збереженого підключення");
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("does not let a waiter use the saved connection to overwrite the menu", async () => {
    expect((await call("/execute", {}, { "x-role": "waiter" })).status).toBe(403);
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
});
