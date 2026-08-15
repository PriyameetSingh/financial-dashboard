/**
 * CI guard: every API route handler is either guarded by an authorization
 * helper, or named on the unauthenticated-by-design list below with the control
 * that stands in for a session.
 *
 * This catches the failure mode that produced the uploads authorization bug:
 * a route handler exported without a guard, and the middleware bypass meant
 * no second layer existed. The middleware narrowing (proxy.ts) is runtime
 * defence-in-depth; this check fails the build at CI before an unguarded
 * route can ship.
 *
 * Run: node scripts/check-api-guards.mjs
 *
 * A file "has a guard" if it references any of the established RBAC helpers
 * from lib/server-rbac or lib/server-auth. This is a presence check, not a
 * correctness check — it cannot tell whether the guard is applied to the
 * right method or branch, only that the file is not wholly unguarded. The
 * per-route reviewer remains responsible for correctness.
 *
 * TWO SURFACES, not one. `/api/v1/**` is the authenticated API and every file
 * there needs a guard. Everything else under `/api` is open by construction —
 * the proxy does not require a session outside v1 — so it used to be checked by
 * nobody at all. Phase 4 added endpoints there that perform real writes
 * (onboarding provisions a tenant), which makes "outside v1" the easy place to
 * put something reachable by anyone. So this check now walks the whole of
 * `/api` and requires every unguarded file to appear on
 * `UNAUTHENTICATED_BY_DESIGN`, with a note saying what protects it instead.
 * Adding an open endpoint is then a decision someone records, not a diff
 * someone skims.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
// Matches `export async function GET`, `export function POST`,
// `export const GET =`, `export { GET }`.
const HANDLER_RE = new RegExp(
  String.raw`export\s+(?:async\s+)?(?:function\s+|const\s+)?(${HTTP_METHODS.join("|")})\b`,
);
// References to the established authorization helpers. Importing or calling
// any of these counts as "guarded".
const GUARD_RE =
  /\b(?:requirePermission|requireAnyPermission|requirePermissionAndDbUser|requireAnyPermissionAndDbUser|getDbUserBySession|getSessionUser|hasPermission|hasPermissionForUser)\b/;

function listRouteFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

/**
 * Routes outside `/api/v1` that legitimately have no session check, each with
 * the control that replaces one. Paths are relative to the repo root.
 *
 * Anything reaching this list should be arguable in one sentence. If it takes
 * a paragraph, the endpoint probably belongs under `/api/v1`.
 */
const UNAUTHENTICATED_BY_DESIGN = new Map([
  ["app/api/health/route.ts", "liveness probe; returns no tenant data"],
  ["app/api/auth/[...nextauth]/route.ts", "NextAuth's own callback surface; it IS the sign-in path"],
  [
    "app/api/auth/keycloak/logout/route.ts",
    "the sign-OUT redirect; reads the token only for id_token_hint, writes nothing, returns no data. Requiring a session to log out would strand anyone whose session is already broken",
  ],
  [
    "app/api/dev/session/route.ts",
    "dev-only session minting; dead-code-eliminated from production builds (NODE_ENV is inlined)",
  ],
  [
    "app/api/onboarding/check/route.ts",
    "pre-account: validates an onboarding token. Rate limited; one message for every rejection; consumes nothing",
  ],
  [
    "app/api/onboarding/provision/route.ts",
    "pre-account: creates the tenant. Gated by a single-use hashed onboarding token that also fixes the tier; rate limited",
  ],
]);

const files = listRouteFiles(join(ROOT, "app", "api")).sort();
const offenders = [];
const staleAllowances = new Set(UNAUTHENTICATED_BY_DESIGN.keys());

for (const file of files) {
  const relative = file.replace(ROOT, "");
  staleAllowances.delete(relative);

  const src = readFileSync(file, "utf8");
  const exported = new Set();
  for (const line of src.split("\n")) {
    const m = line.match(HANDLER_RE);
    if (m) exported.add(m[1]);
  }
  if (exported.size === 0) continue; // no HTTP handlers exported
  if (GUARD_RE.test(src)) continue;
  if (UNAUTHENTICATED_BY_DESIGN.has(relative)) continue;

  offenders.push({ file: relative, methods: [...exported] });
}

// A stale allowance is a route that was deleted or renamed. Harmless today, but
// it silently pre-authorises whatever later occupies that path — the same
// failure the route-module map's stale-rule check exists to prevent.
if (staleAllowances.size > 0) {
  console.error("check-api-guards: allowances naming routes that no longer exist:\n");
  for (const path of staleAllowances) console.error(`  ${path}`);
  process.exit(1);
}

if (offenders.length > 0) {
  console.error(
    "check-api-guards: unguarded route handlers under app/api/**",
    "— each must call an authorization helper from lib/server-rbac or",
    "lib/server-auth before doing work:\n",
  );
  for (const o of offenders) {
    console.error(`  ${o.file}  exports: ${o.methods.join(", ")}`);
  }
  console.error(
    `\n${offenders.length} file(s) failed. A route under /api/v1 must be guarded.`,
    "A route that is intentionally reachable without a session must live outside",
    "/api/v1 AND be added to UNAUTHENTICATED_BY_DESIGN in this script, with the",
    "control that stands in for a session.",
  );
  process.exit(1);
}

console.log(
  `check-api-guards: ok (${files.length} route files checked; ` +
    `${UNAUTHENTICATED_BY_DESIGN.size} unauthenticated by design, each with a stated control)`,
);
