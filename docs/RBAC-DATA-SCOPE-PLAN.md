# RBAC data-scope generalization — plan and gate log

Two coarse permissions decide what rows anyone can read today: `VIEW_ALL_DATA`
and `VIEW_ASSIGNED_DATA`. This work generalizes that into per-tenant roles
carrying a **data-scope policy**, without changing the mechanism that enforces
it and without moving a single row for Odisha.

## Where enforcement actually lives

This is the fact the plan is built on, and it is worth stating plainly because
it is easy to assume otherwise:

| Layer | File | Enforces |
|---|---|---|
| Tenant isolation | `lib/prisma.ts` (the chokepoint) | `tenantId` on every query and write |
| **Data scope** | `lib/data-scope.ts` + `lib/data-access/scope-where.ts` | which rows *within* a tenant |

Data scope is **not** enforced at the chokepoint. It is a separate,
explicit-passing layer: a resolver produces a serialisable `DataScope`, twelve
per-model builders turn it into Prisma `where` fragments, and twenty-three call
sites pass it in by hand. The generalization happens **there**. The chokepoint is
not touched — pushing per-user row filtering into it would be a new mechanism,
and isolation is not something to experiment on.

## Model

- **Permissions** — a fixed, code-owned catalog (`lib/rbac/permission-catalog.ts`).
  Tenants re-bundle; they never invent. A new permission needs code that reads it.
- **Roles** — per-tenant data: `{ tenantId, code, name, permissions[],
  dataScopePolicy, parentRoleId?, isSystem }`. Enforcement checks permissions,
  never role names.
- **Data-scope policy** — `ALL | ASSIGNED | SAME_<dimension>`.
- **Dimensions** — a code-known catalog (`lib/rbac/scope-dimensions.ts`), each
  needing a field on **both** users and scoped rows.
- **Self-relative, set-based** — `SAME_ULB` means "rows whose ULB is in *my*
  ULB set", resolved from the user at request time. A role never stores which
  ULB it is about. Widening someone's reach is **adding a membership**, not
  inventing a special scope.
- **Union across roles** — most permissive wins. A user-level `deny` override
  still outranks everything, as it does today.

## Gate A — data model — DONE

Schema: `DataScopePolicy` enum; `Role.dataScopePolicy` (default `ASSIGNED`, the
narrow one), `Role.parentRoleId`, `Role.isSystem`; `Permission.group` and
`Permission.owningModule`; new `UserUlb` membership set.

`Role.code`/`Role.name` already are the key and display name, so no duplicate
columns were added for them.

**The resolver was not touched.** `lib/data-scope.ts` still reads the two
permissions, so no request can resolve differently than it did before this
change. The column records the fact; a later gate teaches the resolver to read it.

The migration carries a **data step**, not just DDL — a deployed database is
never re-seeded, and a role left at the default would silently narrow an
administrator:

- each role's policy derived from the view permission it already holds
  (`VIEW_ALL_DATA` → `ALL`, else `ASSIGNED`);
- product-shipped roles marked `isSystem`;
- one `user_ulbs` row per user from the existing `User.ulbId`, so today's single
  value becomes a one-element set. `User.ulbId` stays put as the home ULB.

Verified on both databases: ACS and FA → `ALL`; NODAL_OFFICER,
PROGRAMME_MANAGER, TASU, VERTICAL_HEAD → `ASSIGNED`. That matches what those
roles could see before, role for role, in both tenants.

