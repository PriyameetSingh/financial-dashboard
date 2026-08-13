/**
 * Phase 2 Gate D — model classification for the tenant-scoping chokepoint.
 *
 * The classification is DERIVED, not hand-maintained: a model is tenant-scoped
 * iff its Prisma schema carries a `tenantId` scalar. Everything else must be
 * named in GLOBAL_MODELS with a written justification (see
 * docs/PHASE2-TENANCY-PLAN.md §1). A model in neither set is a hard error at
 * query time — a new model cannot silently become cross-tenant.
 *
 * Also derives, per scoped model, the FK fields that point at other
 * tenant-scoped models. The chokepoint uses this to reject writes that
 * reference another tenant's parent row (see lib/prisma.ts).
 */
import { Prisma } from "@prisma/client";

/**
 * Deliberately cross-tenant models. Each is justified in the plan:
 *  - Permission          closed registry of permission codes referenced literally
 *                        in source; written only by prisma/seed_roles.js; the
 *                        grants around it (RolePermission/UserRole/overrides)
 *                        are all tenant-scoped.
 *  - Release             vendor-authored product release metadata (releases.json).
 *  - ChangelogEntry      child of Release; product copy, never tenant data.
 *  - Tenant              platform infrastructure; reachable only through the resolver.
 *  - TenantConfigEntry   read only as "the resolved tenant's rows"; secret-class
 *                        keys are barred from the table by the registry guard.
 */
export const GLOBAL_MODELS: ReadonlySet<string> = new Set([
  "Permission",
  "Release",
  "ChangelogEntry",
  "Tenant",
  "TenantConfigEntry",
]);

export const TENANT_ID_FIELD = "tenantId";

/** FK on a scoped model that must reference a row of the same tenant. */
export type ParentFk = {
  /** Scalar FK field on this model, e.g. "schemeId". */
  field: string;
  /** Related model name, e.g. "Scheme". */
  model: string;
};

function buildRegistry() {
  const scoped = new Set<string>();
  const parentFks = new Map<string, ParentFk[]>();
  const relationTargets = new Map<string, Map<string, string>>();

  for (const model of Prisma.dmmf.datamodel.models) {
    // GLOBAL_MODELS is an explicit override: TenantConfigEntry carries a
    // tenantId column but is platform infrastructure read by the resolver
    // BEFORE any scope exists (always with an explicit tenantId filter), so it
    // must not be auto-scoped.
    if (GLOBAL_MODELS.has(model.name)) continue;
    if (model.fields.some((f) => f.name === TENANT_ID_FIELD && f.kind === "scalar")) {
      scoped.add(model.name);
    }
  }

  for (const model of Prisma.dmmf.datamodel.models) {
    if (!scoped.has(model.name)) continue;
    const fks: ParentFk[] = [];
    const targets = new Map<string, string>();
    for (const field of model.fields) {
      if (field.kind !== "object") continue;
      if (field.type !== "Tenant") targets.set(field.name, field.type);
      const from = field.relationFromFields ?? [];
      if (from.length !== 1) continue; // no composite FKs in this schema
      if (from[0] === TENANT_ID_FIELD) continue; // the tenant link itself
      if (!scoped.has(field.type)) continue; // parent is global → nothing to check
      fks.push({ field: from[0], model: field.type });
    }
    if (fks.length > 0) parentFks.set(model.name, fks);
    if (targets.size > 0) relationTargets.set(model.name, targets);
  }

  return { scoped, parentFks, relationTargets };
}

const registry = buildRegistry();

/** Models carrying a `tenantId` column — every query must be tenant-filtered. */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = registry.scoped;

/** Same-tenant FK checks per scoped model (write paths). */
export const PARENT_FKS: ReadonlyMap<string, readonly ParentFk[]> = registry.parentFks;

/**
 * model → (relation field name → related model). Lets the chokepoint walk
 * NESTED writes (`data: { performers: { create: [...] } }`) and stamp the
 * tenant on nested rows too — relation-nested operations do not surface as
 * their own `$allOperations` calls.
 */
export const RELATION_TARGETS: ReadonlyMap<string, ReadonlyMap<string, string>> = registry.relationTargets;

/** Every model in the datamodel, for exhaustiveness assertions. */
export function allModelNames(): string[] {
  return Prisma.dmmf.datamodel.models.map((m) => m.name);
}

/** Prisma delegate key for a model name (`KpiTarget` → `kpiTarget`). */
export function delegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}
