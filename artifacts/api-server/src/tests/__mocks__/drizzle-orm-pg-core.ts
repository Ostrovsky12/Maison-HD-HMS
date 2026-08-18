/**
 * Stub for drizzle-orm/pg-core — used by local schema files
 * that are transitively imported by route helpers (e.g. notify.ts → platform.ts).
 */
import { vi } from "vitest";

const stub = vi.fn(() => ({}));

export const pgTable = stub;
export const serial = stub;
export const text = stub;
export const boolean = stub;
export const integer = stub;
export const numeric = stub;
export const timestamp = stub;
export const jsonb = stub;
export const unique = stub;
export const index = stub;
export const varchar = stub;
export const date = stub;
export const real = stub;
export const bigint = stub;
export const primaryKey = stub;
export const foreignKey = stub;
export const pgEnum = stub;
export const uuid = stub;
export const doublePrecision = stub;
export const customType = stub;
