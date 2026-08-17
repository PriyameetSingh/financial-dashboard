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

## Gate B — resolver

Generalize `DataScope` in `lib/data-scope.ts`; teach the twelve `scope-where.ts`
builders the new variant; add the row-side dimension fields, including
`Scheme.verticalId` backfilled from `verticalName` (failing loudly on any
unmatched value rather than nulling it). `ALL` and `ASSIGNED` must compile to
byte-identical `where` fragments so Odisha cannot move. Resolver tests including
a two-membership user and a cross-tenant case.

## Gates C–F

C: config API behind `MANAGE_PERMISSIONS`, guardrails (entitlement ceiling,
no-lockout, `isSystem` protection), audit on every mutation, and an escalation
eval leg. D: widget framework. E: Command Centre on widgets. F: reconcile.
