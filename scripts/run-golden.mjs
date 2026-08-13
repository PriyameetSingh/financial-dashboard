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
 *   5. check-tenant-chokepoint — no unscoped-client / raw-SQL escapes (Phase 2)
 *   6. check-tenant-integrity  — no NULL or cross-tenant rows in the DB (Phase 2)
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
  { name: "check-tenant-chokepoint", cmd: "node", args: ["scripts/check-tenant-chokepoint.mjs"] },
  {
    name: "check-tenant-integrity",
    cmd: "node",
    args: ["--env-file=.env.test.local", "scripts/check-tenant-integrity.mjs"],
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
  "\n✓ GOLDEN GREEN — all six legs passed (build, vitest, verify-behaviors, check-api-guards, check-tenant-chokepoint, check-tenant-integrity)",
);
