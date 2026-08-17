import { MODULE_CATALOG, type ModuleTier } from "./catalog";

/**
 * The tier ceiling — what an organization is allowed to switch on.
 *
 * ONE function decides this, and both places that need it call it: onboarding,
 * where the ceiling comes from the spent token, and the menu-card configurator,
 * where it comes from `Tenant.planTier`. They were separate before this file
 * existed, and separate is how a customer ends up provisioned at one tier and
 * able to self-upgrade from another.
 *
 * WHERE THE CEILING IS STORED, and why it is not where it looks like it should
 * be. `TenantEntitlement.tier` is not the ceiling: it records which tier each
 * MODULE belongs to, so every tenant has rows at every tier and reading it as a
 * plan would grant everyone everything. The ceiling is `Tenant.planTier`, one
 * value per organization, set from the onboarding token at provisioning and
 * backfilled for pre-existing tenants to the highest tier they were already
 * using — so nobody lost access to something they had.
 */

/** Low to high. A ceiling reaches its own tier and everything below it. */
export const TIER_ORDER: readonly ModuleTier[] = ["core", "standard", "premium", "addon"];

/**
 * The effective ceiling for a tenant.
 *
 * Null reads as `core`, which is both the fail-closed direction and the only
 * defensible one: a tenant whose plan nobody recorded has bought the base.
 */
export function planCeiling(planTier: ModuleTier | null | undefined): ModuleTier {
  return planTier && TIER_ORDER.includes(planTier) ? planTier : "core";
}

/** Every tier a ceiling reaches. Unknown values fall back to the lowest. */
export function tiersReachedBy(tier: ModuleTier): readonly ModuleTier[] {
  const index = TIER_ORDER.indexOf(tier);
  return index < 0 ? ["core"] : TIER_ORDER.slice(0, index + 1);
}

/** True when a module is inside the ceiling. Core modules always are. */
export function moduleWithinCeiling(code: string, ceiling: ModuleTier): boolean {
  const mod = MODULE_CATALOG.find((m) => m.code === code);
  if (!mod) return false;
  if (mod.enforcement === "roadmap") return false;
  if (mod.enforcement === "core") return true;
  return mod.tier !== null && tiersReachedBy(ceiling).includes(mod.tier);
}

export type GrantResolution = {
  /** Module codes to enable. Always includes every core module. */
  enabled: string[];
  /** Codes the caller asked for that the ceiling does not reach. */
  denied: string[];
};

/**
 * THE intersection. Given what a caller asked for and what their plan reaches,
 * decide what is actually enabled.
 *
 * Three rules, and the first is the one people forget:
 *
 *   1. Core modules are enabled whether or not they were asked for, and cannot
 *      be refused. Switching off the shell, roles or administration produces a
 *      workspace nobody can administer back to health — which is the same
 *      reason the request-time guard ignores them entirely.
 *   2. A gated module inside the ceiling is enabled if asked for, off if not.
 *   3. A gated module above the ceiling is DENIED and reported. Silently
 *      dropping it is how a customer discovers on Monday that the thing they
 *      ticked on Friday never turned on.
 *
 * Roadmap modules are absent from both lists: they have no product surface, so
 * asking for one is neither granted nor a denial worth reporting.
 */
export function resolveGrants(requestedCodes: Iterable<string>, ceiling: ModuleTier): GrantResolution {
  const requested = new Set(requestedCodes);
  const reachable = tiersReachedBy(ceiling);
  const enabled: string[] = [];
  const denied: string[] = [];

  for (const mod of MODULE_CATALOG) {
    if (mod.enforcement === "roadmap") continue;
    if (mod.enforcement === "core") {
      enabled.push(mod.code);
      continue;
    }
    if (!requested.has(mod.code)) continue;
    if (mod.tier !== null && reachable.includes(mod.tier)) enabled.push(mod.code);
    else denied.push(mod.code);
  }

  return { enabled, denied };
}
