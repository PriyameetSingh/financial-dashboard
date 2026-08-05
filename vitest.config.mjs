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
  },
});
