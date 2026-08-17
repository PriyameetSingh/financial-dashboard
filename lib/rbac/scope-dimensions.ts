/**
 * The scope DIMENSION catalog — code-known, like the permission catalog.
 *
 * A `SAME_<dimension>` data-scope policy means: rows whose <dimension> is one of
 * the ones the LOGGED-IN USER belongs to. Both halves of that sentence have to
 * exist in the schema for the policy to mean anything:
 *
 *   userSide  — how the user's membership SET is read. A set, always: an officer
 *               covering three ULBs holds three memberships. Widening someone's
 *               reach is adding a membership, never pinning a value on a role.
 *   rowSide   — the field on scoped rows carrying the same dimension.
 *
 * `ready` records whether BOTH halves exist today. Only ULB, organisation and
 * section have a user side; NONE has a row side yet (Scheme carries
 * `verticalName` as a plain string, not an FK — see the Gate 0 findings), which
 * is why every dimension is currently unready and the resolver honours only
 * ALL and ASSIGNED.
 *
 * The point of writing this down now: a policy that cannot be resolved must be
 * impossible to save, not silently equivalent to "see nothing" — or worse,
 * silently equivalent to "see everything". Config validation asks this catalog.
 */

import type { DataScopePolicy } from "@prisma/client";

export type ScopeDimension = {
  /** The policy that selects this dimension. */
  policy: Extract<
    DataScopePolicy,
    "SAME_ULB" | "SAME_ORGANISATION" | "SAME_VERTICAL" | "SAME_SECTION"
  >;
  /** Human label, for a configurator. */
  label: string;
  /** How a user's membership set is read, or null when there is no user side. */
  userSide: { relation: string; foreignKey: string } | null;
  /** How a scoped row's value is read, or null when rows do not carry it yet. */
  rowSide: { field: string } | null;
  /** True only when both sides exist. A policy that is not ready cannot be saved. */
  ready: boolean;
  /** Why it is not ready, for the error a configurator shows. Null when ready. */
  blockedBy: string | null;
};

export const SCOPE_DIMENSIONS: readonly ScopeDimension[] = [
  {
    policy: "SAME_ULB",
    label: "Same ULB",
    userSide: { relation: "userUlbs", foreignKey: "ulbId" },
    rowSide: null,
    ready: false,
    blockedBy: "No scoped row carries a ULB yet; Scheme has no ulbId.",
  },
  {
    policy: "SAME_ORGANISATION",
    label: "Same organisation",
    userSide: { relation: "userOrganisations", foreignKey: "organisationId" },
    rowSide: null,
    ready: false,
    blockedBy: "No scoped row carries an organisation yet; Scheme has no organisationId.",
  },
  {
    policy: "SAME_VERTICAL",
    label: "Same vertical",
    // Verticals have no user membership table — a user's vertical is implied by
    // their section/organisation today. Gate B adds one alongside Scheme.verticalId.
    userSide: null,
    rowSide: null,
    ready: false,
    blockedBy:
      "Scheme.verticalName is a string, not a relation, and users have no vertical membership.",
  },
  {
    policy: "SAME_SECTION",
    label: "Same section",
    userSide: { relation: "userSections", foreignKey: "sectionId" },
    rowSide: null,
    ready: false,
    blockedBy: "No scoped row carries a section yet; Scheme has no sectionId.",
  },
];

export const DIMENSION_BY_POLICY: ReadonlyMap<string, ScopeDimension> = new Map(
  SCOPE_DIMENSIONS.map((d) => [d.policy, d]),
);

/** Policies the resolver can actually honour right now. */
export const RESOLVABLE_POLICIES: ReadonlySet<DataScopePolicy> = new Set<DataScopePolicy>([
  "ALL",
  "ASSIGNED",
  ...SCOPE_DIMENSIONS.filter((d) => d.ready).map((d) => d.policy),
]);

/**
 * Whether a policy can be enforced today.
 *
 * Deny-by-default in spirit: an unready `SAME_<dim>` is not "everything the user
 * can already see" and not "nothing" — it is a configuration that must be
 * refused at the point of saving, so no role ever holds a scope the resolver
 * would have to guess about.
 */
export function isResolvablePolicy(policy: DataScopePolicy): boolean {
  return RESOLVABLE_POLICIES.has(policy);
}
