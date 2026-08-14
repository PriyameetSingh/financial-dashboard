# Phase 3 — Entitlements Plan (Gate A)

> **What this is:** the design for the fourth layer of the access model. Phase 2
> established *tenant* (whose data exists) and left *RBAC + data-scope* (which rows
> this user sees) intact. Phase 3 inserts **entitlement** — which modules this
> organisation is provisioned for — between them.
>
> ```
> tenant  →  entitlement  →  RBAC  →  data-scope
> ```
>
> All four compose; none replaces another. Entitlement gates on a **flag**, never on
> tenant identity, and a non-entitled module **denies (404)** rather than merely
> hiding from the nav.
>
> **Companion docs:** `docs/PHASE2-TENANCY-PLAN.md` (the tenant chokepoint this
> builds on), `docs/TENANCY-BACKLOG.md` (extraction debt), `scripts/run-golden.mjs`
> (the regression harness that gates every change here).

---

## 1. The module registry (reconciled, operator-signed-off)

The catalog is **20 rows**, reconciled from the Notion `HUDD Product Ops › Modules`
database (23 rows). `MOD-EXP` folds into `MOD-RPT`, `MOD-TASK` folds into the core
shell, and `MOD-NFR` is excluded (it is a cross-cutting NFR bucket, not a UI module).

Every row carries an **enforcement class**, which is what makes the always-on core
list *data-backed and provable* instead of a magic string list in one file.

### 1a. Core — never gated (6)

Reachable for every tenant regardless of entitlement state. These are the routes
that must work for a tenant to log in, navigate, and be administered at all;
gating them would make a tenant unrecoverable.

| Code | Name | Why it is core |
|---|---|---|
| `MOD-AUTH` | Auth/SSO | Login, NextAuth callbacks, health. Gating it locks everyone out. |
| `MOD-SHELL` | Shell / UX | App shell, nav bootstrap (`/api/v1/rbac/me`), My Tasks. |
| `MOD-PROF` | Profile | A user's own profile and password change. |
| `MOD-RBAC` | RBAC | Users, roles, permissions, directory. The layer *below* entitlement. |
| `MOD-ADMIN` | Administration | Masters data, financial-year management, a tenant's own settings. |
| `MOD-CC` | Command Centre | `/dashboard` is the post-login landing page. |

### 1b. Gated — the enforced SKUs (9)

| Code | Name |
|---|---|
| `MOD-FIN` | Financial Progress |
| `MOD-SR` | Scheme Registry |
| `MOD-KPI` | KPIs |
| `MOD-MTG` | Meeting Organizer |
| `MOD-RPT` | Reports (absorbs Data Export) |
| `MOD-ACT` | Decision Tracker |
| `MOD-AI` | AI Insights |
| `MOD-NOTIF` | Notification Engine |
| `MOD-CHLOG` | Changelog |

### 1c. Roadmap — catalog rows only (5)

No route mapping, no enforcement, status-only. They exist so the catalog is the
single vocabulary for provisioning and the eventual menu-card UI, and so adding
their routes later is a mapping change rather than a schema change.

`MOD-ANOM` (Anomaly Detection) · `MOD-APR` (Approval Workflows) ·
`MOD-LAPSE` (Lapse Risk Alerts) · `MOD-SEC` (Security) · `MOD-OPS` (Operations)

---

## 2. Draft schema (additive only)

Two new tables and three new enums. No column is altered, no table is dropped, and
nothing existing becomes NOT NULL. The only edit to an existing model is a
back-relation field on `Tenant` (no column, no migration effect).

