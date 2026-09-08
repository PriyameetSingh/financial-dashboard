#!/usr/bin/env npx tsx
/**
 * CI guard: `ModuleDef.dependsOn` is structurally sound.
 *
 * The Phase 3 counterpart of `check-route-module-map.ts`, for the dependency
 * graph instead of the route map. Three failure conditions:
 *
 *   1. UNKNOWN CODE     a `dependsOn` entry names a code absent from
 *                       MODULE_CATALOG.
 *   2. UNSATISFIABLE    a `dependsOn` entry names a `roadmap` module — one
 *                       that can never be enabled, so the dependency could
 *                       never be met.
 *   3. CYCLE            the dependency graph has a cycle (including a module
 *                       naming itself), which would make "enable X" require
 *                       "enable X" transitively.
 *
 * No database required — this checks the catalog's shape, not any tenant's
 * data. See `lib/entitlements/catalog.ts`'s `ModuleDef.dependsOn` doc comment
 * for why every entry is empty today, and what adding a real one commits to.
 *
 * Run: npx tsx scripts/check-capability-deps.ts
 */
import { MODULE_CATALOG, moduleByCode } from "../lib/entitlements/catalog";

const errors: string[] = [];
let edgeCount = 0;
let modulesWithDeps = 0;

for (const mod of MODULE_CATALOG) {
  const deps = mod.dependsOn ?? [];
  if (deps.length > 0) modulesWithDeps++;

  for (const depCode of deps) {
    edgeCount++;
    const dep = moduleByCode(depCode);
    if (!dep) {
      errors.push(`UNKNOWN CODE: ${mod.code} depends on "${depCode}", which is not in MODULE_CATALOG.`);
      continue;
    }
    if (depCode === mod.code) {
      errors.push(`SELF-DEPENDENCY: ${mod.code} lists itself in dependsOn.`);
      continue;
    }
    if (dep.enforcement === "roadmap") {
      errors.push(
        `UNSATISFIABLE: ${mod.code} depends on ${depCode}, which is enforcement "roadmap" and can never be enabled.`,
      );
    }
  }
}

// Cycle detection over the whole graph (not just modules with direct
// self-deps) — standard DFS with a recursion-stack set, run from every node
// so a cycle unreachable from an arbitrary start is still found.
type Color = "white" | "gray" | "black";
const color = new Map<string, Color>(MODULE_CATALOG.map((m) => [m.code, "white"]));
const cyclePath: string[] = [];

function visit(code: string, path: string[]): boolean {
  color.set(code, "gray");
  path.push(code);
  const mod = moduleByCode(code);
  for (const depCode of mod?.dependsOn ?? []) {
    if (!moduleByCode(depCode)) continue; // already reported above
    const c = color.get(depCode);
    if (c === "gray") {
      cyclePath.push(...path, depCode);
      return true;
    }
    if (c === "white" && visit(depCode, path)) return true;
  }
  path.pop();
  color.set(code, "black");
  return false;
}

for (const mod of MODULE_CATALOG) {
  if (color.get(mod.code) === "white") {
    if (visit(mod.code, [])) break;
  }
}

if (cyclePath.length > 0) {
  errors.push(`CYCLE: ${cyclePath.join(" → ")}`);
}

if (errors.length > 0) {
  console.error(`check-capability-deps: FAILED (${errors.length} issue(s))\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `check-capability-deps: ok (${MODULE_CATALOG.length} modules checked, ${modulesWithDeps} with dependsOn, ${edgeCount} edge(s), no cycles)`,
);
