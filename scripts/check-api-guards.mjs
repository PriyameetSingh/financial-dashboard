/**
 * CI guard: every route handler under app/api/v1/** that exports an HTTP
 * method (GET/POST/PUT/PATCH/DELETE) must call an authorization helper.
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

const files = listRouteFiles(join(ROOT, "app", "api", "v1")).sort();
const offenders = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const exported = new Set();
  for (const line of src.split("\n")) {
    const m = line.match(HANDLER_RE);
    if (m) exported.add(m[1]);
  }
  if (exported.size === 0) continue; // no HTTP handlers exported
  if (!GUARD_RE.test(src)) {
    offenders.push({ file: file.replace(ROOT, ""), methods: [...exported] });
  }
}

if (offenders.length > 0) {
  console.error(
    "check-api-guards: unguarded route handlers under app/api/v1/**",
  "— each must call an authorization helper from lib/server-rbac",
    "or lib/server-auth before doing work:\n",
  );
  for (const o of offenders) {
    console.error(`  ${o.file}  exports: ${o.methods.join(", ")}`);
  }
  console.error(
    `\n${offenders.length} file(s) failed. If a route is intentionally public,`,
    "it must not live under /api/v1 — move it under /api (e.g. /api/health).",
  );
  process.exit(1);
}

console.log(`check-api-guards: ok (${files.length} route files checked)`);
