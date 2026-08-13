# Phase 2 — Runtime Multi-Tenancy: Design & Migration Plan (Gate A)

Status: DRAFT for human review at Gate A. No schema or logic change accompanies
this document. The draft schema in §8 is illustrative; the real migration is
written at Gate B only after this plan is approved.

Scope recap: make tenancy real at runtime — `Tenant` + tenant config in the DB,
Odisha as tenant #1 (behavior byte-identical), request-scoped tenant
resolution, one provable query-scoping chokepoint, cross-tenant isolation
asserted in the permanent golden, and a fictional Demo tenant. Forward-only,
additive, no tenant-identity branching, composes with (never replaces) the
user-level data-scope layer.

---

## 1. Model classification — three buckets

Every model in `prisma/schema.prisma` (49 today) is classified below. Bucket
rules:

- **ROOT** — tenant-owned root: gets a direct `tenantId`, is the anchor of an
  ownership subtree.
- **CHILD** — owned via a parent relation, but **still gets a denormalized
  `tenantId` column** (decision and justification in §5). "Tenant path" shows
  the derivation chain used to reason about ownership (backfill itself is
  trivial in Phase 2 — see §6).
- **GLOBAL** — deliberately cross-tenant. The dangerous bucket; each entry has
  an explicit safety justification. Anything not classified is a **hard error**
  in the Gate D chokepoint (fail-closed, see §10).

### ROOT (16)

| Model | Notes |
|---|---|
| `User` | Tenant-owned user directory. See §2 for the platform-admin decision. |
| `Role` | Role vocabulary (ACS, Nodal, …) is tenant vocabulary; tenants define their own role sets. |
| `Vertical` | Org-hierarchy master. |
| `Section` | Org-hierarchy master. |
| `Organisation` | Org-hierarchy master. |
| `Designation` | Org-hierarchy master. |
| `Ulb` | Odisha-vocabulary master ("ULB" label itself is already a backlog literal); per-tenant rows. |
| `FinancialYear` | **Per-tenant fiscal calendars** — see §3. |
| `Scheme` | Primary domain root. |
| `DashboardMeeting` | Not scheme-scoped (see `meetingWhere` in `lib/data-access/scope-where.ts`); needs its own `tenantId`. |
| `ActionItem` | `schemeId`, `meetingId`, `verticalId` are all nullable — an action item can exist with no tenant-bearing parent, so it must be a root with direct `tenantId`. |
| `File` | Generic upload store; only optional link is `uploadedBy`. Direct `tenantId`. |
| `AuditLog` | Tenant-scoped (all writes happen inside tenant-resolved requests). A future platform-level event would need a platform actor model first; revisit then — not silently, via a schema change. |
| `AgentConfig` | Today a single global row; becomes one row per tenant (the agent runs over tenant data). Existing row backfills to Odisha. |
| `AgentInsight` | Agent output derived from tenant data. |
| `SystemNotificationConfig` | Quiet hours / toggles are per-tenant operational policy. `key` unique becomes `[tenantId, key]`. |

### CHILD (30) — tenant via parent, `tenantId` denormalized

| Model | Tenant path |
|---|---|
| `RolePermission` | via `Role` (`Permission` side is GLOBAL) |
| `UserRole` | via `User` (and `Role` — same tenant, integrity-checked) |
| `UserPermissionOverride` | via `User` |
| `UserSection` | via `User`/`Section` |
| `UserOrganisation` | via `User`/`Organisation` |
| `Subscheme` | via `Scheme` |
| `SchemeAssignment` | via `Scheme` |
| `SchemeWorkflowConfig` | via `Scheme` |
| `FinanceBudget` | via `Scheme`/`FinancialYear` |
| `FinanceBudgetRevision` | via `FinanceBudget` |
| `FinanceExpenditureSnapshot` | via `Scheme`/`FinancialYear` |
| `FinanceSummaryHead` | via `FinancialYear` |
| `FinanceBudgetSupplement` | via `Scheme`/`FinancialYear` |
| `FinanceYearBudgetAllocation` | via `FinancialYear` |
| `FinanceYearBudgetCategoryLine` | via `FinanceYearBudgetAllocation` |
| `KpiDefinition` | via `Scheme` |
| `KpiDefinitionPerformer` | via `KpiDefinition` |
| `KpiDefinitionReviewerUser` | via `KpiDefinition` |
| `KpiTarget` | via `KpiDefinition`/`FinancialYear` |
| `KpiMeasurement` | via `KpiTarget` |
| `MeetingTopic` | via `DashboardMeeting` |
| `MeetingMaterial` | via `DashboardMeeting` |
| `ActionItemPerformer` | via `ActionItem` |
| `ActionItemReviewerUser` | via `ActionItem` |
| `ActionItemUpdate` | via `ActionItem` |
| `ActionItemProof` | via `ActionItem`/`File` |
| `Notification` | via `User` |
| `NotificationDispatch` | via `Notification` |
| `UserNotificationPreference` | via `User` |
| `UserSeenRelease` | via `User` (`Release` side is GLOBAL) |

