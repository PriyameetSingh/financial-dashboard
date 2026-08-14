/**
 * Phase 3 — the route → module map.
 *
 * Every route in `app/` resolves through here to exactly one catalog module. The
 * map is static TypeScript rather than database rows for three reasons:
 *
 *   1. `scripts/check-route-module-map.mjs` must run at BUILD time with no
 *      database, the way check-api-guards and check-tenant-chokepoint do.
 *   2. A route's module is a fact about this codebase, not about a tenant. Only
 *      the `enabled` flag is tenant data.
 *   3. Drift between the map and the catalog then becomes a testable assertion
 *      instead of an unobservable mismatch.
 *
 * Enforcement class is NOT recorded here — it is read from the catalog, so "which
 * routes are ungateable" stays a property of the module, not a second list that
 * can disagree with the first.
 */
import { moduleByCode, type ModuleEnforcement } from "./catalog";
import { NEXTJS_BASE_PATH } from "@/lib/next-base-path";

export type RouteRule = {
  /** Path prefix, matched on SEGMENT boundaries (see `matches`). */
  path: string;
  /** Catalog module code. */
  module: string;
};

/**
 * Longest matching rule wins, which is what lets a broad core prefix contain a
 * narrower gated one (`/admin` core, `/admin/agents` → MOD-AI). Order in this
 * array is presentational only; `resolveRouteModule` sorts by specificity.
 */
export const ROUTE_MODULE_RULES: readonly RouteRule[] = [
  // ── Core: auth, shell, profile ────────────────────────────────────────────
  { path: "/", module: "MOD-AUTH" }, // root redirect → /dashboard
  { path: "/login", module: "MOD-AUTH" },
  { path: "/auth", module: "MOD-AUTH" },
  { path: "/api/auth", module: "MOD-AUTH" },
  { path: "/api/health", module: "MOD-AUTH" },

  { path: "/profile", module: "MOD-PROF" },
  { path: "/api/v1/profile", module: "MOD-PROF" },

  // My Tasks is an aggregator over whatever else is enabled, so it is shell:
  // it renders empty rather than 404 when its sources are off.
  { path: "/my-tasks", module: "MOD-SHELL" },
  // The nav bootstrap. Must stay reachable or the client cannot learn which
  // modules to render — including that it should render almost nothing.
  { path: "/api/v1/rbac/me", module: "MOD-SHELL" },

  // ── Core: the landing dashboard ───────────────────────────────────────────
  { path: "/dashboard", module: "MOD-CC" },
  { path: "/command-centre", module: "MOD-CC" }, // legacy alias, same nav item
  { path: "/api/v1/dashboard/command-centre", module: "MOD-CC" },

  // ── Core: RBAC (the layer BELOW entitlement — gating it is incoherent) ─────
  { path: "/admin/users", module: "MOD-RBAC" },
  { path: "/admin/roles", module: "MOD-RBAC" },
  { path: "/api/v1/admin/users", module: "MOD-RBAC" },
  { path: "/api/v1/rbac", module: "MOD-RBAC" },
  { path: "/api/v1/directory", module: "MOD-RBAC" },

  // ── Core: administration and shared reference data ────────────────────────
  { path: "/admin", module: "MOD-ADMIN" },
  { path: "/api/v1/admin", module: "MOD-ADMIN" },
  // Read-only FY reference data, consumed by Finance, KPIs and Meetings alike.
  // Core so a Finance-only tenant is not forced to buy Administration; managing
  // financial years stays under /api/v1/admin/financial-years above.
  { path: "/api/v1/financial-years", module: "MOD-ADMIN" },

  // ── Gated ─────────────────────────────────────────────────────────────────
  { path: "/financial", module: "MOD-FIN" },
  { path: "/api/v1/financial", module: "MOD-FIN" },

  { path: "/schemes", module: "MOD-SR" },
  { path: "/admin/schemes", module: "MOD-SR" },
  { path: "/admin/schemes-order", module: "MOD-SR" },
  { path: "/api/v1/schemes", module: "MOD-SR" },
  { path: "/api/v1/subschemes", module: "MOD-SR" },

  { path: "/kpis", module: "MOD-KPI" },
  { path: "/api/v1/kpis", module: "MOD-KPI" },

  { path: "/meetings", module: "MOD-MTG" },
  { path: "/api/v1/meetings", module: "MOD-MTG" },
  { path: "/api/v1/meeting-topics", module: "MOD-MTG" },
  { path: "/api/v1/meeting-materials", module: "MOD-MTG" },

  // Absorbs the former MOD-EXP: the PDF/XLSX endpoints are report formats.
  { path: "/reports", module: "MOD-RPT" },
  { path: "/api/v1/reports", module: "MOD-RPT" },

  { path: "/action-items", module: "MOD-ACT" },
  { path: "/api/v1/action-items", module: "MOD-ACT" },

  { path: "/admin/agents", module: "MOD-AI" },
  { path: "/api/v1/admin/agent", module: "MOD-AI" },
  { path: "/api/v1/assistant", module: "MOD-AI" },
  { path: "/api/v1/dashboard/ai-alerts", module: "MOD-AI" },

  { path: "/admin/notifications", module: "MOD-NOTIF" },
  { path: "/api/v1/admin/notification-config", module: "MOD-NOTIF" },
  { path: "/api/v1/notifications", module: "MOD-NOTIF" },

  { path: "/changelog", module: "MOD-CHLOG" },
  { path: "/api/v1/releases", module: "MOD-CHLOG" },
];

