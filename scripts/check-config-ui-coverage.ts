#!/usr/bin/env npx tsx
/**
 * CI guard: the tenant-config admin UI's editable fields match
 * `lib/tenant-config/registry.ts`'s `listConfigKeys()`, or the gap is named.
 *
 * Phase 2 investigation (docs/plan.md, "Config Schema & Single Write Path")
 * found that `app/admin/design-system/Configurator.tsx` is the only UI that
 * writes to `TenantConfigEntry`, and it hand-codes which keys it edits (via
 * literal `put("key", ...)` call sites) rather than iterating
 * `listConfigKeys()`. That is a second, implicit field list that can drift
 * from the registry exactly the way `check-route-module-map.ts` exists to
 * catch for routes: a key added to the registry gets validation and a write
 * path for free, but no UI, and nothing says so.
 *
 * This does not require every key to have a UI today — most don't yet (see
 * NOT_YET_EXPOSED below) — it requires every gap to be a recorded decision,
 * the same shape `check-api-guards.mjs`'s `UNAUTHENTICATED_BY_DESIGN` uses.
 * Adding a new storable key without either wiring it into the configurator or
 * adding it here (with a reason) fails CI.
 *
 * Two failure modes:
 *   1. UNCOVERED   a registry key is neither edited by the UI nor exempted.
 *   2. STALE       an exemption names a key the UI now actually edits, or a
 *                  key no longer in the registry — the same "allowance
 *                  outlived its reason" check `check-api-guards.mjs` runs.
 *
 * No database required — this checks source text, not any tenant's data.
 *
 * Run: npx tsx scripts/check-config-ui-coverage.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listConfigKeys } from "../lib/tenant-config/registry";

const ROOT = new URL("..", import.meta.url).pathname;
const CONFIGURATOR_PATH = "app/admin/design-system/Configurator.tsx";

/**
 * Keys the registry declares that the configurator does not yet expose, each
 * with the reason. Every one of these is a real, open gap (Phase 2 finding),
 * not a permanent design decision — settable today only via the onboarding
 * wizard (`lib/onboarding/provision.ts`) or a direct API call.
 */
const NOT_YET_EXPOSED = new Map<string, string>([
  ["productName", "no UI yet; set at onboarding (configFromDraft), editable only via raw PUT today"],
  ["pdfHeaderLine", "no UI yet; set at onboarding (configFromDraft), editable only via raw PUT today"],
  ["reportFilenamePrefix", "no UI yet; set at onboarding (configFromDraft), editable only via raw PUT today"],
  ["locale", "no UI yet; set at onboarding (configFromDraft), editable only via raw PUT today"],
  ["timezone", "no UI yet; set at onboarding (configFromDraft), editable only via raw PUT today"],
  ["currencySymbol", "no UI yet; set at onboarding (configFromDraft), editable only via raw PUT today"],
  ["currencyUnit", "no UI yet; set at onboarding (configFromDraft), editable only via raw PUT today"],
  ["logoPublicPath", "no UI yet; never set by any surface today, only the ODISHA_DEFAULTS literal"],
  ["labels", "no UI yet; never set by any surface today, only the ODISHA_DEFAULTS literal"],
]);

// Matches `put("key", ...)` / `put('key', ...)` call sites — the configurator's
// own write function, defined and called only in this file.
const PUT_CALL_RE = /\bput\(\s*["']([A-Za-z0-9]+)["']/g;

function extractUiKeys(source: string): Set<string> {
  const keys = new Set<string>();
  for (const match of source.matchAll(PUT_CALL_RE)) keys.add(match[1]);
  return keys;
}

const configuratorSrc = readFileSync(join(ROOT, CONFIGURATOR_PATH), "utf8");
const uiKeys = extractUiKeys(configuratorSrc);
const registryKeys = listConfigKeys().map((k) => k.key);
const registryKeySet = new Set(registryKeys);

const errors: string[] = [];

for (const key of registryKeys) {
  if (uiKeys.has(key)) continue;
  if (NOT_YET_EXPOSED.has(key)) continue;
  errors.push(
    `UNCOVERED: "${key}" is in listConfigKeys() but ${CONFIGURATOR_PATH} does not edit it, and it is ` +
      `not in NOT_YET_EXPOSED. Wire it into the configurator, or add it to NOT_YET_EXPOSED with a reason.`,
  );
}

for (const [key, reason] of NOT_YET_EXPOSED) {
  if (!registryKeySet.has(key)) {
    errors.push(`STALE: NOT_YET_EXPOSED names "${key}", which is no longer in listConfigKeys().`);
    continue;
  }
  if (uiKeys.has(key)) {
    errors.push(
      `STALE: NOT_YET_EXPOSED names "${key}" ("${reason}"), but ${CONFIGURATOR_PATH} now edits it. ` +
        `Remove the exemption.`,
    );
  }
}

// A key the UI edits that the registry doesn't know is a typo or a removed
// key left behind — either way, worth failing loudly rather than silently
// calling `validateConfigValue` with a key that will always be rejected.
for (const key of uiKeys) {
  if (!registryKeySet.has(key)) {
    errors.push(`UNKNOWN: ${CONFIGURATOR_PATH} calls put("${key}", ...), which is not in listConfigKeys().`);
  }
}

if (errors.length > 0) {
  console.error(`check-config-ui-coverage: FAILED (${errors.length} issue(s))\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `check-config-ui-coverage: ok (${registryKeys.length} registry keys; ` +
    `${uiKeys.size} covered by the UI; ${NOT_YET_EXPOSED.size} exempted with a stated reason)`,
);
