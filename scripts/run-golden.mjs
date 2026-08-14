#!/usr/bin/env node
/**
 * Odisha golden regression harness.
 *
 * Runs the legs that define the bit-for-bit baseline for the signed-off
 * Odisha build. An unconfigured app (defaults = today's Odisha values) must
 * keep this green. Run before any extraction change so extraction is never the
 * first untested change to a signed-off build:
 *
 *   1. next build            — static analysis / route compilation
 *   2. vitest run            — DB-backed core-surface + data-scope assertions
 *   3. verify-behaviors      — pure-logic derivation checks
 *   4. check-api-guards      — every /api/v1 route handler is guarded
 *   5. check-proxy-matcher  — every route reaches proxy.ts, where the tenant-session
 *                             binding (Phase 2) and entitlement gate (Phase 3) live
 *   6. check-route-module-map — every route maps to a module or an always-on
 *                             core module; no unmapped route, no stale rule (Phase 3)
 *   7. check-tenant-chokepoint — no unscoped-client / raw-SQL escapes (Phase 2)
 *   8. check-tenant-integrity  — no NULL or cross-tenant rows in the DB (Phase 2)
 *   9. check-http-smoke     — boots the app and drives it over a real socket:
 *                             the proxy runs, the request-scoped tenant reaches
 *                             the chokepoint, the entitlement gate denies, and
 *                             concurrent cross-tenant traffic does not bleed.
 *                             The only leg that sees the middleware/priming
 *                             layer, where two shipped defects have now lived.
 *
 * Requires a reachable Postgres at DATABASE_URL/DIRECT_URL (see .env.test.local
 * for the vitest leg; .env.local for the build leg) with migrations applied.
 *
 * Run: node scripts/run-golden.mjs   (or: npm run golden)
 */
import { spawnSync } from "node:child_process";

const legs = [
  { name: "next build", cmd: "npm", args: ["run", "build"] },
  { name: "vitest run", cmd: "npx", args: ["vitest", "run"] },
  { name: "verify-behaviors", cmd: "node", args: ["scripts/verify-behaviors.mjs"] },
  { name: "check-api-guards", cmd: "node", args: ["scripts/check-api-guards.mjs"] },
  { name: "check-proxy-matcher", cmd: "node", args: ["scripts/check-proxy-matcher.mjs"] },
  { name: "check-route-module-map", cmd: "npx", args: ["tsx", "scripts/check-route-module-map.ts"] },
  { name: "check-tenant-chokepoint", cmd: "node", args: ["scripts/check-tenant-chokepoint.mjs"] },
  {
    name: "check-tenant-integrity",
    cmd: "node",
    args: ["--env-file=.env.test.local", "scripts/check-tenant-integrity.mjs"],
  },
  // Last: boots the app and drives it over a real socket. Slowest leg, and the
  // only one that can see the middleware/priming layer between socket and query.
  { name: "check-http-smoke", cmd: "node", args: ["scripts/check-http-smoke.mjs"] },
];

let failed = null;
for (const leg of legs) {
  process.stdout.write(`\n▶ ${leg.name}\n`);
  const res = spawnSync(leg.cmd, leg.args, { stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) {
    failed = leg;
    break;
  }
}

if (failed) {
  console.error(`\n✗ GOLDEN FAILED at leg: ${failed.name}`);
  process.exit(1);
}
console.log(
  `\n✓ GOLDEN GREEN — all ${legs.length} legs passed (${legs.map((l) => l.name).join(", ")})`,
);
