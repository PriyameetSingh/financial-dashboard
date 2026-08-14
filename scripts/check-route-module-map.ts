#!/usr/bin/env npx tsx
/**
 * CI guard: every route in `app/` resolves to exactly one catalog module.
 *
 * This is the Phase 3 counterpart of the Phase 2 DMMF exhaustiveness rule (a
 * model is tenant-scoped or explicitly global, never neither). Here: a route is
 * mapped to a gated module or to an always-on core module, never neither. A new
 * route cannot silently escape the entitlement gate.
 *
 * Four failure conditions, not one — the map has to be kept honest in both
 * directions:
 *
 *   1. UNMAPPED ROUTE  a route file no rule matches. It fails closed at runtime
 *                      (404 for everyone), which is safe but wrong.
 *   2. UNKNOWN CODE    a rule naming a module absent from MODULE_CATALOG.
 *   3. ROADMAP MAPPING a rule pointing at a `roadmap` module. Those are
 *                      vocabulary only and have no product surface.
 *   4. STALE RULE      a rule matching no route file at all — left behind after
 *                      a route was renamed or deleted. Harmless today, but it
 *                      silently re-gates whatever later occupies that path.
 *
 * Imports the SAME `resolveRouteModule` the runtime guard uses, so the check and
 * the enforcement can never disagree.
 *
 * Run: npx tsx scripts/check-route-module-map.ts   (no database required)
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MODULE_CATALOG, moduleByCode } from "../lib/entitlements/catalog";
import {
  ROUTE_MODULE_RULES,
  normalizeRoutePath,
  resolveRouteModule,
} from "../lib/entitlements/route-modules";

// `tsx` transpiles this to CJS, where `import.meta.dirname` is undefined, so the
// root comes from the working directory. Every golden leg runs from the repo
// root; the existsSync guard turns a wrong cwd into a clear message rather than
// a vacuous pass over zero routes.
const ROOT = process.cwd();
const APP_DIR = join(ROOT, "app");

if (!existsSync(APP_DIR)) {
  console.error(`check-route-module-map: no app/ directory under ${ROOT} — run from the repo root.`);
  process.exit(1);
}

/** Every `page.tsx` / `route.ts` under `app/`, as the pathname a browser requests. */
function routePathnames(): { file: string; pathname: string }[] {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(page|route)\.tsx?$/.test(entry)) files.push(relative(APP_DIR, full));
    }
  })(APP_DIR);

  return files.map((file) => {
    const segments = file
      .replace(/\/?(page|route)\.tsx?$/, "")
      .split("/")
      .filter(Boolean)
      .filter((s) => !/^\(.*\)$/.test(s)) // route groups are not in the URL
      .map((s) => {
        if (/^\[\.\.\..+\]$/.test(s)) return "seg-a/seg-b"; // catch-all
        if (/^\[.+\]$/.test(s)) return "seg"; // dynamic segment
        return s;
      });
    return { file, pathname: "/" + segments.join("/") };
  });
}

const routes = routePathnames();
const failures: string[] = [];

// (2) + (3): rules must name a real, mappable module.
for (const rule of ROUTE_MODULE_RULES) {
  const def = moduleByCode(rule.module);
  if (!def) {
    failures.push(
      `UNKNOWN CODE   rule "${rule.path}" names "${rule.module}", which is not in MODULE_CATALOG`,
    );
    continue;
  }
  if (def.enforcement === "roadmap") {
    failures.push(
      `ROADMAP MAP    rule "${rule.path}" maps to roadmap module "${rule.module}" — roadmap modules ` +
        `are catalog vocabulary and must have no routes`,
    );
  }
}

// (1): every route resolves.
const matchedRules = new Set<string>();
for (const { file, pathname } of routes) {
  const resolved = resolveRouteModule(pathname);
  if (!resolved) {
    failures.push(
      `UNMAPPED       ${pathname}   (app/${file}) — add a rule to ` +
        `lib/entitlements/route-modules.ts, or map it to a core module if it must never be gated`,
    );
    continue;
  }
  matchedRules.add(resolved.rule);
}

// (4): every rule earns its place.
for (const rule of ROUTE_MODULE_RULES) {
  if (!matchedRules.has(normalizeRoutePath(rule.path))) {
    failures.push(
      `STALE RULE     "${rule.path}" (${rule.module}) matches no route file — remove it, or it will ` +
        `silently gate whatever later occupies that path`,
    );
  }
}

if (failures.length > 0) {
  console.error("check-route-module-map: FAILED\n");
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    `\n${failures.length} problem(s). Entitlement is enforced at a single point (proxy.ts); this ` +
      `check is what proves that point sees every route.`,
  );
  process.exit(1);
}

const counts = new Map<string, number>();
for (const { pathname } of routes) {
  const resolved = resolveRouteModule(pathname)!;
  counts.set(resolved.module, (counts.get(resolved.module) ?? 0) + 1);
}
const coreRoutes = MODULE_CATALOG.filter((m) => m.enforcement === "core").reduce(
  (n, m) => n + (counts.get(m.code) ?? 0),
  0,
);
console.log(
  `check-route-module-map: ok (${routes.length} routes → ${counts.size} modules; ` +
    `${coreRoutes} core, ${routes.length - coreRoutes} gated; ` +
    `${ROUTE_MODULE_RULES.length} rules, none stale)`,
);