### GLOBAL (3 existing + 2 new infra) — each justified

| Model | Why cross-tenant is safe |
|---|---|
| `Permission` | A **closed registry of permission codes referenced literally in application source** (e.g. `VIEW_ALL_DATA` in `lib/data-scope.ts:87`, `ENTER_FINANCIAL_DATA` in `lib/data-scope.ts:142`). Rows are written only by `prisma/seed_roles.js`; the admin UI edits role↔permission **links** (`RolePermission`, tenant-scoped via `Role`), never permission rows. Contains zero tenant-authored data. Leak surface = the permission vocabulary, which ships in the client bundle anyway. The *grants* around it (`RolePermission`, `UserPermissionOverride`, `UserRole`) are all tenant-scoped, so no tenant's authorization state is visible to another. |
| `Release` | Vendor-authored product release metadata, synced from the repo's `releases.json` (`lib/release-sync.ts`). Describes the shared software, identical for every tenant; no tenant data. (Per-tenant changelog visibility, if ever wanted, is an entitlement flag — config, not identity.) |
| `ChangelogEntry` | Child of `Release`; same justification. Changelog copy is required to be plain-language product description (CLAUDE.md policy), never tenant data. |
| `Tenant` (new) | Platform infrastructure. No route lists tenants; a request can only reach its own resolved tenant's row via the resolver. Tenant administration is out of Phase 2 scope. |
| `TenantConfigEntry` (new) | Read path is exclusively "resolved tenant's rows" through the request-scoped resolver (§7); no cross-tenant read exists. Secret-class keys are barred from this table entirely (§4). |

`_prisma_migrations` and all Prisma enums are DDL/code vocabulary — global by
nature.

**Fail-closed rule:** the Gate D chokepoint holds two explicit sets
(TENANT_SCOPED, GLOBAL). A query against a model in neither set **throws**. A
permanent golden test iterates `Prisma.dmmf.datamodel.models` and fails if any
model is unclassified or double-classified — so a future model cannot silently
become global.

---

## 2. `User` and platform admins

**Decision: `User` is tenant-owned.** Every existing user is an Odisha user.
`email` uniqueness becomes per-tenant (`@@unique([tenantId, email])`), which is
required for tenants to onboard users independently.

**Platform/super-admin (Airawat operator) representation — decided
deliberately, not defaulted:**

- **NOT `tenantId = NULL`.** A nullable-tenant super-user would force the
  chokepoint, the `NOT NULL` migration, and every uniqueness rule to
  special-case null — exactly the uniformity we are buying with
  denormalization. Rejected.
- **Phase 2 posture:** there is no cross-tenant UI or API, so no cross-tenant
  principal exists yet. The Airawat operator exists (where needed) as a
  tenant-local admin user inside each tenant, exactly like today's
  `seedAdminEmail` bootstrap admin.
- **Future hook (documented, not built):** a separate
  `TenantMembership(userId, tenantId, role)` join table under a
  platform-level identity, added additively when a real cross-tenant console
  is commissioned. Nothing in Phase 2's design blocks it.

Auth flow consequences (built at Gate D, flagged now):

- `proxy.ts` (`getSessionBlockReason`) and the NextAuth sign-in path look up
  users by email/code **globally** today. Both must become tenant-scoped
  lookups (`{ tenantId, email }`) using the tenant resolved for that request.
- The JWT gains a `tenantId` claim at sign-in; every request cross-checks
  session-tenant vs host-resolved tenant and rejects mismatches (401). This
  closes the "log in on tenant A, replay cookie against tenant B" hole.

---

## 3. Reference tables — per-tenant, not global

Design intent: tenants are independent organizations with their own fiscal
calendars, org structures, and vocabularies. Therefore:

- **`FinancialYear` is tenant-scoped.** If it stayed global, tenants could not
  run different fiscal years (e.g. April–March vs calendar year), and one
  tenant creating "FY 2027" would appear in every tenant's pickers. `label`
  unique becomes `[tenantId, label]`. FY-selection logic ("current FY")
  automatically becomes per-tenant once queries are tenant-scoped.
- **All org-hierarchy masters are tenant-scoped:** `Vertical`, `Section`,
  `Organisation`, `Designation`, `Ulb`. Their current contents are Odisha's
  administrative vocabulary (departments, ULBs), which is tenant data, not
  platform data. `name`/`code` uniques become composite with `tenantId`.
- **`Role` is tenant-scoped** (role vocabulary), while **`Permission` stays
  global** (application capability registry) — the split keeps RBAC semantics:
  what a permission *means* is code; who *holds* it is tenant data.

---

## 4. Unique constraints and FK integrity

