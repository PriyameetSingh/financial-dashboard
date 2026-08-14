#!/usr/bin/env node
/**
 * CI guard for the Phase 2 tenant chokepoint. Two static checks, both about
 * paths the Prisma client extension CANNOT cover:
 *
 *   1. `prismaUnscoped` (the raw, unfiltered client) may only be imported by
 *      contexts that legitimately run outside a tenant scope: middleware's
 *      pre-resolution auth lookup, scripts, seeds, tests, and the tenancy
 *      plumbing itself. Application code (routes, components, most of lib/)
 *      must use the scoped `prisma` client, so a leak cannot be introduced by
 *      importing the raw one.
 *
 *   2. Raw SQL (`$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe`)
 *      bypasses the extension entirely. Exactly one such query exists and is
 *      justified in place (lib/server-rbac.ts). Any NEW raw query must be
 *      reviewed and added to the allowlist deliberately.
 *
 * Run: node scripts/check-tenant-chokepoint.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".cursor", ".continue"]);
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs", ".jsx"]);

/** Files/prefixes allowed to import the unscoped client. */
const UNSCOPED_ALLOWLIST = [
  /^lib\/prisma\.ts$/,               // defines both clients
  /^lib\/tenant-resolve-db\.ts$/,    // resolves the tenant itself (pre-scope)
  /^lib\/entitlements\/lookup\.ts$/, // proxy-time entitlement read (pre-scope), explicit tenantId
  /^lib\/cached-financial-metadata\.ts$/, // cross-request cache: explicit tenantId in key + where
  /^proxy\.ts$/,                     // middleware: runs before any scope exists
  /^scripts\//,
  /^prisma\//,
  /^tests\//,
  /^seed_dashboards\.ts$/,
];

/** Files allowed to contain raw SQL, with the reason recorded here. */
const RAW_SQL_ALLOWLIST = [
  {
    file: /^lib\/server-rbac\.ts$/,
    reason:
      "permission-union query keyed by a tenant-resolved userId; every table it touches is tenant-scoped or the global permission registry",
  },
  { file: /^scripts\//, reason: "maintenance scripts run outside a tenant scope with explicit ids" },
  { file: /^prisma\//, reason: "seeds/migrations run outside a tenant scope" },
];

const UNSCOPED_RE = /\bprismaUnscoped\b/;
const RAW_SQL_RE = /\$(?:query|execute)Raw(?:Unsafe)?\b/;
/**
 * `TenantConfigEntry` is in GLOBAL_MODELS, so the chokepoint does NOT filter
 * it: a bare `findMany()` returns every tenant's config and a bare
 * `deleteMany({ where: { key } })` wipes every tenant's row. All access must go
 * through lib/tenant-config/store.ts, whose functions require a tenantId.
 */
const CONFIG_ENTRY_RE = /\btenantConfigEntry\b/;
const CONFIG_ENTRY_ALLOWLIST = [
  /^lib\/tenant-config\/store\.ts$/,  // the sanctioned accessor
  /^scripts\//,
  /^prisma\//,
  /^tests\//,
];

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full));
    else if (CODE_EXTS.has(entry.slice(entry.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

const offenders = [];
for (const full of listFiles(ROOT)) {
  const rel = relative(ROOT, full);
  if (rel.startsWith("scripts/check-tenant-chokepoint")) continue;
  const src = readFileSync(full, "utf8");

  if (UNSCOPED_RE.test(src) && !UNSCOPED_ALLOWLIST.some((re) => re.test(rel))) {
    offenders.push(`${rel}: imports/uses prismaUnscoped outside the allowlist — use the scoped \`prisma\` client`);
  }
  if (CONFIG_ENTRY_RE.test(src) && !CONFIG_ENTRY_ALLOWLIST.some((re) => re.test(rel))) {
    offenders.push(
      `${rel}: touches tenantConfigEntry directly — that table is NOT auto-scoped; ` +
        `use lib/tenant-config/store.ts, which requires an explicit tenantId`,
    );
  }
  if (RAW_SQL_RE.test(src) && !RAW_SQL_ALLOWLIST.some((a) => a.file.test(rel))) {
    offenders.push(`${rel}: raw SQL bypasses the tenant chokepoint — scope it explicitly and allowlist it here`);
  }
}

if (offenders.length > 0) {
  console.error("check-tenant-chokepoint: FAILED\n");
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    "\nThe tenant filter is applied by the Prisma client extension in lib/prisma.ts. Anything that\n" +
      "bypasses it (raw SQL, the unscoped client) must carry an explicit tenantId and be recorded here.",
  );
  process.exit(1);
}
console.log(
  "check-tenant-chokepoint: ok (no unscoped-client, raw-SQL, or unscoped tenant-config escapes outside the allowlist)",
);
