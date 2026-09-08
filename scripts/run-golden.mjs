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
 *   4. check-api-guards      — every API route handler is guarded, or named as
 *                             unauthenticated by design with the control that
 *                             replaces a session
 *   5. check-no-hardcoded-color — reskinned screens resolve every colour through
 *                             a Nocturne role token, so per-tenant theming keeps
 *                             working. Scope grows per reskin tranche.
 *   6. check-proxy-matcher  — every route reaches proxy.ts, where the tenant-session
 *                             binding (Phase 2) and entitlement gate (Phase 3) live
 *   7. check-route-module-map — every route maps to a module or an always-on
 *                             core module; no unmapped route, no stale rule (Phase 3)
 *   8. check-capability-deps — every `ModuleDef.dependsOn` id resolves to a real,
 *                             non-roadmap module and the dependency graph has no
 *                             cycles (Phase 4)
 *   9. check-config-ui-coverage — every `lib/tenant-config/registry.ts` key is
 *                             either edited by the tenant-config admin UI or
 *                             named as not-yet-exposed with a reason (Phase 2)
 *  10. check-tenant-chokepoint — no unscoped-client / raw-SQL escapes (Phase 2)
 *  11. check-tenant-integrity  — no NULL or cross-tenant rows in the DB (Phase 2)
 *  12. check-http-smoke     — boots the app and drives it over a real socket:
 *                             the proxy runs, the request-scoped tenant reaches
 *                             the chokepoint, the entitlement gate denies, and
 *                             concurrent cross-tenant traffic does not bleed.
 *                             The only leg that sees the middleware/priming
 *                             layer, where two shipped defects have now lived.
 *  13. check-a11y            — WCAG 2.1 AA over the component gallery in a real
 *                             browser, across both themes and both densities.
 *                             Contrast, focus and target size are properties of
 *                             computed style, so nothing short of a browser can
 *                             assert them (Phase 4 / S0).
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
  { name: "check-no-hardcoded-color", cmd: "node", args: ["scripts/check-no-hardcoded-color.mjs"] },
  { name: "check-proxy-matcher", cmd: "node", args: ["scripts/check-proxy-matcher.mjs"] },
  { name: "check-route-module-map", cmd: "npx", args: ["tsx", "scripts/check-route-module-map.ts"] },
  { name: "check-capability-deps", cmd: "npx", args: ["tsx", "scripts/check-capability-deps.ts"] },
  { name: "check-config-ui-coverage", cmd: "npx", args: ["tsx", "scripts/check-config-ui-coverage.ts"] },
  { name: "check-tenant-chokepoint", cmd: "node", args: ["scripts/check-tenant-chokepoint.mjs"] },
  {
    name: "check-tenant-integrity",
    cmd: "node",
    args: ["--env-file=.env.test.local", "scripts/check-tenant-integrity.mjs"],
  },
  // Last: boots the app and drives it over a real socket. Slowest leg, and the
  // only one that can see the middleware/priming layer between socket and query.
  {
    name: "check-http-smoke",
    // `--env-file`: the onboarding assertions need DATABASE_URL to mint a token
    // (only its hash is stored, so it cannot be created over HTTP) and to remove
    // the tenant they create.
    cmd: "node",
    args: ["--env-file=.env.local", "scripts/check-http-smoke.mjs"],
  },
  // Also boots the app, so it runs after the smoke leg rather than beside it:
  // Next 16 refuses to start a second dev server while one is running.
  {
    name: "check-a11y",
    // `--env-file`: the wizard audit mints a real onboarding code and launches a
    // real workspace, so the confirmation screen is audited rather than assumed.
    cmd: "node",
    args: ["--env-file=.env.local", "scripts/check-a11y.mjs"],
  },
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