### 4a. Single-column uniques that MUST become composite `[tenantId, …]` (11)

| Model.field | Today | Becomes | Why |
|---|---|---|---|
| `User.code` | `@unique` | `@@unique([tenantId, code])` | employee codes collide across tenants (nullable stays nullable; Postgres treats NULLs as distinct — unchanged behavior) |
| `User.email` | `@unique` | `@@unique([tenantId, email])` | same person/email may exist in two tenants |
| `Role.code` | `@unique` | `@@unique([tenantId, code])` | every tenant will have `NODAL`, `ACS`-like codes |
| `Vertical.code` | `@unique` | `@@unique([tenantId, code])` | master data |
| `Section.name` | `@unique` | `@@unique([tenantId, name])` | master data |
| `Organisation.name` | `@unique` | `@@unique([tenantId, name])` | master data |
| `Designation.name` | `@unique` | `@@unique([tenantId, name])` | master data |
| `Ulb.name` | `@unique` | `@@unique([tenantId, name])` | master data |
| `FinancialYear.label` | `@unique` | `@@unique([tenantId, label])` | per-tenant fiscal calendars (§3) |
| `Scheme.code` | `@unique` | `@@unique([tenantId, code])` | scheme codes are tenant vocabulary |
| `SystemNotificationConfig.key` | `@unique` | `@@unique([tenantId, key])` | per-tenant operational policy |

Without these, second-tenant onboarding breaks on the first colliding scheme
code / email, or worse, uniqueness silently spans tenants.

### 4b. Uniques that stay as they are — verified tenant-safe

- Composite uniques already anchored to a tenant-scoped parent FK are
  automatically tenant-local: `Subscheme[schemeId,code]`,
  `SchemeWorkflowConfig[schemeId,workflowType]`,
  `FinanceBudget[schemeId,subschemeId,financialYearId]`,
  `FinanceSummaryHead[financialYearId,headCode,asOfDate]`,
  `KpiTarget[kpiDefinitionId,financialYearId]`,
  `UserPermissionOverride[userId,permissionId]`,
  `ActionItemProof[actionItemId,fileId]`,
  `FinanceYearBudgetAllocation.financialYearId`,
  `FinanceYearBudgetCategoryLine[allocationId,category]`,
  `NotificationDispatch[notificationId,channel]`,
  `UserNotificationPreference[userId,category,channel]`, and all composite
  PKs on join tables (`UserRole`, `RolePermission`, `UserSection`,
  `UserOrganisation`, `KpiDefinitionReviewerUser`, `ActionItemReviewerUser`,
  `UserSeenRelease`).
- `MeetingMaterial.storagePath` stays globally unique — it is a filesystem
  invariant (two tenants must never share a storage path), not tenant
  vocabulary. Verified at Gate D that generated paths embed per-meeting UUID
  directories.
- `Permission.code`, `Release.version` — GLOBAL bucket, stay global.
- `Tenant.slug` — new, globally unique by design.

### 4c. Cross-tenant FK prevention

Plain FKs reference by `id` and cannot express "and same tenant" without
composite FKs everywhere (`[tenantId, parentId] → [tenantId, id]`), which
would balloon the migration and every index. **Decision:** enforce in three
layers instead of composite FKs:

1. **Write path (chokepoint):** every create/update sets/filters `tenantId`
   from the request context; explicit cross-tenant `tenantId` in payloads is
   rejected (§10).
2. **DB backstop:** after Gate D, `tenantId` is `NOT NULL` everywhere — a
   nested create that bypasses the chokepoint fails loudly at the DB rather
   than silently inheriting nothing (§5, §10).
3. **Continuous audit:** a new `scripts/check-tenant-integrity.mjs` runs the
   full child-vs-parent `tenantId` equality sweep (every FK pair in §1's
   CHILD table) plus a zero-NULL check, wired into the golden at Gate D. Any
   cross-tenant row fails the build.

Composite FKs remain available as future hardening for the hottest tables if
ever warranted; nothing in this design precludes them.

---

## 5. Denormalize `tenantId` onto children — decision: YES, on all 46 tenant tables

Rationale (this is the reviewer-recommended trade and we take it):

- The Gate D chokepoint becomes **uniform**: every tenant-scoped model has a
  direct `tenantId` column, so scoping is always `WHERE tenantId = $current` —
  no per-model relation-path map, no divergent injection logic to audit.
- The uncovered-path set shrinks to the genuinely structural ones (§10):
  nested writes, raw SQL, cross-request caches — instead of also including
  "every child model reached through a join".
- `NOT NULL tenantId` on children turns "forgot to scope a nested create"
  from a silent leak into a hard DB error.
- Aggregates (`groupBy`, `aggregate`, `count`) over child tables can be scoped
  directly without joining parents.

Cost accepted: one column + one index on ~46 tables, and write paths must
carry `tenantId` (automated by the chokepoint; nested writes enumerated by
hand at Gate D). Backfill cost in Phase 2 is trivial (§6).

