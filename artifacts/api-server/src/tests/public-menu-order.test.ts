import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../lib/notify.js", () => ({
  sendGuestConfirmationEmail: vi.fn(),
  sendGuestConfirmationSms: vi.fn(),
  notifyBookingCreated: vi.fn(),
}));
vi.mock("../lib/automation-runner.js", () => ({ fireBookingEvent: vi.fn() }));

import { pool } from "@workspace/db";
import publicRouter from "../routes/public-booking.js";

const app = express();
app.use(express.json());
app.use("/api/public", publicRouter);

function transaction(options: {
  item?: any;
  modifiers?: any[];
  table?: any;
}) {
  const calls: Array<[string, any[] | undefined]> = [];
  const client = {
    query: vi.fn(async (statement: string, params?: any[]) => {
      calls.push([statement, params]);
      if (statement === "BEGIN" || statement === "COMMIT" || statement === "ROLLBACK") return { rows: [] };
      if (statement.includes("FROM organizations")) return { rows: [{ id: 1, name: "A", slug: "a" }] };
      if (statement.includes("FROM fb_tables")) return { rows: options.table ? [options.table] : [] };
      if (statement.includes("FROM fb_items")) return { rows: options.item ? [options.item] : [] };
      if (statement.includes("FROM fb_modifier_options")) {
        return {
          rows: (options.modifiers || [])
            .filter(row => row.option_id != null)
            .map(row => ({
              group_id: row.group_id,
              option_id: row.option_id,
              option_name: row.option_name,
              price_delta: row.price_delta,
            })),
        };
      }
      if (statement.includes("FROM fb_modifier_groups")) {
        const groups = new Map<number, any>();
        for (const row of options.modifiers || []) {
          if (!groups.has(row.group_id)) {
            groups.set(row.group_id, {
              group_id: row.group_id,
              group_name: row.group_name,
              is_required: row.is_required,
              min_select: row.min_select,
              max_select: row.max_select,
            });
          }
        }
        return { rows: [...groups.values()] };
      }
      if (statement.includes("INSERT INTO fb_orders")) return { rows: [{ id: 91 }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return { client, calls };
}

const basicItem = { id: 10, name: "Authoritative dish", price: "100.00" };
const basePayload = { orgSlug: "a", items: [{ id: 10, name: "forged", price: 0.01, quantity: 2 }] };

beforeEach(() => {
  vi.mocked(pool.connect).mockReset();
});

describe("POST /api/public/menu-order", () => {
  it("uses the server price and name, never client values", async () => {
    const tx = transaction({ item: basicItem });
    vi.mocked(pool.connect).mockResolvedValue(tx.client as any);
    const response = await request(app).post("/api/public/menu-order").send(basePayload);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ subtotal: 200, tip: 0, total: 200 });
    const itemInsert = tx.calls.find(([sql]) => sql.includes("INSERT INTO fb_order_items"))!;
    expect(itemInsert[1]).toContain("Authoritative dish");
    expect(itemInsert[1]).toContain("100.00");
  });

  it("rejects unavailable or foreign item IDs without inserting an order", async () => {
    const tx = transaction({});
    vi.mocked(pool.connect).mockResolvedValue(tx.client as any);
    const response = await request(app).post("/api/public/menu-order").send(basePayload);
    expect(response.status).toBe(400);
    expect(tx.calls.some(([sql]) => sql.includes("INSERT INTO fb_orders"))).toBe(false);
    expect(tx.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
  });

  it("rejects forged modifier deltas and options outside the item's groups", async () => {
    const tx = transaction({ item: basicItem, modifiers: [] });
    vi.mocked(pool.connect).mockResolvedValue(tx.client as any);
    const response = await request(app).post("/api/public/menu-order").send({
      ...basePayload, items: [{ id: 10, quantity: 1, modifiers: [{ groupId: 77, optionId: 88, priceDelta: -1000 }] }],
    });
    expect(response.status).toBe(400);
    expect(tx.calls.some(([sql]) => sql.includes("INSERT INTO fb_orders"))).toBe(false);
  });

  it("enforces required modifier selections", async () => {
    const tx = transaction({ item: basicItem, modifiers: [{
      group_id: 1, group_name: "Sauce", is_required: true, min_select: 1, max_select: 1, option_id: 2, option_name: "Hot", price_delta: "10.00",
    }] });
    vi.mocked(pool.connect).mockResolvedValue(tx.client as any);
    const response = await request(app).post("/api/public/menu-order").send(basePayload);
    expect(response.status).toBe(400);
    expect(tx.calls.some(([sql]) => sql.includes("INSERT INTO fb_orders"))).toBe(false);
  });

  it("calculates modifier and bounded tip totals and persists authoritative modifiers", async () => {
    const tx = transaction({ item: basicItem, table: { id: 7, number: "7" }, modifiers: [{
      group_id: 1, group_name: "Sauce", is_required: true, min_select: 1, max_select: 1, option_id: 2, option_name: "Hot", price_delta: "10.00",
    }] });
    vi.mocked(pool.connect).mockResolvedValue(tx.client as any);
    const response = await request(app).post("/api/public/menu-order").send({
      orgSlug: "a", tableId: 7, tipPct: 10,
      items: [{ id: 10, quantity: 2, modifiers: [{ groupId: 1, optionId: 2, priceDelta: -999, optionName: "forged" }] }],
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ subtotal: 220, tip: 22, total: 242 });
    const orderInsert = tx.calls.find(([sql]) => sql.includes("INSERT INTO fb_orders"))!;
    expect(orderInsert[1]).toContain("22.00");
    const itemInsert = tx.calls.find(([sql]) => sql.includes("INSERT INTO fb_order_items"))!;
    expect(itemInsert[1]).toContain("110.00");
    expect(String(itemInsert[1]?.at(-1))).toContain('"priceDelta":"10.00"');
  });
});