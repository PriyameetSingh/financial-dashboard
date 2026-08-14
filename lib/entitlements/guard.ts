/**
 * Phase 3 — the entitlement decision.
 *
 * The fourth layer of the access model:
 *
 *   tenant  →  ENTITLEMENT  →  RBAC  →  data-scope
 *
 * Entitlement answers "is this organisation provisioned for this module?". It
 * composes with the other three and replaces none of them: opening a module does
 * not grant a single permission, and every `require*` guard still runs
 * underneath. The gate only ever REMOVES access.
 *
 * Deliberately pure — pathname plus a set of enabled codes in, verdict out, no
 * I/O — for the same reason `verifyTenantSession` is pure: the decision is the
 * security boundary, so it must be directly assertable without a server or a
 * database.
 */
import { resolveRouteModule } from "./route-modules";

export type ModuleVerdict =
  /** Always-on core. Reachable regardless of entitlement state. */
  | { kind: "core"; module: string }
  /** Gated and provisioned. */
  | { kind: "allowed"; module: string }
  /** Gated and not provisioned (row absent, or `enabled = false`). */
  | { kind: "denied"; module: string }
  /** No rule matched. Fails closed; the build check makes this unshippable. */
  | { kind: "unmapped" };

/**
 * Decide whether a request may reach a route, given the tenant's enabled module
 * codes.
 *
 * Absence of a module from `enabledModules` is a denial, not a default-allow:
 * a tenant with no entitlement rows at all gets core and nothing else.
 */
export function moduleVerdict(
  pathname: string,
  enabledModules: ReadonlySet<string>,
): ModuleVerdict {
  const resolved = resolveRouteModule(pathname);
  if (!resolved) return { kind: "unmapped" };

  switch (resolved.enforcement) {
    case "core":
      return { kind: "core", module: resolved.module };
    case "gated":
      return enabledModules.has(resolved.module)
        ? { kind: "allowed", module: resolved.module }
        : { kind: "denied", module: resolved.module };
    case "roadmap":
      // Roadmap modules are catalog vocabulary with no product surface. No route
      // may map to one — check-route-module-map.mjs fails the build if it does —
      // so reaching here means the map and the catalog disagree. Deny.
      return { kind: "denied", module: resolved.module };
  }
}

/** True when the request must not proceed. Mirrors `isTenantSessionRejected`. */
export function isModuleRejected(verdict: ModuleVerdict): boolean {
  return verdict.kind === "denied" || verdict.kind === "unmapped";
}

/** True when a link may be shown. The nav is derived from the SAME decision the
 *  gate makes, so a visible link can never 404 and a 404 link can never show. */
export function isNavHrefVisible(href: string, enabledModules: ReadonlySet<string>): boolean {
  return !isModuleRejected(moduleVerdict(href, enabledModules));
}

/**
 * Filter a nav tree to the entitled modules, children included.
 *
 * Generic over the item shape so it stays a pure function testable without React
 * — `components/Sidebar.tsx` passes its own `NavItem[]` through unchanged.
 *
 * Hiding is presentation only. It is never the enforcement: a disabled module's
 * routes 404 by direct URL whether or not anything links to them.
 */
export function visibleNavItems<T extends { href: string; children?: T[] }>(
  items: readonly T[],
  enabledModules: ReadonlySet<string>,
): T[] {
  return items
    .filter((item) => isNavHrefVisible(item.href, enabledModules))
    .map((item) =>
      item.children
        ? { ...item, children: visibleNavItems(item.children, enabledModules) }
        : item,
    );
}