/** Most specific (longest) rule first — resolution takes the first match. */
const RULES_BY_SPECIFICITY = [...ROUTE_MODULE_RULES].sort((a, b) => b.path.length - a.path.length);

/**
 * Normalise a request pathname for matching: drop `basePath` and any trailing
 * slash, and drop the query/hash if a full path was handed in.
 *
 * `basePath` stripping is defensive. Next already gives `request.nextUrl.pathname`
 * without it (confirmed against the compiled matcher, which carries the basePath
 * itself), but the same function is used by the build-time check and by tests
 * that may pass either form, and being wrong here would silently mis-gate.
 */
export function normalizeRoutePath(pathname: string): string {
  let p = pathname.split("?")[0].split("#")[0];
  if (NEXTJS_BASE_PATH && (p === NEXTJS_BASE_PATH || p.startsWith(`${NEXTJS_BASE_PATH}/`))) {
    p = p.slice(NEXTJS_BASE_PATH.length);
  }
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/**
 * Segment-aware prefix match.
 *
 * This is the whole reason the map is safe. A plain `startsWith` would make the
 * rule `/api/v1/financial` (MOD-FIN, gated) swallow `/api/v1/financial-years`
 * (core reference data) — a Finance-less tenant would lose the financial-year
 * list that Meetings and KPIs also read. Matching on segment boundaries does not.
 */
function matches(rulePath: string, pathname: string): boolean {
  if (rulePath === "/") return pathname === "/";
  return pathname === rulePath || pathname.startsWith(`${rulePath}/`);
}

export type RouteResolution = {
  module: string;
  enforcement: ModuleEnforcement;
  /** The rule that matched — surfaced for test/diagnostic messages. */
  rule: string;
};

/**
 * Resolve a pathname to its module, or `null` when nothing maps.
 *
 * `null` is a real outcome, not an error: the guard denies on it (fail closed)
 * and `scripts/check-route-module-map.mjs` fails the build on it, so an
 * unmapped route can neither ship nor be reached.
 */
export function resolveRouteModule(pathname: string): RouteResolution | null {
  const p = normalizeRoutePath(pathname);
  for (const rule of RULES_BY_SPECIFICITY) {
    if (!matches(rule.path, p)) continue;
    const def = moduleByCode(rule.module);
    // An unknown code is a programming error the build check also catches; treat
    // it as unmapped so the runtime direction stays "deny".
    if (!def) return null;
    return { module: def.code, enforcement: def.enforcement, rule: rule.path };
  }
  return null;
}
