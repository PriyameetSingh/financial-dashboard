/**
 * Phase 3 — the module catalog.
 *
 * This file is the source of truth for the module vocabulary, in exactly the way
 * `lib/tenant-config/registry.ts` is the source of truth for config keys: the
 * codes are referenced literally in source (the route map, the tests), the
 * database `modules` table is seeded FROM here by migration, and a test asserts
 * the two never drift.
 *
 * Deliberately free of Prisma and Next imports so the pure guard, the build-time
 * check scripts, and the seeds can all read it.
 *
 * Reconciled from the Notion `HUDD Product Ops › Modules` database (23 rows) to
 * 20: `MOD-EXP` folds into `MOD-RPT` (export is a report format, not a separate
 * purchase), `MOD-TASK` folds into the core shell (it is an aggregator over
 * whatever else is enabled), and `MOD-NFR` is excluded — it is a cross-cutting
 * requirements bucket, not a UI module.
 *
 * ENFORCEMENT CLASS is the important column, and it is data, not a hardcoded list
 * somewhere in the guard:
 *
 *   core     never gated. Gating any of these would make a tenant unrecoverable —
 *            they could not log in, navigate, or be administered back to health.
 *            The guard lets these through no matter what the entitlement rows say.
 *   gated    checked against `tenant_entitlements` on every request. Disabled ⇒ 404.
 *   roadmap  catalog vocabulary only. No route may map to one (the build check
 *            rejects it), and the guard denies if one somehow does.
 *
 * TIER mirrors the Notion `Tier` property and is a placeholder for the future
 * menu-card pricing. The guard NEVER reads it: a module is enabled or it is not.
 */

export type ModuleEnforcement = "core" | "gated" | "roadmap";
export type ModuleTier = "core" | "standard" | "premium" | "addon";
export type ModuleStatus = "active" | "deprecated" | "planned";

export type ModuleDef = {
  /** Stable code, e.g. "MOD-FIN". Matches the Notion `Module ID`. */
  code: string;
  name: string;
  enforcement: ModuleEnforcement;
  status: ModuleStatus;
  /** Commercial tier. Null until the menu-card pricing exists; never gates. */
  tier: ModuleTier | null;
};

export const MODULE_CATALOG: readonly ModuleDef[] = [
  // ── Core — never gated ────────────────────────────────────────────────────
  { code: "MOD-AUTH", name: "Auth/SSO", enforcement: "core", status: "active", tier: "core" },
  { code: "MOD-SHELL", name: "Shell / UX", enforcement: "core", status: "active", tier: "core" },
  { code: "MOD-PROF", name: "Profile", enforcement: "core", status: "active", tier: "core" },
  { code: "MOD-RBAC", name: "RBAC", enforcement: "core", status: "active", tier: "core" },
  { code: "MOD-ADMIN", name: "Administration", enforcement: "core", status: "active", tier: "core" },
  { code: "MOD-CC", name: "Command Centre", enforcement: "core", status: "active", tier: "core" },

  // ── Gated — the enforced SKUs ─────────────────────────────────────────────
  { code: "MOD-FIN", name: "Financial Progress", enforcement: "gated", status: "active", tier: "standard" },
  { code: "MOD-SR", name: "Scheme Registry", enforcement: "gated", status: "active", tier: "standard" },
  { code: "MOD-KPI", name: "KPIs", enforcement: "gated", status: "active", tier: "standard" },
  { code: "MOD-MTG", name: "Meeting Organizer", enforcement: "gated", status: "active", tier: "standard" },
  { code: "MOD-RPT", name: "Reports", enforcement: "gated", status: "active", tier: "standard" },
  { code: "MOD-ACT", name: "Decision Tracker", enforcement: "gated", status: "active", tier: "standard" },
  { code: "MOD-AI", name: "AI Insights", enforcement: "gated", status: "active", tier: "premium" },
  { code: "MOD-NOTIF", name: "Notification Engine", enforcement: "gated", status: "active", tier: "standard" },
  { code: "MOD-CHLOG", name: "Changelog", enforcement: "gated", status: "active", tier: "standard" },

  // ── Roadmap — catalog rows only, no routes, no enforcement ─────────────────
  { code: "MOD-ANOM", name: "Anomaly Detection", enforcement: "roadmap", status: "planned", tier: null },
  { code: "MOD-APR", name: "Approval Workflows", enforcement: "roadmap", status: "planned", tier: null },
  { code: "MOD-LAPSE", name: "Lapse Risk Alerts", enforcement: "roadmap", status: "planned", tier: null },
  { code: "MOD-SEC", name: "Security", enforcement: "roadmap", status: "planned", tier: null },
  { code: "MOD-OPS", name: "Operations", enforcement: "roadmap", status: "planned", tier: null },
];

const BY_CODE = new Map(MODULE_CATALOG.map((m) => [m.code, m]));

export function moduleByCode(code: string): ModuleDef | undefined {
  return BY_CODE.get(code);
}

/** Codes a tenant can be provisioned for — everything except roadmap vocabulary. */
export const PROVISIONABLE_MODULE_CODES: readonly string[] = MODULE_CATALOG.filter(
  (m) => m.enforcement !== "roadmap",
).map((m) => m.code);

/** Codes the guard actually enforces. */
export const GATED_MODULE_CODES: readonly string[] = MODULE_CATALOG.filter(
  (m) => m.enforcement === "gated",
).map((m) => m.code);
