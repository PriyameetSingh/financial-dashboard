import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Native tsconfig paths resolution (replaces the vite-tsconfig-paths plugin).
    tsconfigPaths: true,
  },
  test: {
    // Tests run against the test database (NODE_ENV=test, .env.test.local).
    env: {
      NODE_ENV: "test",
    },
    setupFiles: ["./tests/helpers/load-env.ts"],
    include: ["tests/**/*.test.ts"],
    // DB-backed suites share a single seeded schema (TESTSCOPE_ prefix) and each
    // file cleans up its own rows in afterAll. Run files serially so concurrent
    // cleanup/seed across workers cannot collide on the shared FK graph.
    fileParallelism: false,
  },
});
