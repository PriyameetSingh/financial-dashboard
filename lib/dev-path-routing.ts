/**
 * DEV-ONLY path-based tenant routing.
 *
 * Production addresses a tenant by HOST (`odisha.airawat.test` → slug `odisha`,
 * lib/tenant-config/resolution.ts). That is the real model and nothing here
 * changes it. It is also miserable to run locally: every tenant needs an
 * /etc/hosts line, and Next's dev server treats each subdomain as a different
 * origin.
 *
 * So in development only, a tenant can also be addressed by the FIRST PATH
 * SEGMENT on a single host:
 *
 *   /                     the public Airawat landing (no tenant, no session)
 *   /odisha/dashboard     enter Odisha, then continue at /dashboard
 *   /demo/dashboard       enter the demonstration tenant (Suryapur), then /dashboard
 *   /onboarding           public, no session
 *
 * The prefix is an ENTRY POINT, not a permanent address: the proxy mints a
 * dev-auth session for the slug and redirects to the unprefixed path, after
 * which the session cookie carries the tenant. That is what keeps this feature
 * to a gated branch in the proxy instead of a prefix every link, redirect and
 * `fetch()` in the application would have to learn about.
 *
 * ── What this does NOT change ───────────────────────────────────────────────
 * Data scope. The session's `tenantId` binding and the Prisma chokepoint govern
 * what a request can read, exactly as they do in production; the path only
 * decides which tenant gets auto-minted. A host-derived slug still wins when
 * one is present, so the host↔session binding stays under test.
 */

/**
 * Both conditions, deliberately. `NODE_ENV` alone would arm this in `next
 * build`-less test runs; `DEV_AUTH_ENABLED` alone would arm it wherever someone
 * set that flag on a deployed box. The pair is the same gate the dev-session
 * minting route uses, so path routing cannot outlive the sessions it depends on.
 */
export function devPathRoutingEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_AUTH_ENABLED === "1";
}

/**
 * First segments that can never be a tenant, whatever the tenants table says.
 *
 * Every top-level route directory in `app/` is here, plus the framework and
 * asset roots. A tenant slug that collided with one of these would otherwise
 * shadow a real page — `tests/dev-path-routing.test.ts` reads `app/` and fails
 * if a new route directory is added without being listed.
 */
export const RESERVED_ROOT_SEGMENTS: ReadonlySet<string> = new Set([
  // Framework and assets.
  "_next",
  "api",
  "favicon.ico",
  "images",
  // Route directories under app/.
  "action-items",
  "admin",
  "auth",
  "changelog",
  "command-centre",
  "dashboard",
  "design-system",
  "financial",
  "kpis",
  "login",
  "meetings",
  "my-tasks",
  "onboarding",
  "platform",
  "profile",
  "reports",
  "schemes",
]);

/** A slug is lowercase alphanumeric with dashes — same shape the seeds write. */
const SLUG_SHAPE = /^[a-z0-9][a-z0-9-]*$/;

export type TenantPathSplit = {
  /** The candidate slug, or null when the first segment cannot be one. */
  slugCandidate: string | null;
  /** Everything after the slug, always starting with `/`. `/` when nothing followed. */
  rest: string;
};

/**
 * Split `/odisha/financial/schemes-board` into `odisha` + `/financial/schemes-board`.
 *
 * Returns `slugCandidate: null` for reserved roots, the bare root, malformed
 * segments, and anything carrying a file extension (a stray asset request).
 * Whether a candidate is a REAL tenant is decided against the database by the
 * caller — this function only decides what could be one.
 */
export function splitTenantPath(pathname: string): TenantPathSplit {
  const none: TenantPathSplit = { slugCandidate: null, rest: pathname };
  if (!pathname.startsWith("/")) return none;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return none;

  const first = segments[0];
  // Reserved roots are matched case-insensitively — `/API/x` is no more a
  // tenant than `/api/x` — but a slug must be spelled exactly as the tenants
  // table stores it. Case-folding a candidate would make `/ODISHA` resolve to a
  // tenant here and then fail the exact-match lookup, which reads as a missing
  // tenant rather than as a mistyped URL.
  if (RESERVED_ROOT_SEGMENTS.has(first.toLowerCase())) return none;
  if (first.includes(".")) return none;
  if (!SLUG_SHAPE.test(first)) return none;

  const rest = segments.slice(1).join("/");
  return { slugCandidate: first, rest: rest ? `/${rest}` : "/" };
}

/**
 * Where a visitor entering `/{slug}` with no deeper path should land.
 *
 * `/dashboard` rather than `/`: the root is the public landing, so sending them
 * there would bounce them straight back out of the workspace they just asked
 * for.
 */
export const DEV_TENANT_ENTRY_PATH = "/dashboard";