---

## 6. Migration & backfill sequence (all forward-only, additive)

**Everything ships as Prisma migrations** (not ad-hoc seed runs) so every
environment — golden throwaway DB, server test DB, dev, prod — converges via
`prisma migrate deploy` alone. This keeps the golden test DB **migrations-only**
(the FY-collision lesson from Gate 0: `prisma/seed.js` must never run against
it; the same applies to all future tenant seeds).

- **M1 — Gate B, `phase2_tenancy_additive`:**
  - `CREATE TABLE tenants`, `CREATE TABLE tenant_config_entries` (§8).
  - `ALTER TABLE … ADD COLUMN "tenantId" uuid NULL REFERENCES tenants(id) ON DELETE RESTRICT` on all 46 tenant tables (`RESTRICT`: deleting a tenant must never cascade-delete data by accident).
  - `CREATE INDEX … ON … ("tenantId")` per table.
  - No uniqueness change, no NOT NULL, no query change. Behavior identical.

- **M2 — Gate B, `phase2_odisha_backfill`** (data migration, idempotent SQL):
  - `INSERT INTO tenants` — Odisha, **fixed well-known UUID** (constant in
    `lib/tenant-config`), `slug = 'odisha'`, `status = active`,
    `ON CONFLICT DO NOTHING`.
  - `UPDATE <each of 46 tables> SET "tenantId" = :odisha WHERE "tenantId" IS NULL`.
    Because 100% of existing rows are Odisha's, no join-derivation is needed —
    this is the entire backfill. (Join paths in §1 are the *ownership*
    rationale and the integrity-audit spec, not the backfill mechanism.)
  - `INSERT INTO tenant_config_entries` — one row per stored `ODISHA_DEFAULTS`
    key (§7 lists which keys are DB-stored vs env/build-bound),
    `ON CONFLICT DO NOTHING`.
  - Gate B report includes per-table backfilled-row counts and a
    zero-NULL verification query per table.

- **M3 — Gate D, `phase2_tenancy_enforce`** (only after backfill verified and
  the chokepoint + isolation tests are green):
  - `ALTER TABLE … ALTER COLUMN "tenantId" SET NOT NULL` ×46.
  - Drop the 11 single-column uniques of §4a; create their composite
    replacements. (Done here, not at M1: while `tenantId` is nullable a
    composite unique would not constrain existing rows — NULLs are distinct —
    and dropping the single unique early would remove real protection.)

- **Gate E — Demo tenant: a seed script (`prisma/seed_demo_tenant.js`), NOT a
  migration.** Fictional demo data must never enter prod or the golden DB via
  `migrate deploy`. The golden's isolation tests self-seed and clean their
  own second tenant (`TESTSCOPE_`-style), keeping the test DB
  migrations-only.

---

## 7. Request-scoped tenant resolution (Rule 3)

### The carrier, precisely

Two request-scoped primitives, both backed by Next.js's own per-request
AsyncLocalStorage (the same machinery `auth()`, `headers()` and the existing
`getDbUserBySession = cache(…)` / `resolveDataScope = cache(…)` already rely
on — verified against the bundled Next 16 docs in `node_modules/next/dist/docs`):

1. **`headers()`** (`next/headers`) — read-only incoming headers, isolated per
   request by the framework.
2. **React `cache()`** — per-request memoization; two concurrent requests get
   independent cache cells by construction.

```
proxy.ts (runs first on every request)
  → derives tenant slug (subdomain match against tenants.slug;
     dev/env override; else unresolved-policy §7c)
  → STRIPS any client-supplied x-airawat-tenant header (anti-spoof)
  → sets internal header x-airawat-tenant: <slug> on the forwarded request

lib/tenant-context.ts (new)
  getTenantContext = cache(async () => {
    const slug = (await headers()).get("x-airawat-tenant") …
    const tenant = await prisma.tenant.findFirst({ where: { slug, status: "active" }})
    const config = overlay(ODISHA_DEFAULTS, await configEntries(tenant.id))
    return { tenantId, slug, config }   // immutable per-request value
  })
```

**Why this cannot bleed across concurrent requests:** there is no user-land
module-global holding "the current tenant". The only stores are (a) the
request's own header bag and (b) a `cache()` cell, both of which the framework
scopes to exactly one request via AsyncLocalStorage — interleaved awaits from
concurrent requests resolve against their own store. This is the identical
isolation contract the app already depends on for sessions (`auth()`) and
data-scope (`resolveDataScope`); tenancy rides the same rail rather than
inventing a new one. The Phase-1 `let cached` singleton in
`lib/tenant-config/index.ts` is **deleted** at Gate C.

### 7a. Sync access bridge (existing `tenantConfig()` call sites)

`formatCurrency()` etc. are called synchronously in dozens of server and
client components. Resolution is async (DB). Bridge, without a module global:

