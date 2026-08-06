import { config } from "dotenv";
import { vi } from "vitest";

// Load .env.test.local so DATABASE_URL points at the test database before the
// prisma client is constructed. Mirrors `node --env-file=.env.test.local`.
config({ path: ".env.test.local" });

// next-auth imports `next/server` (extensionless) which Node ESM cannot resolve
// under vitest. The data-scoping tests never need a real session —
// resolveDataScopeForUser only reads the session when the user has zero user_roles,
// which is never the case for the seeded users. Stub getSessionUser to null globally.
vi.mock("@/lib/server-auth", () => ({
  getSessionUser: () => Promise.resolve(null),
}));
