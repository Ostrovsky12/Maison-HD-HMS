/**
 * Shared mock for @workspace/db — all test files that get this module
 * (via resolve.alias in vitest.config.ts) share the same vi.fn() instances.
 */
import { vi } from "vitest";

const tableStub: any = {};

export const db = {
  select: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
};

export const pool = {
  connect: vi.fn(),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  end: vi.fn(),
  $client: { query: vi.fn().mockResolvedValue({ rows: [] }) },
};

// Table stubs (only need to be non-null objects)
export const propertiesTable = tableStub;
export const unitsTable = tableStub;
export const bookingsTable = tableStub;
export const guestsTable = tableStub;
export const legalEntitiesTable = tableStub;
export const invoicesTable = tableStub;
export const usersTable = tableStub;
export const channelConfigsTable = tableStub;
// Catch-all for any other named import from this module
export default {};