```prisma
/// Phase 3: enforcement class of a module. `core` is never gated (auth, shell,
/// profile, RBAC, admin, the landing dashboard); `gated` is checked against
/// TenantEntitlement on every request; `roadmap` is catalog-only — no routes map
/// to it and the guard never consults it.
enum ModuleEnforcement {
  core
  gated
  roadmap
}

/// Commercial tier — placeholder for the future menu-card pricing, mirroring the
/// Notion `Tier` property. Deliberately nullable and unused by the guard: a
/// module is enabled or not, and tier never affects the allow/deny decision.
enum ModuleTier {
  core
  standard
  premium
  addon
}

/// Lifecycle in the catalog, mirroring the Notion `Status` property.
enum ModuleStatus {
  active
  deprecated
  planned
}

/// Phase 3: the global module catalog. Tenant-INDEPENDENT, exactly like
/// `Permission`: a closed registry of product modules whose codes are referenced
/// literally in source (lib/entitlements/catalog.ts) and written only by
/// migration/seed. It is provisioning vocabulary, never tenant data, so it is
/// listed in GLOBAL_MODELS and is not auto-scoped by the chokepoint.
model Module {
  id          String            @id @default(uuid()) @db.Uuid
  code        String            @unique
  name        String
  enforcement ModuleEnforcement @default(gated)
  tier        ModuleTier?
  status      ModuleStatus      @default(active)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  entitlements TenantEntitlement[]

  @@map("modules")
}

/// Phase 3: which modules a tenant is provisioned for — what a tenant "has".
/// Tenant-scoped (carries `tenantId`), so the Phase 2 chokepoint auto-scopes every
/// application query against it with no registry change.
///
/// Absence of a row means NOT entitled (fail closed). The Phase 3 migration
/// backfills an explicit row per existing tenant per module so no tenant loses a
/// module on deploy; onboarding (a later phase) writes rows for new tenants.
model TenantEntitlement {
  id        String      @id @default(uuid()) @db.Uuid
  tenantId  String      @db.Uuid
  moduleId  String      @db.Uuid
  enabled   Boolean     @default(false)
  tier      ModuleTier?
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  module Module @relation(fields: [moduleId], references: [id], onDelete: Restrict)

  @@unique([tenantId, moduleId])
  @@index([tenantId])
  @@index([moduleId])
  @@map("tenant_entitlements")
}
```

Plus, on the existing `Tenant` model, one back-relation line:

```prisma
  entitlements                   TenantEntitlement[]
```

### 2a. Chokepoint classification (two registries must be updated together)

`TenantEntitlement` carries `tenantId`, so `buildRegistry()` in
`lib/tenant-scope-registry.ts` classifies it as tenant-scoped **automatically** —
nothing to add.

`Module` has no `tenantId`, so without action the chokepoint throws
*"Model Module is not classified for tenancy"* on first query. It must be added to
`GLOBAL_MODELS` in **both** places that hold that set — they are separate,
hand-maintained lists today:

