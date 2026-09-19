/**
 * Shared mock for drizzle-orm operators used by the routes.
 * Each operator just wraps its arguments in a plain object so the
 * mocked query builder chain can accept them without errors.
 */
import { vi } from "vitest";

const op =
  (name: string) =>
  (...args: any[]) => ({ op: name, args });

export const eq = vi.fn(op("eq"));
export const and = vi.fn(op("and"));
export const or = vi.fn(op("or"));
export const desc = vi.fn(op("desc"));
export const asc = vi.fn(op("asc"));
export const gte = vi.fn(op("gte"));
export const lte = vi.fn(op("lte"));
export const inArray = vi.fn(op("inArray"));
export const isNull = vi.fn(op("isNull"));
export const ne = vi.fn(op("ne"));
export const notInArray = vi.fn(op("notInArray"));
export const ilike = vi.fn(op("ilike"));
export const like = vi.fn(op("like"));
export const between = vi.fn(op("between"));
export const not = vi.fn(op("not"));
export const exists = vi.fn(op("exists"));
export const count = vi.fn(op("count"));
export const sum = vi.fn(op("sum"));
export const avg = vi.fn(op("avg"));
export const min = vi.fn(op("min"));
export const max = vi.fn(op("max"));
export const sql = Object.assign(
  vi.fn((_strings: TemplateStringsArray, ..._values: any[]) => ({ op: "sql" })),
  { raw: vi.fn(() => ({ op: "sql.raw" })) },
);
export const placeholder = vi.fn((n: any) => ({ op: "placeholder", n }));
export const getTableColumns = vi.fn(() => ({}));
export const alias = vi.fn((t: any) => t);
