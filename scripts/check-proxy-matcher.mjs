#!/usr/bin/env node
/**
 * CI guard: every route in `app/` must be reachable by the proxy matcher.
 *
 * Why this exists: from Phase 3 the entitlement gate is enforced at a SINGLE
 * point — `proxy.ts`. That makes the matcher part of the security boundary. A
 * route the matcher does not match never reaches the gate, so it would be
 * reachable regardless of the tenant's entitlements, silently and with no test
 * failing anywhere else.
 *
 * This is not a re-implementation of Next's matching. It reads the REAL compiled
 * regexes that `next build` emits into
 * `.next/server/functions-config-manifest.json` under `functions["/_middleware"]
 * .matchers[].regexp`, and tests every route file's request pathname against
 * them. If Next changes how it compiles matchers, this check follows.
 *
 * It caught a real gap: the catch-all `/((?!…).*)` compiles with a REQUIRED
 * trailing group, so the app root (`/hudd-dashboard`) matched nothing, and
 * `trailingSlash: false` redirects `/hudd-dashboard/` back to it — the root was
 * unreachable through the proxy in either spelling.
 *
 * Requires a prior `next build` (golden leg 1 provides it).
 *
 * Run: node scripts/check-proxy-matcher.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MANIFEST = join(ROOT, ".next", "server", "functions-config-manifest.json");

if (!existsSync(MANIFEST)) {
  console.error(
    `check-proxy-matcher: ${relative(ROOT, MANIFEST)} not found — run \`next build\` first ` +
      `(the golden runs it as leg 1).`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const entry = manifest.functions?.["/_middleware"];
if (!entry) {
  console.error(
    "check-proxy-matcher: no `/_middleware` entry in the build manifest — proxy.ts did not compile " +
      "into the build. The entitlement gate would not run at all.",
  );
  process.exit(1);
}

const matchers = entry.matchers ?? [];
if (matchers.length === 0) {
  console.error("check-proxy-matcher: proxy.ts compiled with NO matchers.");
  process.exit(1);
}

const regexes = matchers.map((m) => ({ re: new RegExp(m.regexp), source: m.originalSource }));

/** Every `page.tsx` / `route.ts` under `app/`, as the pathname a browser requests. */
function routePathnames() {
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(page|route)\.tsx?$/.test(e)) files.push(relative(join(ROOT, "app"), full));
    }
  })(join(ROOT, "app"));

  return files.map((file) => {
    const segments = file
      .replace(/\/?(page|route)\.tsx?$/, "")
      .split("/")
      .filter(Boolean)
      // Route groups `(marketing)` are organisational only — not in the URL.
      .filter((s) => !/^\(.*\)$/.test(s))
      // A catch-all stands in for at least one real segment; a dynamic segment
      // for exactly one. Concrete stand-ins keep this a pathname test.
      .map((s) => {
        if (/^\[\.\.\..+\]$/.test(s)) return "seg-a/seg-b";
        if (/^\[.+\]$/.test(s)) return "seg";
        return s;
      });
    return { file, pathname: "/" + segments.join("/") };
  });
}

const BASE_PATH = "/hudd-dashboard"; // mirrors lib/next-base-path.ts

const routes = routePathnames();
const unmatched = [];
for (const { file, pathname } of routes) {
  // The compiled regexes include basePath, and Next normalises the app root to
  // the bare basePath (no trailing slash) because `trailingSlash: false`.
  const requested = pathname === "/" ? BASE_PATH : `${BASE_PATH}${pathname}`;
  if (!regexes.some(({ re }) => re.test(requested))) unmatched.push({ file, requested });
}

if (unmatched.length > 0) {
  console.error("check-proxy-matcher: routes NOT covered by the proxy matcher:\n");
  for (const u of unmatched) console.error(`  ${u.requested}   (app/${u.file})`);
  console.error(
    `\n${unmatched.length} route(s) bypass proxy.ts entirely. The Phase 3 entitlement gate and the ` +
      `Phase 2 tenant-session binding both live there, so these routes are ungated.\n` +
      `Fix the \`matcher\` in proxy.ts (add an explicit entry) — do not weaken this check.`,
  );
  process.exit(1);
}

console.log(
  `check-proxy-matcher: ok (${routes.length} routes, all matched by ${regexes.length} compiled matcher(s))`,
);