- `lib/tenant-scope-registry.ts` (runtime chokepoint)
- `scripts/check-tenant-integrity.mjs` (the integrity sweep's own copy)

Justification to record in both: *closed registry of module codes referenced
literally in source; written only by migration/seed; the grants around it
(`TenantEntitlement`) are tenant-scoped.* This is verbatim the `Permission`
argument, which is the right precedent.

> **Expected golden output change:** `check-tenant-integrity` will report
> **47** tenant-scoped tables instead of 46 (gaining `tenant_entitlements`). That is
> a harness count, not a behaviour change — Odisha's rendered output is untouched.

---

## 3. Route → module map

### 3a. Where it lives, and why it is code and not data

The map is **static TypeScript** (`lib/entitlements/route-modules.ts`), not database
rows. Three reasons:

1. The exhaustiveness check must run at **build time with no database**, the same
   way `check-api-guards` and `check-tenant-chokepoint` do.
2. A route's module is a *product fact* about the codebase, not a per-tenant fact.
   Only the `enabled` flag is tenant data.
3. Drift between code and catalog is then a testable assertion (§6.2) rather than
   an unobservable mismatch.

### 3b. Matching rule — segment-aware longest prefix

A rule matches a pathname when it equals it or is a **segment-boundary** prefix of
it. Raw string prefixing would be wrong here and it is not hypothetical:

```
rule  /api/v1/financial          (MOD-FIN)
path  /api/v1/financial-years    (core reference read)
```

Naive `startsWith` would gate the core financial-years reference read behind
`MOD-FIN`. Segment-aware matching (`p === rule || p.startsWith(rule + "/")`) does
not. **Longest matching rule wins**, which is what lets `/admin` be core while
`/admin/agents` is `MOD-AI`.

The pathname is normalised before matching: `NEXTJS_BASE_PATH` (`/hudd-dashboard`)
is stripped, and a trailing slash is removed, so `/hudd-dashboard/api/v1/kpis` and
`/api/v1/kpis` resolve identically. `proxy.ts` already carries both forms in
`isApiPath`/`isV1ApiPath`, so this is consistent with existing behaviour.

### 3c. The map (all 119 route files)

**Core — 42 files, never gated**

| Rule | Files | Module |
|---|---|---|
| `/` (exact), `/login`, `/auth` | 3 | `MOD-AUTH` |
| `/api/auth`, `/api/health` | 3 | `MOD-AUTH` |
| `/profile`, `/api/v1/profile` | 2 | `MOD-PROF` |
| `/my-tasks`, `/api/v1/rbac/me` | 2 | `MOD-SHELL` |
| `/dashboard`, `/command-centre`, `/api/v1/dashboard/command-centre` | 3 | `MOD-CC` |
| `/admin/users`, `/admin/roles`, `/api/v1/admin/users`, `/api/v1/rbac`, `/api/v1/directory` | 13 | `MOD-RBAC` |
| `/admin`, `/api/v1/admin`, `/api/v1/financial-years` | 16 | `MOD-ADMIN` |

**Gated — 77 files**

| Rule(s) | Files | Module |
|---|---|---|
| `/financial`, `/api/v1/financial` | 15 | `MOD-FIN` |
| `/schemes`, `/admin/schemes`, `/admin/schemes-order`, `/api/v1/schemes`, `/api/v1/subschemes` | 11 | `MOD-SR` |
| `/kpis`, `/api/v1/kpis` | 12 | `MOD-KPI` |
| `/meetings`, `/api/v1/meetings`, `/api/v1/meeting-topics`, `/api/v1/meeting-materials` | 9 | `MOD-MTG` |
| `/reports`, `/api/v1/reports` | 8 | `MOD-RPT` |
| `/action-items`, `/api/v1/action-items` | 6 | `MOD-ACT` |
| `/admin/agents`, `/api/v1/admin/agent`, `/api/v1/assistant`, `/api/v1/dashboard/ai-alerts` | 6 | `MOD-AI` |
| `/admin/notifications`, `/api/v1/admin/notification-config`, `/api/v1/notifications` | 5 | `MOD-NOTIF` |
| `/changelog`, `/api/v1/releases` | 5 | `MOD-CHLOG` |

`42 + 77 = 119` — every `page.tsx` and `route.ts` in `app/` is accounted for, with
no residue. Note the four places where a more specific gated rule sits *inside* a
core prefix (`/admin/agents`, `/admin/notifications`, `/admin/schemes*`,
`/api/v1/dashboard/ai-alerts`); longest-prefix wins is what makes them work, and
each has a dedicated test.

### 3d. How an unmapped route fails the build

`scripts/check-route-module-map.mjs`, added as a **seventh golden leg**, walks
`app/` for every `page.tsx` / `route.ts`, converts each to its URL pathname
(stripping route groups and normalising `[param]` segments), and resolves it
through the same `resolveRouteModule()` the runtime guard uses. It fails, listing
offenders, when:

- a route resolves to `unmapped` — it is neither under a gated rule nor a core rule;
- a rule names a module code absent from `MODULE_CATALOG`;
- a rule names a `roadmap` or `core`-enforcement module in the **gated** table, or
  vice versa;
- a rule matches no route file at all (a stale rule left behind after a route was
  deleted).

The last two are what stop the map from rotting in the other direction. This
mirrors the Phase 2 DMMF exhaustiveness test: a new route cannot silently escape
entitlement, and a deleted route cannot leave a dangling rule.

**Belt and braces:** an unmapped route also fails *closed at runtime* (404), so
even if the check were bypassed, the failure direction is denial, never exposure.

---

## 4. Enforcement point and compose order

### 4a. One point: `proxy.ts`

The gate goes in `proxy.ts` (Next 16's middleware — renamed in 16, same
functionality; see `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`).

This is the only place that sees **both** page navigations and API calls with a
pathname, before any handler runs. It matters here because **the product's pages
are client components** (`"use client"` + `useRequireAuth()` + `fetch` to
`/api/v1/**`); there is no server-side page guard to hang a check on. Enforcing per
route handler would mean ~110 call sites and a permanent risk of a missed one —
precisely the failure mode the Phase 2 chokepoint exists to prevent.

> **The documented caveat, and why it does not apply.** Next's proxy guide warns
> against proxy as "a full session management or authorization solution".
> Entitlement is **not** user authorization — it is provisioning, a per-tenant
> product flag. The authoritative user-authorization layer remains the per-route
> `require*` guards, entirely unchanged and still running underneath. The proxy
> gate only ever *removes* access; it never grants any. This is the same posture
> Phase 2 already took for tenant-session binding at this layer.

### 4b. Compose order inside `proxy.ts`

```
1. static assets / public files                    ← unchanged, returns first
2. tenant slug → forward header (anti-spoof)       ← unchanged
3. session token verify (JWT signature)            ← unchanged
4. tenant-session binding verdict                  ← unchanged  (tenant resolved)
5. ENTITLEMENT GATE  ← NEW                                     (module resolved)
6. session-block reason (invalidated / unregistered)  ← unchanged
7. forward → route handler runs `require*` RBAC guards         (RBAC)
8. data-access applies DataScope                               (row visibility)
```

The gate sits at **5**: strictly after tenant + session resolution (it needs a
trustworthy `tenantId`), and strictly before RBAC (step 7, in the handler). Nothing
above it moves. `/login` and the other core routes never reach a denial because
they resolve to `core`.

### 4c. The decision function

```ts
// lib/entitlements/guard.ts  — pure, no I/O, directly testable
export type ModuleVerdict =
  | { kind: "core" }                          // never gated
  | { kind: "allowed"; module: string }       // gated, entitlement present + enabled
  | { kind: "denied";  module: string }       // gated, entitlement absent or disabled
  | { kind: "unmapped" };                     // fail closed → denied

export function moduleVerdict(
  pathname: string,
  enabledModules: ReadonlySet<string>,
): ModuleVerdict;
```

Keeping the decision pure (pathname + a set of codes in, verdict out) is what makes
every case in §6 assertable without a server, exactly like `verifyTenantSession`.

### 4d. Reading entitlements pre-scope

`proxy.ts` runs before any tenant scope exists, so the lookup uses `prismaUnscoped`
with an **explicit `tenantId`** — identical to the existing `getSessionBlockReason`
user lookup two lines above it. The read lives in `lib/entitlements/lookup.ts`,
which must be added to `UNSCOPED_ALLOWLIST` in
`scripts/check-tenant-chokepoint.mjs` with the justification *"resolves a tenant's
entitlements pre-scope; explicit tenantId in the where clause"* — the same
allowlist entry and same reasoning as `lib/tenant-resolve-db.ts`.

**No caching in Gate B.** The lookup is one indexed query on
`(tenantId)` returning ≤20 rows, alongside the two queries proxy already issues per
request. A TTL cache keyed by `tenantId` is the obvious optimisation, but it buys a
staleness window on a *security-relevant deny* and needs an invalidation hook from
the Gate C write path. Correctness first; the cache is a named follow-up, not
Gate B work.

### 4e. What a denial looks like

**Deny, do not hide** — a disabled module's routes are unreachable by direct URL,
not merely absent from the nav.

- **API paths** → `NextResponse.json({ detail: "Not Found" }, { status: 404 })`,
  matching the shape of the existing 401 responses in the same file.
- **Page paths** → a 404 response with a minimal, unbranded HTML body.

404 and not 403 is deliberate: 403 confirms the module exists and this tenant does
not pay for it. 404 leaks nothing about the product's shape.

> The plain HTML body is a Gate B placeholder. The app has **no `app/not-found.tsx`**
> today, and a branded 404 belongs to the later phase that owns the design system.
> Flagged so it is a known gap rather than an oversight.

### 4f. Nav derivation

`/api/v1/rbac/me` (core) gains an `enabledModules: string[]` field, and a pure
helper `visibleNavItems(items, enabledModules)` filters the existing `items` array
in `components/Sidebar.tsx` alongside the role filter already there.

> **Scope note:** this is the one component file Gate B touches. It adds no UI — it
> filters an existing array through a new pure function. Called out explicitly
> against the "backend only, no UI" rule; say the word and I will land the helper
> plus the API field and leave the `Sidebar.tsx` wiring for the UI phase.

---

## 5. Backfill plan

### 5a. Migration — `2026…_phase3_entitlements` (additive, null-safe)

1. `CREATE TYPE` for the three enums; `CREATE TABLE modules`, `tenant_entitlements`;
   indexes and the composite unique.
2. `INSERT` the 20 catalog rows into `modules` (idempotent `ON CONFLICT (code) DO
   UPDATE` on name/enforcement/tier/status).
3. `INSERT` a `tenant_entitlements` row for **every tenant that exists at migration
   time × every non-roadmap module, `enabled = true`** (`ON CONFLICT DO NOTHING`).

Step 3 is the behaviour-preserving guarantee, and it is written generically rather
than hardcoding Odisha's UUID: whoever exists when this deploys keeps everything
they had. On production that set is exactly Odisha (tenant #1). **No enforcement is
flipped until this backfill is verified** — the guard ships in the same commit but
every tenant is already all-on, so the observable behaviour is unchanged.

### 5b. Demo tenant — `prisma/seed_demo_tenant.js` (dev database only)

Rivertown gets **Standard + Finance Suite + AI on, Notifications deliberately OFF**:

| Enabled | Disabled |
|---|---|
| `MOD-FIN`, `MOD-SR`, `MOD-KPI`, `MOD-MTG`, `MOD-RPT`, `MOD-ACT`, `MOD-AI`, `MOD-CHLOG` | **`MOD-NOTIF`** |

This stays in the seed script and out of the migration, per the existing rule that
demo content must never reach production or the golden's test database. It gives
the enforcement demo a real disabled-module case: `/admin/notifications` and
`/api/v1/notifications/**` 404 by direct URL, and the nav item disappears.

### 5c. New tenants

Absence of a row = not entitled (fail closed). Onboarding — a later phase — is
responsible for writing rows. Until then a hand-created tenant is entitled to
nothing beyond core, which is the correct failure direction.

---

## 6. Test plan

New suite `tests/entitlements.test.ts`, plus the build-time leg. Every item below is
a distinct assertion, not a restatement.

**Exhaustiveness and drift**

1. **Route → module exhaustiveness** — every `page.tsx`/`route.ts` under `app/`
   resolves to `core` or a gated catalog module. An unmapped route fails.
   (`scripts/check-route-module-map.mjs`, golden leg 7, mirrored as a vitest case.)
2. **Catalog ↔ database parity** — every `MODULE_CATALOG` code exists in `modules`
   with matching `enforcement`, and no `modules` row is missing from the catalog.
3. **No stale rules** — every rule in the map matches at least one real route file.

**Enforcement**

4. **Module off → 404** — for each of the 9 gated modules, its page prefix *and* its
   API prefix both return a `denied` verdict when the module is disabled.
5. **Module on → reachable** — the same routes return `allowed` when enabled.
6. **Nested specificity** — with `MOD-ADMIN` core and `MOD-AI` off,
   `/admin` is allowed while `/admin/agents` is denied; same for
   `/api/v1/dashboard/command-centre` (core) vs `/api/v1/dashboard/ai-alerts` (gated).
7. **Segment-boundary matching** — with `MOD-FIN` off, `/api/v1/financial/summary`
   is denied but `/api/v1/financial-years` is still allowed.
8. **Core is ungateable** — with *every* entitlement row disabled, all 42 core routes
   still resolve to `core`. This is the "a tenant can never be locked out" proof.
9. **Unmapped path fails closed** — an invented pathname resolves to `unmapped` and
   is denied.

**Composition — the part that proves this is a fourth layer, not a replacement**

10. **RBAC still gates an entitled module** — with `MOD-KPI` enabled, a user without
    the KPI permission is still refused by `require*` (403). Entitlement opening a
    module does not open its permissions.
11. **Data-scope still applies underneath** — with `MOD-FIN` enabled, a restricted
    user's finance rows remain narrowed to their assignments.

**Isolation — no Phase 2 weakening**

12. **Entitlement changes are tenant-isolated** — disabling `MOD-FIN` for tenant B
    leaves tenant A's verdict unchanged, asserted in both directions (mirrors
    `tests/tenant-isolation.test.ts`).
13. **Odisha is all-on** — tenant #1 has an enabled row for every non-roadmap module,
    which is the standing guard on "the golden stays byte-identical".

**Regression**

14. **Golden green** — all seven legs, with Odisha rendering unchanged.

---

## 7. What this gate does *not* do

- No UI. No onboarding flow, no configurator, no menu cards, no admin console.
- No tier enforcement. `tier` is stored and never consulted by the guard.
- No change to `lib/data-scope.ts`, `lib/data-access/scope-where.ts`, the Prisma
  chokepoint's query logic, or session binding.
- No roadmap-module routes. Those five are catalog rows and nothing else.