- **Server:** a request-scoped holder `const holder = cache(() => ({ cfg: null }))`
  is *primed* (`holder().cfg = resolved`) at the chokepoint entries that every
  request already passes: the root layout (all pages/RSC — layouts render
  before children) and the RBAC guard helpers in `lib/server-rbac.ts` /
  `lib/server-auth.ts` (all 81 API routes — coverage already proven by
  `check-api-guards`). Sync `tenantConfig()` then reads the holder; an
  unprimed read falls back to `ODISHA_DEFAULTS` (= today's behavior) and logs
  once — fallback direction is "default branding", never another tenant's
  data, because the holder is per-request and starts empty.
- **Client:** the root layout passes the resolved config into a
  `<TenantConfigProvider>` client component that seeds a client-module store.
  A browser runtime serves exactly one tenant per page load, so a module-level
  store is safe *there* (the Rule 3 hazard is server-side concurrency only).
- **Non-request contexts** (seeds, scripts, agent cron): explicit
  `withTenant(tenantId, fn)` / explicit-argument APIs — never ambient state.

### 7b. Config store: `tenantId`-keyed KV with a typed code registry

Recommended over a typed-columns table:

- The literal backlog (`docs/TENANCY-BACKLOG.md` §A–D) keeps draining new keys
  into config across future phases; a typed table costs a migration per key,
  a KV table costs none (additive-only policy preserved).
- Type safety stays where it already lives: the `TenantConfig` type. A code
  registry validates each key's shape on read, and **overlays DB rows onto
  `ODISHA_DEFAULTS`** so any missing key falls back to today's value.

Key mapping (one row per top-level `TenantConfig` key):

| Key | Stored in DB? | Note |
|---|---|---|
| `logoPublicPath`, `timezone`, `locale`, `currencySymbol`, `currencyUnit`, `pdfHeaderLine`, `productName`, `labels` (JSON object) | **Yes** | presentation config; Odisha rows written by M2 |
| `basePath` | **No — build-bound** | Next.js `basePath` is compiled into the build (`lib/next-base-path.ts`, `next.config.ts`); it cannot vary per request at runtime. Stays env/file. Documented platform-level key. |
| `keycloakRealm`, `keycloakClientId`, `seedAdminEmail` | **No — env-backed (Phase 2)** | single shared realm today; these move to per-tenant rows only when multi-realm auth is actually wired (future phase). See §7d. |

### 7c. Unresolved-request policy and the transition rule

- **While exactly one `active` tenant exists** (today: Odisha), an unresolved
  request defaults to that single tenant. This is computed from
  `tenants.status`, not from a hardcoded slug — no identity branching.
- **The moment a second tenant is `active`, unresolved ⇒ deny (404), not
  fall back.** Encoded in the resolver itself (active-count check), so the
  policy flips automatically at second-tenant activation rather than relying
  on an operator remembering a config change. A dev-only env override
  (`DEV_DEFAULT_TENANT_SLUG`) exists for local work and is ignored outside
  development. Gate E's "fresh visitor lands on Demo" convenience uses that
  dev override — production posture remains deny.

### 7d. Secret-class keys

`tenant_config_entries` is a broadly-readable table (any code path with the
resolver can read the resolved tenant's rows). Therefore:

- The code registry marks every key `storable` or `env-only`. The config
  write path **rejects** `env-only` keys; nothing secret-class can land in the
  table. `KEYCLOAK_CLIENT_SECRET` (and any future credential) stays in env /
  a secret manager; when multi-realm auth arrives, the table stores at most a
  **`secretRef`** (env var name / vault key), never the material.
- Of today's config keys, none are credentials (`keycloakRealm` and
  `keycloakClientId` are public identifiers; `seedAdminEmail` is contact
  data) — and they stay env-backed in Phase 2 regardless (§7b).

---

## 8. Draft schema (illustrative — real migration at Gate B)

```prisma
enum TenantStatus {
  active
  suspended
}

model Tenant {
  id        String       @id @default(uuid()) @db.Uuid
  slug      String       @unique
  name      String
  status    TenantStatus @default(active)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  configEntries TenantConfigEntry[]
  // + one back-relation per tenant-scoped model (users, roles, schemes, …)

  @@map("tenants")
}

model TenantConfigEntry {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid
  key       String
  value     Json
  updatedAt DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, key])
  @@map("tenant_config_entries")
}
```

Representative tenant-scoped model diff (pattern repeats on all 46):

```prisma
model Scheme {
  id       String  @id @default(uuid()) @db.Uuid
  tenantId String? @db.Uuid            // M1: nullable → M3: NOT NULL
  code     String                       // M1: keeps @unique → M3: composite
  // … existing fields unchanged …

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tenantId, code])            // M3 (replaces `code @unique`)
  @@index([tenantId])                   // M1
  @@map("schemes")
}
```

Odisha tenant row (M2): fixed UUID constant exported from
`lib/tenant-config` (e.g. `ODISHA_TENANT_ID`), `slug: "odisha"`,
`name: "Odisha"` — referenced by slug/id constant only in migrations, seeds,
and config files (lint-allowlisted locations), never branched on in logic.

---

## 9. Composition with data-scope (unchanged layer)

Order of narrowing for every domain read:

1. **Tenant chokepoint** (new): `tenantId = current` — which org's data exists.
2. **DataScope** (existing, untouched): `lib/data-scope.ts` +
   `lib/data-access/scope-where.ts` fragments — which of that org's rows this
   user may see.

They compose as independent `AND`s at different layers (extension vs. query
`where`), so neither can widen the other; `SchemeAssignment` lookups inside
`resolveDataScopeForUser` are themselves tenant-scoped by the chokepoint,
making a cross-tenant assignment row inert even if one existed. The golden's
existing data-scope tests continue to pass unmodified — that is itself a
regression assertion that tenancy did not replace RBAC scoping.

---

## 10. Gate D chokepoint — preview and uncovered-path inventory

(Design here for review; built at Gate D.)

**Mechanism:** a Prisma **Client Extension** (`$extends({ query: { $allModels:
{ $allOperations } } })`) on the singleton client — Prisma 6, `$use` is
deprecated. The extension resolves the tenant **per operation** by awaiting
the request-scoped context (§7) inside the async query callback — the tenant
id is never stored module-globally. Model classification is the fail-closed
two-set registry of §1.

Operation handling (all 46 scoped models):

| Operation class | Injection |
|---|---|
| `findMany` / `findFirst(OrThrow)` / `count` / `aggregate` / `groupBy` | `where := AND(tenantId, where)` |
| `findUnique(OrThrow)` | run, then post-check `result.tenantId === current` → null / NotFound (unique selectors can't carry extra predicates; rows never change tenant, so post-check is sound) |
| `create` / `createMany(AndReturn)` | inject `data.tenantId = current`; reject explicit foreign `tenantId`; **validate referenced parents** (below) |
| `update` / `delete` / `upsert` (unique selectors) | pre-flight `findFirst(selector AND tenantId)`; absent → NotFound before any mutation (rows never migrate tenants, so no TOCTOU) |
| `updateMany` / `deleteMany` | `where := AND(tenantId, where)` |

**Write-path parent validation (not just stamping):** stamping
`data.tenantId = current` alone would still let a create reference another
tenant's parent row by id (e.g. an `ActionItem` created under tenant A with a
tenant-B `schemeId`) — an integrity anomaly the CI sweep would only catch
after the fact, not prevent in prod. Therefore the extension carries a
`PARENT_FKS` registry (model → its tenant-scoped FK fields, taken from §1's
CHILD table plus the nullable FKs on `ActionItem`/`DashboardMeeting`). On
`create`/`createMany`/`upsert`-create/`update` that sets any such FK, the
extension validates each non-null referenced parent belongs to the current
tenant (one indexed PK lookup per FK) and rejects with NotFound otherwise.
This runs on the hot create paths; reads remain leak-safe independently via
the where-injection above.

**Interactive-transaction propagation — VERIFIED by spike (pre-Gate B):**
an extension installed via `$extends(query.$allModels.$allOperations)` fires
for every operation made through the `tx` client of an interactive
`$transaction(async (tx) => …)` on Prisma 6.19.3, and injected filters narrow
results inside the transaction (impossible-filter probe returned 0 rows in
tx while an unextended control tx returned the fixture row; callback log
showed `Scheme.findMany`, `Scheme.count`, `User.count` from within the tx).
Batch `$transaction([...])` equally covered. A permanent regression test
re-asserting this ships with Gate D.

**Physical file storage is tenant-namespaced:** uploads live under
`data/meeting-materials/` with DB-stored relative `storagePath`s (today
`{meetingId}/{randomId}-{fileName}`, `lib/local-file-storage.ts`). From the
point write paths become tenant-aware (Gate D chokepoint work), new uploads
gain a tenant prefix: `{tenantId}/{meetingId}/{randomId}-{fileName}` — the
read path needs no change since it resolves whatever relative `storagePath`
the row stores. Existing Odisha files stay at their legacy paths
(byte-identical behavior, no file moves; their rows are Odisha's after M2
backfill and unreachable cross-tenant via the scoped queries). Gate E's demo
tenant uploads prove the separation on disk. `storagePath` stays globally
unique — now structurally guaranteed by the tenant prefix for all new files.

**Enumerated paths the extension does NOT cover — each handled deliberately:**

| Path | Today's footprint | Handling |
|---|---|---|
| `$queryRaw` / `$executeRaw` | exactly 1 site: `lib/server-rbac.ts` permission-union query, keyed by `userId` | audit: `userId` is already tenant-resolved upstream; grant tables are tenant-scoped. Kept with a written justification comment. New raw SQL is barred by extending `check-tenancy-lint` (raw-query allowlist). |
| Nested writes (`data: { child: { create / connect / connectOrCreate / upsert } }`) | to be enumerated by grep at Gate D | nested ops bypass `$allOperations`. Three-layer handling: (1) grep-enumerate every nested-write site, hand-add `tenantId` to nested `create` payloads and verify `connect` targets are same-tenant-checked; (2) `NOT NULL` (M3) makes any missed nested create a hard DB error, not a silent leak; (3) integrity sweep (§4c) catches any cross-tenant `connect`. |
| `$transaction` | 52 files | batch and interactive transactions on the extended client run through the extension (verified by a dedicated Gate D test, not assumed). |
| Cross-request caches: `unstable_cache` in `lib/cached-financial-metadata.ts` | 1 module (+ `revalidateTag` tags) | **found in Gate A scan** — cache keys and tags become tenant-qualified (`tenantId` in key parts and tag names); revalidation stays per-tenant. Without this, one tenant's cached financial metadata would serve another tenant. |
| Module-level state: `lib/release-sync.ts` (`lastSyncTime` mtime guard) | 1 module | touches GLOBAL bucket only (`Release`/`ChangelogEntry`) — safe; documented. |
| Auth-path lookups before guard: `proxy.ts` `getSessionBlockReason`, NextAuth sign-in user lookup | 2 sites | become tenant-scoped lookups using the request's resolved tenant (§2); JWT carries `tenantId`, cross-checked per request. |
| Scripts / seeds / cron (`agent-runner`, backfill, `seed*.js`) | run outside request scope | use an explicitly-named unscoped export (`prismaUnscoped`) plus explicit `tenantId` arguments. A new lint (same family as `check-api-guards`) fails the build if `prismaUnscoped` is imported outside an allowlist (`scripts/`, `prisma/`, migration tooling). App code cannot reach an unscoped client. |

---

## 11. Isolation test design (Gate D — permanent golden additions)

Seeded fixture: a second tenant (`TESTTENANT_B`, fictional names) with its own
users, roles, schemes, FY, budgets/snapshots, KPI defs, meeting, action items —
self-seeded and self-cleaned by the test file (golden DB stays
migrations-only).

Assertions run **in both directions** — every check executes once under
tenant-A context and once under tenant-B context, symmetrically — and they go
**through the real production path**: a `withTenant` test helper establishes
the same request-scoped context the app uses (the resolver's store, not a
test-only substitute) and all queries run through the extension-scoped
client. No test may pass a hand-written `where: { tenantId }` bypass — that
would prove the filter works, not that the chokepoint applies it.

1. **Surface sweeps** — the five named surfaces return only own-tenant rows,
   asserted A→A/B-invisible AND B→B/A-invisible for each surface:
   schemes list, financial summary (command-centre totals), KPI definitions,
   command centre dashboard, report builders (meeting/pendance data
   functions). Assert counts AND that no returned id belongs to the other
   tenant's fixture set.
2. **Direct-id probes** — `findUnique`/GET-by-id for every fixture row of the
   *other* tenant returns null/404 (covers the post-check path).
3. **Write probes** — create under A lands with `tenantId = A` even when the
   payload claims B; update/delete of B's row ids from A's context is
   NotFound; `updateMany`/`deleteMany` with a crafted broad `where` touches 0
   cross-tenant rows.
4. **Operation-class coverage** — one test per row of the §10 table
   (`groupBy`, `aggregate`, `count`, `upsert`, `createMany`, interactive
   `$transaction`) against tenant-mixed fixtures.
5. **Config round-trip** (from Gate C, kept permanently) — Odisha config
   resolved from the DB renders byte-identically to `ODISHA_DEFAULTS`
   (currency string, locale number, PDF header, labels — the existing golden
   pins).
6. **Registry exhaustiveness** — every DMMF model classified exactly once
   (§1); `check-tenant-integrity.mjs` sweep green.
7. **Existing suites unmodified** — data-scope and core-surface tests keep
   passing as-is (tenancy composes, §9).

---

## 12. Gate map (execution order after this plan is approved)

| Gate | Ships | Golden state |
|---|---|---|
| B | M1 + M2 migrations; per-table backfill counts | green, byte-identical (no query/logic change) |
| C | resolver (`proxy.ts` slug → header; `lib/tenant-context.ts`), DB-backed `tenantConfig()` via §7a bridge, singleton deleted, config round-trip assertion added | green, output identical |
| D | Prisma extension chokepoint + uncovered-path handling (incl. tenant-keyed `unstable_cache`, tenant-scoped auth lookups, `prismaUnscoped` lint), isolation tests, integrity script, then M3 (NOT NULL + composite uniques) | green + new permanent isolation assertions |
| E | `seed_demo_tenant.js` (fictional "Rivertown Development Authority" data), Demo resolvable via slug/dev override | green; Odisha byte-identical; Demo renders distinct branding/data |

---

## 13. Gate D — as built (deltas from the design above)

The chokepoint shipped as designed (Prisma Client Extension on `$allModels /
$allOperations`, model classification derived from the schema, request-scoped
tenant read per operation). Five things differ from, or go beyond, §10 and are
recorded here so the design doc matches the code.

1. **Nested relation writes ARE covered, not just backstopped.** The design
   assumed nested writes (`data: { performers: { create: [...] } }`) could only
   be handled by hand-enumeration plus the `NOT NULL` backstop. Instead the
   extension now walks create payloads using a schema-derived
   `RELATION_TARGETS` map and stamps the tenant on nested `create`,
   `createMany.data` and `connectOrCreate.create` for every relation whose
   target model is tenant-scoped. Application code contains **zero** relation-
   nested writes today (verified by grep across `app/`, `lib/`, `src/`); the
   gap was found by the `NOT NULL` migration failing a nested write in the test
   fixtures — i.e. the backstop worked, and the walk now closes the hole for
   future code.

2. **`tenantId` is `NOT NULL` in the database but optional in the Prisma create
   input**, via `@default(dbgenerated("(current_setting('app.tenant_id', true))::uuid"))`.
   The GUC is never set, so the default evaluates to NULL and the `NOT NULL`
   constraint rejects any write that reaches the database without a stamped
   tenant. This keeps the DB guarantee while avoiding ~40 hand edits to route
   payloads, which Rule 5 exists to prevent. The chokepoint always supplies the
   value explicitly; the default is a type-level affordance, not a data path.

   **Standing hazard, recorded deliberately (and repeated as a comment at the
   top of `prisma/schema.prisma`):** this default is safe *only while nothing
   sets `app.tenant_id`*. If a future change sets that session variable — a
   Postgres **Row-Level Security** rollout is the obvious candidate, since RLS
   conventionally binds exactly this kind of GUC — the default stops evaluating
   to NULL and becomes a **silent-stamp path**: a write that bypasses the
   chokepoint would then succeed quietly, taking whatever tenant the pooled
   connection last had set, instead of failing loudly. Anyone introducing RLS
   (or any other session-variable binding) must, in the same migration, either
   drop these column defaults and leave the chokepoint as the only writer, or
   bind the GUC per transaction and promote it to the authoritative tenant
   source. The two mechanisms must never be half-live together.

3. **Session-layer tenant binding (`lib/tenant-session.ts`).** The JWT carries a
   `tenantId` claim stamped at sign-in, and both the middleware and the server
   guard funnel (`getSessionUser`) compare it against the tenant resolved from
   the Host. A mismatch is rejected (401 / forced re-login with cookies
   cleared) — never re-scoped into the host's tenant, which is the silent
   cross-tenant path. Tokens with no claim (pre-Phase-2) and hosts that resolve
   to no tenant are also rejected. This is the one path the query chokepoint
   cannot see: without it, a replayed session is a fully authenticated
   principal and the chokepoint would faithfully scope it into the wrong
   tenant. Asserted end-to-end against the real `proxy()` in
   `tests/tenant-session-isolation.test.ts` (10 assertions, both directions,
   including a spoofed tenant header).

4. **By-unique lookups on the 11 newly-composite fields became `findFirst`.**
   `findUnique({ where: { code } })` no longer compiles once `code` is unique
   per tenant. 27 such call sites became `findFirst`, which the chokepoint
   scopes — semantics are unchanged (the field is still unique *within* the
   tenant). The operations that genuinely require a unique selector
   (`update`/`upsert`/`delete`) use `lib/tenant-unique.ts`, whose helpers build
   the composite key from the current scope so a call site cannot pass the
   wrong tenant.

5. **Seeds and scripts became explicitly tenant-addressed.** TS seeds enter an
   explicit scope (`enterTenantScope`, default Odisha, `SEED_TENANT_ID`
   override) and write through the same chokepoint; the JS seeds
   (`prisma/seed.js`, `prisma/seed_roles_core.cjs`) stamp `TENANT_ID` directly.
   `scripts/check-tenant-chokepoint.mjs` fails the build if `prismaUnscoped` or
   raw SQL appears outside the recorded allowlist.

6. **Physical storage namespacing landed here, not at Gate B/E.** New meeting
   material uploads are written to `{tenantId}/{meetingId}/{uuid}-{name}`.
   Reads are unchanged (they resolve whatever relative `storagePath` the row
   holds), so existing Odisha files keep working at their legacy paths.

Two permanent CI legs were added to the golden: `check-tenant-chokepoint`
(static: no unscoped-client/raw-SQL escapes) and `check-tenant-integrity`
(data: zero NULL tenantIds, zero cross-tenant FK references, both derived from
the schema rather than a hand-kept table list).
