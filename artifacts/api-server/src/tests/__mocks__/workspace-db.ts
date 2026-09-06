/**
 * Shared mock for @workspace/db — all test files that get this module
 * (via resolve.alias in vitest.config.ts) share the same vi.fn() instances.
 */
import { vi } from "vitest";

const tableStub: any = {};
const clientQuery = vi.fn().mockResolvedValue({ rows: [] });

export const db = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
  $client: { query: clientQuery },
};

export const pool = {
  connect: vi.fn(),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  end: vi.fn(),
  $client: { query: clientQuery },
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
export const aiKnowledgeArticlesTable = tableStub;
export const aiConciergeSettingsTable = tableStub;
export const aiConciergeAuditLogsTable = tableStub;
export const fbCategoriesTable = tableStub;
export const fbItemsTable = tableStub;
export const fbTablesTable = tableStub;
export const fbOrdersTable = tableStub;
export const fbOrderItemsTable = tableStub;
export const ratesTable = tableStub;
export const channelRateSettingsTable = tableStub;
// Catch-all for any other named import from this module
export default {};
