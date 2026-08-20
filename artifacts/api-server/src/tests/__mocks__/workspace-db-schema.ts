/**
 * Shared mock for @workspace/db/schema.
 * Returns stub objects for every named import.
 */
const stub: any = {};
export default stub;

// Export every name that routes import from @workspace/db/schema
export const bookingsTable = stub;
export const guestsTable = stub;
export const unitsTable = stub;
export const propertiesTable = stub;
export const organizationsTable = stub;
export const bookingAddonsTable = stub;
export const addonsTable = stub;
export const paymentsTable = stub;
export const notificationsTable = stub;
export const ratesTable = stub;
export const housekeepingTasksTable = stub;
export const guestServiceOrdersTable = stub;
export const invoicesTable = stub;
export const legalEntitiesTable = stub;
export const usersTable = stub;
export const channelConfigsTable = stub;
// Proxy catches any other table that a transitively-loaded route might need
export const _proxy = new Proxy(stub, { get: () => stub });
