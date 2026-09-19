import { defineConfig } from "vitest/config";
import path from "path";

const mocksDir = path.resolve(__dirname, "src/tests/__mocks__");

export default defineConfig({
  resolve: {
    alias: {
      // Workspace packages — redirect to shared mock files so all route files
      // and this test file get the same vi.fn() instances.
      "@workspace/db/schema": path.join(mocksDir, "workspace-db-schema.ts"),
      "@workspace/db": path.join(mocksDir, "workspace-db.ts"),
      // drizzle-orm — main package and sub-paths
      "drizzle-orm/pg-core": path.join(mocksDir, "drizzle-orm-pg-core.ts"),
      "drizzle-orm": path.join(mocksDir, "drizzle-orm.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