Coverage: `tests/rbac-permission-catalog.test.ts` (the enum, the TS catalog and
the CJS seed array must agree — drift means a permission no row backs, which
denies everyone silently) and `tests/rbac-data-scope-policy.test.ts` (every
seeded role's policy equals its permission-derived scope, stated independently
of the seed's own function so the test cannot pass by tautology).

### Dimension readiness — the honest state

No dimension is usable yet, and the catalog says so per member rather than
pretending. Users carry ULB / organisation / section memberships; **scoped rows
carry almost nothing** — `Scheme` has `verticalName` as a plain string, and only
`ActionItem` has a real `verticalId`. `SAME_<dim>` needs both halves, so Gate B
adds the row side. A policy that cannot be resolved must be impossible to save —
never silently "everything" and never silently "nothing".

## Gate B — resolver and the vertical dimension — DONE

### Per-entity dimension map

| Entity | How it carries the vertical |
|---|---|
| `Scheme.verticalId` | **Directly** — new FK beside the existing `verticalName` text |
| `ActionItem.verticalId` | **Directly** — already existed; now fed from the scheme's relation |
| `Subscheme`, `FinanceBudget`, `FinanceBudgetSupplement`, `FinanceExpenditureSnapshot`, `KpiDefinition`, `KpiTarget`, `KpiMeasurement` | **Inherited via `schemeId`** |
| `DashboardMeeting` | No dimension — it has no scheme link at all |
| `User` | The *subject* side: `UserVertical` membership set |

Inheritance rather than duplication is deliberate: copying the vertical onto
seven more tables creates seven more things to keep in step, and `scope-where.ts`
already reaches them through the scheme.

### The write path, not just a backfill

A row created after this change carries its dimension natively:

- `app/api/v1/schemes/route.ts` — resolves and persists `verticalId` on create.
- `app/api/v1/schemes/[id]/route.ts` — re-resolves it when the name changes, so
  a rename cannot leave the FK pointing at the old vertical (a silent data-scope
  drift no screen would show).
- `app/api/v1/action-items/route.ts` — reads `scheme.verticalId` instead of
  re-deriving it by matching the scheme's display string against the vertical
  catalog, which yielded null on any spelling drift.
- `prisma/seed_dashboards.ts`, `prisma/seed_demo_tenant.js`,
  `tests/data-scope-vertical.test.ts` — seeded and fixture rows likewise.

### The backfill fails loud, and that is proven

The migration matches `verticalName` → `verticalId` **per tenant** (a global name
match could point a scheme at another tenant's vertical) and then aborts if any
scheme is left unmatched, naming the offending values and their tenant.

Verified by inserting a scheme with an unmatched vertical and running the guard:

```
ERROR: Cannot backfill schemes.verticalId: 1 scheme(s) name a vertical with no
matching row. Unmatched: No Such Vertical (tenant 00000000-…-0000000000d0).
Create the missing vertical(s) or correct the scheme name, then re-run.
```

This matters because local Odisha has **no schemes** to exercise the backfill
against — the guard is what protects a production run this container cannot
rehearse.

### Resolver

`DataScope` gains an optional `verticalIds`. Optional, not always-present: a
scope with no vertical policy is structurally identical to what the resolver
returned before, so legacy fragments cannot drift. An **empty** array is not the
same as absent — it means a vertical-scoped caller with no memberships, who
reaches nothing.

Union across roles takes the most permissive: `ALL` anywhere wins outright, and a
`SAME_VERTICAL` role grants reach on its own without also needing
`VIEW_ASSIGNED_DATA`. Memberships are read from the USER at request time, never
from the role — that is what makes widening someone's reach an act on the person,
not on everyone sharing their role.

### Coverage

`tests/data-scope-vertical.test.ts`, 11 assertions: self-relative resolution;
the **two-membership** user seeing both verticals; adding a membership widening
reach without touching the role; a meeting-level action item reached through its
own vertical; the union case; and **two cross-tenant** assertions — the chokepoint
refuses to record a membership pointing at another tenant's vertical, and a scope
forged with a foreign vertical id still returns nothing, because isolation does
not depend on the data-scope layer being correct.

### Odisha equivalence

No seeded role uses `SAME_VERTICAL`, so no request resolves differently. The
legacy shapes are asserted explicitly to produce the same fragments they always
did.

## Gates C–F

### The other three dimensions are still unready, deliberately

ULB, organisation and section have a user side (`UserUlb`, `UserOrganisation`,
`UserSection`) but **no defensible row side**, and none was invented. Each needs
a product answer first:

- **ULB** — schemes here are state-level; nothing in the model says a scheme,
  budget or KPI *belongs to* a ULB. A `Scheme.ulbId` would be an engineering
  decision standing in for a product one.
- **Organisation** — users hold memberships, but no row records which
  organisation owns it.
- **Section** — looks like an internal desk split rather than a data partition.

`lib/rbac/scope-dimensions.ts` records this per member with the specific blocker,
so a configurator can refuse the policy and say why, rather than saving a scope
that silently resolves to nothing.

## Gates C–F

C: config API behind `MANAGE_PERMISSIONS`, guardrails (entitlement ceiling,
no-lockout, `isSystem` protection), audit on every mutation, and an escalation
eval leg. D: widget framework. E: Command Centre on widgets. F: reconcile.
