# Capability Registry — Gap-Closing Plan

> **Read `docs/PHASE3-ENTITLEMENTS-PLAN.md` and `lib/menu-card/capabilities.ts` first.**
> This is not a Phase 1 green-field build. A capability/module registry
> (`lib/entitlements/catalog.ts` + `lib/menu-card/capabilities.ts`), a route/nav
> gate (`proxy.ts` + `lib/entitlements/guard.ts`), and a tenant-admin configurator
> (`app/admin/menu-card/`) already exist, are merged, and are covered by CI. This
> plan closes the specific gaps against the target design named in the task, not
> a rebuild. See the investigation report (chat) for the full audit this plan is
> based on.
>
> **STOP CONDITION:** do not start any step below until the three judgment calls
> in §0 are resolved by the human reviewer. Steps 2, 4, and 5 depend on the
> answers.

---

## 0. Judgment calls requiring sign-off before work starts

### 0a. Tier vocabulary conflict

The task's target design names tiers `core/intelligence/automation/enterprise`.
The codebase has `core/standard/premium/addon` as a live Prisma enum
(`ModuleTier`, `prisma/schema.prisma:1425-1432`), stamped on `Tenant.planTier`
for real tenants, read by the onboarding wizard's `CodeGate`/`StepModules`, and
named in public pricing copy (`lib/platform/landing.ts`).

**This is not a rename.** Changing the vocabulary means either a data migration
(remap every `Tenant.planTier` and `TenantEntitlement.tier` value) or introducing
a second, parallel vocabulary that the existing one would need to map onto —
both are judgment calls with commercial-copy and onboarding-UX consequences, not
mechanical edits.

**Recommendation:** keep `core/standard/premium/addon` as canonical (it's live,
tested, and has real UX copy built against it). Treat the task's
`core/intelligence/automation/enterprise` as superseded — it likely predates
Phase 3 shipping. Needs explicit confirmation before any schema touch.

### 0b. Granularity — the merges were already decided; the vocabulary that named them wasn't

The task asks whether the ~30-item menu card needs coarsening before it's
load-bearing, and asks for specific proposed merges.

That decision **already happened and shipped**, documented verbatim in
`lib/menu-card/capabilities.ts:14-19`:

- `MOD-TASK` (My Tasks) folds into `MOD-SHELL` (core) — "it aggregates over
  whatever else is enabled."
- `MOD-EXP` (Data Export) folds into `MOD-RPT` (Reports) — "an export is a
  report format, not a separate purchase."
- `MOD-NFR` is excluded entirely — cross-cutting requirements, not a UI module.

This reconciled 14 design groups down to 12 catalog-backed groups, sitting under
20 total catalog modules (6 core + 9 gated + 5 roadmap).

**The actual open question is not "should we merge" — it's "which of three
existing reconciliations is authoritative,"** because this repo has three,
and they don't share a row count:

| Artifact | Count | Feeds |
|---|---|---|
| Notion "Capability Registry" DB | 65 rows | `docs/PRODUCTIZATION-PLAN.md` config-key sweep |
| Notion "Modules" DB | 23 rows → reconciled to 20 | `lib/entitlements/catalog.ts` `MODULE_CATALOG` |
| Menu Card design (`design-reference/Menu Card.dc.html`) | 14 groups → reconciled to 12 | `lib/menu-card/capabilities.ts` |

The task's "~30 items" matches none of these exactly. **Needs the human
reviewer to name which of the three is the Phase 1 source of truth** before
any registry consolidation work starts — otherwise step 1 below will silently
pick one and create a fourth reconciliation.

### 0c. VMS pattern conflict: file+CLI vs DB-only

VMS's `tenant.yaml` is a git-tracked file, validated and applied by a CLI
(`validate`/`apply`/`diff`/`activate`), with `--dry-run` writing nothing and
`diff` detecting drift between file-intent and applied state.

HUDD has **no file, no CLI**. Config and entitlements are both pure
database + web admin API (`TenantConfigEntry` + `TenantEntitlement`, written by
`POST /api/v1/admin/system-config` and `PUT /api/v1/admin/entitlements`
respectively). This was a deliberate divergence at Phase 3 Gate C, not an
oversight — but it means the task's literal instruction ("tenant.yaml gets a
`capabilities: [...]` array") has no file to add the array to.

**Recommendation:** treat `TenantEntitlement` rows as the DB-native equivalent
of the yaml's `capabilities:` array, and do not introduce a parallel yaml file
— a second source of truth for the same fact (module on/off) is exactly the
hazard the "single write path" principle exists to prevent. If a git-reviewable,
diffable representation is wanted for audit/compliance reasons, the right shape
is a **read-only exporter** (`tenant-config show --format=yaml`-style, dumping
current DB state) rather than a write path — needs confirmation this satisfies
the original data-sovereignty/audit intent behind the VMS-pattern instruction.

---

## 1. Work items, in blocking order

Each step names the files it touches and how it is verified. All verification
commands are the actual repo scripts — run them and paste raw output, not a
self-reported "done."

### Step 1 — Reconcile capability status drift (no design decision needed; do first, independent of §0)

- Fix `MTG-05` in `lib/menu-card/capabilities.ts` (currently `status: "live"`,
  but `docs/audit/hudd-v1-verification.md` found no `closedAt`/`status` field
  and no enforcement — `NOT-FOUND`). Change to `"plan"` or `"dev"` per
  reviewer call on whether it's scheduled.
- Add a golden-leg assertion (extend `tests/menu-card.test.ts`) that fails if a
  capability's `status` disagrees with a maintained ground-truth list — even a
  hand-maintained one is better than none, since this drift was found only by
  a one-off manual audit.

**Verify:**
```bash
npx vitest run tests/menu-card.test.ts
```

### Step 2 — Job-scheduler gating (blocks nothing else; do independently, but needs §0a/0b resolved if new module codes are involved)

- Add an entitlement check to `lib/agent-runner.ts` (the `MOD-AI` progress
  agent) and the notification dispatch path (`lib/services/NotificationService.ts`,
  `MOD-NOTIF`) — both currently run with zero entitlement awareness.
- Reuse `loadEnabledModuleCodes(tenantId)` from `lib/entitlements/lookup.ts`;
  do not write a second lookup.
- Add a case to `tests/entitlements.test.ts` (extends the existing "module
  off → 404" table, item 4 in `docs/PHASE3-ENTITLEMENTS-PLAN.md` §6) for
  "module off → job does not run / does not dispatch."

**Verify:**
```bash
npx vitest run tests/entitlements.test.ts
node scripts/run-golden.mjs
```

### Step 3 — `dependsOn` (needs §0b resolved: which source's item boundaries to declare dependencies over)

- Add `dependsOn?: string[]` to `ModuleDef` in `lib/entitlements/catalog.ts`.
- Populate only where a real functional dependency exists (e.g. `MOD-AI`
  reads finance/KPI/action-item data — does it *require* `MOD-FIN`/`MOD-KPI`
  to be enabled, or degrade gracefully? Check `lib/assistant-query.ts` before
  asserting a hard dependency — do not invent edges that aren't load-bearing).
- Add `scripts/check-capability-deps.mjs`: fails the build if a module's
  `dependsOn` names an unknown code, or if `resolveGrants()` could enable a
  module while silently leaving a hard dependency off. Wire it in as golden
  leg 10 in `scripts/run-golden.mjs`.

**Verify:**
```bash
node scripts/check-capability-deps.mjs
node scripts/run-golden.mjs
```

### Step 4 — Consolidate into a single registry file (needs §0a + §0b resolved)

- Create `lib/capabilities/registry.ts` that **re-exports and composes**
  `MODULE_CATALOG` (catalog.ts) + `CAPABILITY_GROUPS` (menu-card/capabilities.ts)
  + the relevant slice of `ROUTE_MODULE_RULES` (route-modules.ts) into one
  `provides` shape per module: `{ id, tier, status, name, dependsOn, provides: { routes, navItems, dbModels, jobs, permissions } }`.
  - **Do not duplicate the underlying data.** `catalog.ts`, `route-modules.ts`,
    and `capabilities.ts` stay the sources of truth (each has a reason to be
    separate, documented in their own headers — framework-freedom for the
    catalog, build-time-no-DB for the route map). `registry.ts` is a composed
    view, not a fourth copy — this avoids recreating the exact drift problem
    Step 1 just fixed.
  - `dbModels`: derive from a new small map (module code → Prisma model names),
    hand-written once, checked by a golden leg that every tenant-scoped model
    in the Prisma DMMF is claimed by exactly one module or explicitly marked
    shared (mirrors the Phase 2 DMMF-exhaustiveness pattern already used for
    tenant scoping).
  - `jobs`: derive from Step 2's entitlement checks — the module code the job
    checks against *is* its job ownership declaration.
  - `permissions`: list as "permissions this module's routes require," sourced
    from existing `requirePermission*` calls per route — **do not** make this
    an enforcement relationship; RBAC and entitlement stay composed, not merged
    (per the `tenant → entitlement → RBAC → data-scope` model in
    `docs/PHASE3-ENTITLEMENTS-PLAN.md`).
- Update imports in `app/admin/menu-card/`, `app/onboarding/steps/StepModules.tsx`,
  and `app/api/v1/admin/entitlements/route.ts` to read from `lib/capabilities/registry.ts`
  where it doesn't change behavior; leave `guard.ts`/`route-modules.ts` importing
  `catalog.ts` directly (the pure-decision path should not gain a heavier import).

**Verify:**
```bash
npx tsc --noEmit
npx vitest run
node scripts/run-golden.mjs
```

### Step 5 — `tenant.yaml`-equivalent surfacing (needs §0c resolved)

- If the reviewer confirms the read-only-exporter direction (§0c
  recommendation): add `tenant-config show --format=yaml` to a new
  `scripts/tenant-config.ts`, dumping `TenantConfigEntry` + `TenantEntitlement`
  state for a given tenant, including a `capabilities:` block shaped like the
  task's target. **No apply/write path** — the DB + admin API stays the single
  write path, unchanged.
- If the reviewer instead wants a real file+CLI write path (reversing the
  Phase 3 Gate C decision): this is a materially larger change (new CLI,
  new validate/apply/diff commands, a decision on how a file-based apply
  reconciles with the live web admin API without creating two write paths)
  and should be scoped as its own gate, not folded into this plan.

**Verify (read-only-exporter path):**
```bash
npx tsx scripts/tenant-config.ts show --tenant=odisha --format=yaml
```

---

## 2. What this plan deliberately does not touch

- Phase 2 tenancy (chokepoint, session binding, isolation tests) — complete,
  out of scope, do not re-touch.
- The RBAC permission catalog — composes with entitlement, not merged into it
  (see Step 4 note on `permissions`).
- `TenantConfigEntry` / branding config — separate mechanism from module
  entitlement; not part of the Capability Registry gap.
- Any new commercial tier work beyond §0a's naming decision — pricing/plan
  design is a business decision, not a code gap.

---

# Phase 2 — Config Schema & Single Write Path — Gap-Closing Plan

> **Read `lib/tenant-config/registry.ts`, `lib/tenant-config/store.ts`, and
> `app/api/v1/admin/tenant-config/route.ts` first.**
> This is, again, not a green-field build. A typed key registry with
> value-level validation, a single sanctioned DB-access module, and a
> CI-enforced access check already exist and are merged. This plan closes the
> one gap verified missing — audit logging — plus a second gap the audit
> UI check in §2a surfaced, in a codebase that already made a locked decision
> (Phase 1 §0c) against a file+CLI pattern.
>
> **STATUS: CLOSED 2026-09-08** (§3). §0's audit and §2's two decisions were
> locked by the human reviewer before work started; nothing below was
> reopened. Full `node scripts/run-golden.mjs` ran end to end after fixing
> three unrelated, pre-existing environment gaps (stale DB env files, a
> missing demo-tenant seed, an uninstalled dependency) — 11 of 12 legs green,
> the 12th (`check-a11y`) blocked on a root-owned missing browser binary and
> human-confirmed out of scope. See §3's Verification subsection for the full
> trail.

## 0. Current-state audit (verified by direct grep/read, not assumption)

**Value-level validation — already built, not a gap.**
`lib/tenant-config/registry.ts` (`validateConfigValue`, `configKeyClass`,
`assertStorableKey`) does exactly what the task brief asked whether Phase 2
needed to add: type checking (`typeof value !== "string"`), range/length
checking (locale/timezone/currency/prefix/label lengths), required-ness
(non-empty), and format validation (`Intl.getCanonicalLocales` for locale,
`Intl.DateTimeFormat` for timezone, a path/URL check for `logoPublicPath`, an
allowlist-and-reject sanitizer for `themeOverrides` and `labels`). It is
wired into the only write path (`app/api/v1/admin/tenant-config/route.ts:108`)
and into onboarding provisioning (`lib/onboarding/provision.ts:139`,144) —
confirmed by grep, not inference:

```
$ grep -rn "validateConfigValue(" --include="*.ts" . | grep -v node_modules | grep -v .next | grep -v tests/
app/api/v1/admin/tenant-config/route.ts:108:    const reason = validateConfigValue(key, body.value);
lib/onboarding/provision.ts:139:      const error = validateConfigValue(key, value);
lib/onboarding/provision.ts:143:      const error = validateConfigValue("llmApiKey", input.llmApiKey);
```

There is no `config-schema.yaml` file and no `lib/tenant/config-schema.ts` —
those are `docs/PRODUCTIZATION-PLAN.md`'s aspirational VMS-mirroring design,
never implemented here (grep for `vms-config-lib`, `config-schema.yaml`
outside that one doc returns nothing). The schema exists as TypeScript
(`StorableKey` union + inline `switch` in `validateConfigValue`), not as a
declarative, independently-generatable artifact.

**Single write path — already enforced, with one documented exception.**
`lib/tenant-config/store.ts` is the sole module allowed to touch
`prisma.tenantConfigEntry` for reads/writes/clears — enforced not just by
convention but by a CI script:

```
$ node scripts/check-tenant-chokepoint.mjs
check-tenant-chokepoint: ok (no unscoped-client, raw-SQL, or unscoped tenant-config escapes outside the allowlist)
```

`scripts/check-tenant-chokepoint.mjs`'s `CONFIG_ENTRY_ALLOWLIST` permits
exactly two non-test/non-script files to reference `tenantConfigEntry`
directly: `lib/tenant-config/store.ts` (the accessor) and
`lib/onboarding/provision.ts` (writes the new tenant's first config rows
inside the same DB transaction that creates the tenant — `store.ts`'s
functions use the tenant-scoped client, which has no scope to use yet).
This second write site is a deliberate, documented, CI-checked exception, not
an oversight — closer to Phase 2 (tenancy)'s `prismaUnscoped` allowlist
pattern than to the NotificationService gap found in Phase 1. It still runs
every value through `validateConfigValue` before writing
(`lib/onboarding/provision.ts:139`), so nothing it writes could fail the
admin API's later validation of the same key.

**Config and entitlements export — already unified, not diverged.**
`app/api/v1/admin/entitlements/export/route.ts` → `lib/entitlements/export.ts`
`buildTenantExportPayload()` produces ONE YAML payload
(`{schemaVersion, tenant, capabilities, config}`) covering both
`TenantEntitlement` and `TenantConfigEntry` state — there was never a second,
config-only export to reconcile against. Its header comment records the
locked decision this plan's §0c made: read-only, no `apply`/`validate`
counterpart, "nothing ever reads it back in." Secret-class keys
(`llmApiKey`) are excluded even as presence — only `isSet` surfaces, and not
even that in the export.

**Drift detection — genuinely does not exist anywhere.**
`grep -rn -i "drift" --include="*.ts"` across the repo returns only comments
*warning about* drift risk (catalog/route-map consistency, marketing-copy
staleness) and the export module's docstring explicitly declining to build a
read-back/diff mechanism. No function compares live `TenantConfigEntry` rows
against any prior snapshot, `ODISHA_DEFAULTS`, or a git-committed export.
The closest primitive that exists is `GET /api/v1/admin/tenant-config`,
which reports `isSet` (row present) vs `default` per key — a
customized-or-not signal, not a diff against a specific known-good state.

**Genuine gap found: config and entitlement writes are not audited, unlike
every comparable admin mutation route.**

```
$ for f in app/api/v1/admin/*/route.ts; do
    grep -q "logAudit" "$f" && echo "AUDITED: $f" || echo "NOT-AUDITED: $f"
  done | sort
AUDITED: app/api/v1/admin/designations/route.ts
AUDITED: app/api/v1/admin/financial-years/route.ts
AUDITED: app/api/v1/admin/notification-config/route.ts
AUDITED: app/api/v1/admin/organisations/route.ts
AUDITED: app/api/v1/admin/sections/route.ts
AUDITED: app/api/v1/admin/ulbs/route.ts
AUDITED: app/api/v1/admin/users/route.ts
AUDITED: app/api/v1/admin/verticals/route.ts
NOT-AUDITED: app/api/v1/admin/entitlements/route.ts
NOT-AUDITED: app/api/v1/admin/tenant-config/route.ts
```

`lib/audit.ts`'s `logAudit()` writes an `AuditLog` row (`before`/`after`/
`metadata` JSON, tenant-stamped, same transaction as the mutation) and is
already the established pattern for admin mutations — 8 of 10 comparable
routes use it. `PUT`/`DELETE /api/v1/admin/tenant-config` and
`PUT /api/v1/admin/entitlements` are the two exceptions, and neither
`docs/PHASE3-ENTITLEMENTS-PLAN.md` nor `docs/plan.md` records this as a
deliberate deferral — it reads as an oversight, the same shape as Phase 1's
NotificationService gap. `AuditLog.before`/`after` is exactly the primitive a
`diffConfig`-style feature would need (reconstruct what changed and when);
it is currently being skipped for the two routes where a diff feature would
be most useful.

Note: `npx vitest run tests/tenant-config-*.test.ts tests/configurators.test.ts`
was attempted for this audit; the DB-backed suites failed with
`Can't reach database server at 127.0.0.1:5432` (no Postgres running in this
environment) — an environment gap in this investigation, not a code finding.
The pure-function suite (`configurators.test.ts`, no DB) passed in full.

## 1. Gap list, ordered by what blocks the rest (all three closed — see §3)

1. **Audit logging on `tenant-config` and `entitlements` write paths** — no
   design decision needed, mechanical (reuse `logAudit`, mirror
   `notification-config/route.ts`'s call shape). Done first; every later
   drift-detection idea in §2 is more useful once before/after rows exist.
2. **What "config schema" should mean going forward** (§2a) — resolved: no
   generated artifact; the real gap was the UI's implicit field list, closed
   with a CI leg.
3. **What "drift detection" should mean for this codebase** (§2b) — resolved:
   a live customized-vs-default report, computed at read time, not a diff
   against the export.

## 2. Decisions (locked 2026-09-08, not reopened)

### 2a. No generated declarative schema artifact

`registry.ts`'s `StorableKey` union + `validateConfigValue` switch stays the
schema. No `config-schema.yaml`, no `lib/tenant/config-schema.ts`. Instead,
check whether the config admin UI already introspects the registry or
maintains its own field list — see §2a-result below, which found the latter
and made it §1's real work item.

**§2a-result: the UI maintains its own field list, separately from the
registry — confirmed, and closed.**

`app/admin/design-system/Configurator.tsx` is the only UI writing to
`TenantConfigEntry`. It does not iterate `listConfigKeys()`; it hand-codes
exactly two `put("key", ...)` call sites (`themeOverrides`, `llmApiKey`).
The other 9 of 11 registry keys (`productName`, `pdfHeaderLine`,
`reportFilenamePrefix`, `locale`, `timezone`, `currencySymbol`,
`currencyUnit`, `logoPublicPath`, `labels`) have no UI at all — settable only
by the onboarding wizard (`lib/onboarding/provision.ts`'s `configFromDraft`)
or a hand-issued `PUT`. This is the real gap: not a duplicated list that
could disagree in *content* with the registry (nothing in the UI names a key
the registry doesn't have), but an implicit list that can silently fall
behind as new keys are added to the registry, the same shape
`check-route-module-map.ts` exists to catch for routes.

**Closed by `scripts/check-config-ui-coverage.ts`** (wired into
`scripts/run-golden.mjs` as leg 9, `check-config-ui-coverage`): fails if a
registry key is neither `put()`-called by the configurator nor named in a
`NOT_YET_EXPOSED` map with a reason (mirrors `check-api-guards.mjs`'s
`UNAUTHENTICATED_BY_DESIGN` pattern), and fails if `NOT_YET_EXPOSED` goes
stale (names a key the UI now edits, or a key no longer in the registry).
Today's 9 missing keys are recorded there by name — this does not build UI
for them (out of scope: 9 new form fields following AGENTS.md's
no-native-`<select>`/custom-component rules is a UI project, not a CI leg),
it makes the gap impossible to grow silently. Verified:

```
$ npx tsx scripts/check-config-ui-coverage.ts
check-config-ui-coverage: ok (11 registry keys; 2 covered by the UI; 9 exempted with a stated reason)
```

Sabotage-tested by removing one exemption before wiring it in — confirmed it
fails (`UNCOVERED: "labels" is in listConfigKeys() but ... does not edit it`,
exit 1) before restoring it.

### 2b. Drift detection = live customized-vs-default report, not a YAML diff

Computed at read time, directly from `TenantConfigEntry` vs `ODISHA_DEFAULTS`
— never against the git-committed export (§0c stays locked: the export is
still one-directional, nothing reads it back in). Audit logging (§1 item 1)
answers "who changed what when"; this answers "what does this tenant
currently have customized," a different question, not a substitute.

**Where it lives:** extended the existing `GET /api/v1/admin/tenant-config`
response rather than a new endpoint. Reasoning: the report is inherently
per-tenant (there is no cross-tenant admin surface anywhere in this codebase
— every admin route scopes to `getTenantContext()`'s current tenant; building
a first cross-tenant reporting surface for an "all tenants" view would be a
materially bigger, un-precedented change, not a report), and the GET handler
already computes `effective` (stored value overlaid on defaults) and
`ODISHA_DEFAULTS` in the same request — the comparison is a few lines against
data already in hand, not a new read path. Each entry now carries
`customized: boolean` (deep-equal of effective value vs default; for secret
keys, `customized` is just `isSet`, since there is no default to compare
against), and the top-level response gains `customizedKeys: string[]`.
Deliberately NOT the same thing as `isSet` — a row can exist and still hold
the default value (e.g. onboarding writes `locale` even when it matches
Odisha's default), which is not a customization worth surfacing as one.

## 3. Implementation (2026-09-08)

1. **Audit logging** — `logAudit()` wired into `PUT`/`DELETE
   /api/v1/admin/tenant-config` and `PUT /api/v1/admin/entitlements`,
   matching `notification-config/route.ts`'s shape: read the "before" state,
   open `prisma.$transaction`, write the mutation and the audit row together,
   return. Both routes switched from `requirePermission` to
   `requirePermissionAndDbUser` to get an `actor.id` to attribute the row to
   (`GET` on both stays on `requirePermission` — reads aren't audited
   anywhere else in this codebase either). Action types: `tenant_config.set`,
   `tenant_config.clear`, `entitlements.set`. Secret-class config values
   never enter the audit row in cleartext — `auditSafeValue()` reduces them
   to `{isSet}`, same posture as the API response and the export.

   `lib/tenant-config/store.ts`'s three write/read functions gained an
   optional trailing `client` parameter (defaults to the scoped `prisma`) so
   the route can pass its transaction's `tx` through — without this, the
   write and its audit row could not commit atomically (`STD-AUDIT-001`).
   `store.ts` is still the only module that touches `tenantConfigEntry`
   directly; a transaction client is the same delegate through a different
   handle, and `check-tenant-chokepoint.mjs`'s allowlist did not need to
   change.

2. **Schema-artifact question** — resolved by §2a-result above:
   `scripts/check-config-ui-coverage.ts` added and wired into
   `scripts/run-golden.mjs` (leg 9).

3. **Customized-vs-default report** — `customized`/`customizedKeys` added to
   `GET /api/v1/admin/tenant-config`'s response, per §2b.

### Verification

**Root cause of the DB block, found and fixed (2026-09-08, same day):**
`.env.local`/`.env.test.local` (both git-ignored, host-local files) pointed
at `postgresql://postgres:postgres@127.0.0.1:5432/...` — the "laptop without
Compose" convention `.env.example` documents as an *alternative*, not this
repo's default. Every committed reference (`.env.example`, `.env.test.example`,
`docker-compose.yml`, `RUNBOOK.md`, and even the git-ignored-but-present root
`.env`) already agreed on `127.0.0.1:5433`, user `hudd_user`, password
`hudd_password` — `RUNBOOK.md:5` names the reason explicitly: *"host port 5432
is already in use on this server by another container."* The only running
Postgres container (`hudd_db`, healthy) is mapped to exactly that: 5433,
`hudd_user`/`hudd_password`, databases `hudd_nexus` (dev) and `hudd_test`
(test) — both already schema-current (`_prisma_migrations` present, 41
migrations, `prisma migrate status` → "Database schema is up to date!" on
both). This is **local drift, not intentional divergence**: two git-ignored
files never got updated when the project moved from the native-Postgres
convention to the Docker Compose one; nothing else in the repo still expects
5432. Fixed by editing only the two stale files to match `.env.example`'s
already-documented default — no docker-compose, schema, or migration changes:

```diff
--- .env.local / .env.test.local (before)
-DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/hudd"       # dev
-DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/hudd"       # test
--- after
+DATABASE_URL="postgresql://hudd_user:hudd_password@127.0.0.1:5433/hudd_nexus"  # dev
+DATABASE_URL="postgresql://hudd_user:hudd_password@127.0.0.1:5433/hudd_test"   # test
```

(`DIRECT_URL` updated identically in both files.)

**DB-backed suites now pass:**

```
$ npx vitest run tests/tenant-config-admin.test.ts tests/tenant-config-db-roundtrip.test.ts \
    tests/tenant-config-render.test.ts tests/tenant-isolation.test.ts \
    tests/tenant-branding-coverage.test.ts tests/entitlements.test.ts
 Test Files  6 passed (6)
      Tests  119 passed (119)

$ npx vitest run
 Test Files  18 passed (18)
      Tests  332 passed (332)

$ node --env-file=.env.test.local scripts/check-tenant-integrity.mjs
check-tenant-integrity: ok (47 tenant-scoped tables, 47 NULL checks, 83 cross-tenant FK checks)
```

Plus everything already green before the DB fix:

```
$ npx tsc --noEmit
(no output — clean)

$ npx eslint lib/tenant-config/store.ts app/api/v1/admin/tenant-config/route.ts \
    app/api/v1/admin/entitlements/route.ts scripts/check-config-ui-coverage.ts scripts/run-golden.mjs
(no output — clean)

$ node scripts/check-api-guards.mjs
check-api-guards: ok (90 route files checked; 6 unauthenticated by design, each with a stated control)

$ node scripts/check-no-hardcoded-color.mjs
check-no-hardcoded-color: ok (315 file(s) checked repo-wide, 12 allowlisted with reasons)

$ node scripts/check-proxy-matcher.mjs
check-proxy-matcher: ok (130 routes, all matched by 2 compiled matcher(s))

$ npx tsx scripts/check-route-module-map.ts
check-route-module-map: ok (130 routes → 15 modules; 53 core, 77 gated; 51 rules, none stale)

$ npx tsx scripts/check-capability-deps.ts
check-capability-deps: ok (20 modules checked, 0 with dependsOn, 0 edge(s), no cycles)

$ npx tsx scripts/check-config-ui-coverage.ts
check-config-ui-coverage: ok (11 registry keys; 2 covered by the UI; 9 exempted with a stated reason)

$ node scripts/check-tenant-chokepoint.mjs
check-tenant-chokepoint: ok (no unscoped-client, raw-SQL, or unscoped tenant-config escapes outside the allowlist)
```

**Full `node scripts/run-golden.mjs` run, explicitly requested and completed
(2026-09-08).** Two more pre-existing environment gaps surfaced and were
fixed along the way, neither caused by this phase's code:

1. **`check-http-smoke` failed first with 8 assertions comparing an "odisha"
   tenant against a "demo" tenant that didn't exist** — `hudd_nexus` had only
   ever had steps 1–2 of `RUNBOOK.md`'s documented 3-step dev seed sequence
   run (`db:seed`, `db:seed:roles`), never step 3
   (`node prisma/seed_demo_tenant.js`, which creates the "demo" / Suryapur
   tenant the isolation tests require). Fixed by running that script — the
   runbook documents it as idempotent and dev-DB-only ("Suryapur seed resets
   only the demo tenant then recreates it"; explicitly never run against the
   test DB, which this leg doesn't touch anyway).
2. **`check-a11y` then failed on a stray, unrelated `next dev` already
   holding port 3000** (a long-running manual session, not started by any
   automation) — resolved by stopping it.
3. **`check-a11y` failed again on `Cannot find package 'playwright-core'`** —
   declared in `package.json`/`package-lock.json` (both already committed,
   neither changed) but never installed into `node_modules`. Fixed with
   `npm install`, which added exactly the packages already locked (verified
   `git status` on both files stayed clean afterward).
4. **`check-a11y` failed a final time** on a genuine infrastructure gap this
   session cannot fix: it launches Chromium from a hardcoded
   `/opt/pw-browsers/chromium`, which doesn't exist anywhere on this machine,
   and `/opt` is root-owned — not writable by the user this session runs as.
   Confirmed with the human reviewer: **close Phase 2 on 11 of 12 legs**,
   treating this as a known, pre-existing infra-provisioning gap orthogonal
   to Phase 2 (needs either root to seed `/opt/pw-browsers`, or an
   `A11Y_CHROMIUM` override — neither touched, to avoid changing shared CI
   config unilaterally).

Final `node scripts/run-golden.mjs` leg-by-leg result:

```
▶ next build                    ✓ (90 routes compiled, TypeScript clean)
▶ vitest run                    ✓ 332/332
▶ verify-behaviors               ✓ 9/9
▶ check-api-guards               ✓ (90 route files; 6 unauthenticated by design)
▶ check-no-hardcoded-color       ✓ (315 files checked)
▶ check-proxy-matcher            ✓ (130 routes, 2 matchers)
▶ check-route-module-map         ✓ (130 routes → 15 modules, 51 rules, none stale)
▶ check-capability-deps          ✓ (20 modules, no cycles)
▶ check-config-ui-coverage       ✓ (11 registry keys, 9 exempted with reasons) — new this phase
▶ check-tenant-chokepoint        ✓
▶ check-tenant-integrity         ✓ (47 tables, 47 NULL checks, 83 cross-tenant FK checks)
▶ check-http-smoke               ✓ 49/49, including every demo/Odisha isolation and
                                    config-write assertion (theme injection, secret
                                    write-only, tier ceiling, cross-tenant scoping)
▶ check-a11y                     ✗ blocked on missing /opt/pw-browsers/chromium
                                    (infra gap, human-confirmed out of scope)

✗ GOLDEN FAILED at leg: check-a11y   (11/12 legs green)
```

**Phase 2 closed 2026-09-08 on this basis** — everything the phase's own
changes could affect (config write path, entitlements write path, the new
UI-coverage CI leg, `run-golden.mjs`'s leg list) is exercised and green;
`check-a11y`'s failure is orthogonal infrastructure, not a regression.

## 4. What this plan deliberately does not touch

- `lib/tenant-config/registry.ts`'s existing validation logic — correct and
  tested, not being replaced.
- The `lib/onboarding/provision.ts` write-path exception — already
  deliberate, documented, and CI-checked; not a target for consolidation.
- Building UI for the 9 config keys `check-config-ui-coverage.ts` currently
  exempts — a UI project (custom components per AGENTS.md, not native
  `<select>`), scoped separately from this plan.
- A cross-tenant "all tenants" customized-config report — no admin surface in
  this codebase spans tenants today; building the first one is a bigger
  decision than this plan's report.

---

# Phase 3 — Onboarding Wizard — Gap-Closing Plan

> **Read `app/onboarding/OnboardingWizard.tsx`, `lib/onboarding/provision.ts`,
> and `lib/onboarding/draft.ts` first.**
> Also not a green-field build. An eight-step wizard (`app/onboarding/`), a
> single-use token gate (`lib/onboarding/token.ts`), and a transactional
> provisioner (`lib/onboarding/provision.ts`) already exist, are merged, and
> are covered by `tests/onboarding.test.ts`. This plan closes one verified
> gap — a silent data-loss bug in the Branding step — not a rebuild.
>
> **STATUS: §1a decided and implemented 2026-09-08** (§3). Brand colour now
> persists to `themeOverrides`; the logo gets the stub-disclosure treatment
> (option (b) below), not a real upload pipeline. Awaiting human review
> before this phase is marked closed.

## 0. Current-state audit (verified by direct read, not assumption)

**Eight steps, matching the wizard's own header comment — no missing or
extra steps found.** `OnboardingWizard.tsx`'s `STEPS` array: org, branding,
locale, modules, ai, starter, people, review. `design-reference/Menu
Card.dc.html` (348 lines) is capability-row content for the menu-card
configurator, not a wizard-flow spec — it names no step structure to check
the wizard against, so there is nothing in it that contradicts the eight
steps as built.

**`StepModules.tsx` reads live, not a stale copy — confirmed by import, not
inference.** It imports `MODULE_CATALOG` directly from
`lib/entitlements/catalog.ts` and `SELLABLE_MODULES` from
`lib/platform/landing.ts`. `SELLABLE_MODULES` is itself
`MODULE_CATALOG.filter(...)` (`lib/platform/landing.ts:183`), and that file's
own header states the rule it exists to enforce: "no hardcoded module list on
a shipped surface." There is no second, hand-maintained module list anywhere
under `app/onboarding/`. The tier ceiling comes from the token
(`CodeGate`'s `grant.tier`), never from the wizard screen, and is
re-enforced server-side by `resolveGrants()` — the same function the
menu-card configurator calls (`lib/entitlements/plan.ts`), so onboarding and
the post-hoc configurator cannot disagree about what a tier reaches. **Not a
gap.**

**Config keys collectible at onboarding time — mostly correct, one silent
gap found.** `configFromDraft()` (`lib/onboarding/provision.ts:88`) writes
exactly 7 of the registry's 10 storable keys: `productName`,
`pdfHeaderLine`, `reportFilenamePrefix`, `locale`, `timezone`,
`currencySymbol`, `currencyUnit`. This matches what
`scripts/check-config-ui-coverage.ts`'s `NOT_YET_EXPOSED` map already claims
("set at onboarding (configFromDraft)") for those 7 keys — verified true,
not stale. `logoPublicPath` and `labels` are correctly documented in that
same map as "never set by any surface today" — also verified true, and not
new information.

**The gap `check-config-ui-coverage.ts` cannot see, because it only checks
the admin configurator: `StepBranding.tsx` collects `brandColor` and
`logoFileName`, and `provisionTenant` silently discards both.**

- `StepBranding.tsx` (step 2) asks the visitor to pick a brand colour,
  checks it against the platform's dark ground at a 3:1 ratio — explicitly
  because that is the threshold `THEME_ROLES` applies to `--color-accent`
  (`components/nocturne/theme.ts:23-29`) — and shows a live "Legible" /
  "Too faint" verdict. The step's own header comment says the ratio is
  checked "read from one place so the wizard and the configurator cannot
  disagree," i.e. this field is designed to become the tenant's
  `themeOverrides.dark["--color-accent"]`.
- `lib/onboarding/draft.ts` server-validates `brandColor` is a well-formed
  hex value (`validateDraft`, line 157) before provisioning is allowed to
  proceed.
- `StepReview.tsx` (step 8) shows the chosen logo filename and brand colour
  back to the visitor as something that was recorded, alongside every other
  field that does get persisted.
- **`configFromDraft()` never reads `draft.brandColor` or
  `draft.logoFileName` at all** (`lib/onboarding/provision.ts:88-104`) —
  confirmed by reading the function body, which builds its return object
  from only `orgName`, `slug`, `locale`, `timezone`, and `numberFormat`.
  Grepped repo-wide for both field names outside the onboarding step/draft
  files themselves: zero other references. No `themeOverrides` row and no
  `logoPublicPath` row is ever written for a tenant provisioned through this
  wizard.
- The result: a customer who deliberately picks a legible brand colour,
  watches the contrast check pass, and reviews it on the summary screen gets
  a workspace on the stock Odisha accent colour (`PLATFORM_ROLE_DEFAULTS`)
  regardless. Nothing tells them this happened.

This is a materially different shape from the admin-configurator gap
(`check-config-ui-coverage.ts`'s `NOT_YET_EXPOSED` list): that one is "no UI
exists yet to set this key" — an honest, named absence. This one is "the UI
exists, collects the input, validates it, shows it back as recorded — and
then the write path drops it on the floor." It is also unlike this wizard's
*other* two known gaps (starter-data seeding, invite sending), both of which
are deliberately named as stubs: `StepStarter.tsx` and `StepPeople.tsx` each
carry an `InlineAlert` telling the visitor exactly what will and won't
happen, and `pendingWork()` (`lib/onboarding/provision.ts:240`) repeats it
on the launch screen. Branding gets no such treatment anywhere — not in the
step, not in the review screen, not in `pendingWork()`, not in
`tests/onboarding.test.ts` (which asserts an invalid `brandColor` is
rejected, but never asserts a valid one ends up anywhere).

**Why `logoFileName` is harder than it looks.** `FileDrop`'s `onFiles`
handler in `StepBranding.tsx` keeps only `files[0]?.name` — the `File`
object itself is discarded, so there is no upload pipeline transporting
bytes anywhere today, onboarding or otherwise. Fixing brand colour is a
small, mechanical change (validate and write one more `themeOverrides` key,
same pattern `configFromDraft` already uses for the currency fields).
Making the logo real needs an actual file-storage decision (where an
uploaded logo is written, what `logoPublicPath` should point at, size/type
enforcement beyond the current `2 MB max` client-side hint) — a materially
bigger scope than the colour fix, not a one-line omission.

## 1. Judgment call (locked 2026-09-08, not reopened)

### 1a. Fix brand colour now; logo upload is a separate, bigger piece of work

**Decided:** brand colour is fixed for real. The logo gets option (b) below
— the stub-disclosure treatment, matching `StepStarter`/`StepPeople` — not
option (a), a real upload pipeline. A real upload pipeline (storage target,
`logoPublicPath` generation, size/type validation beyond the client-side
hint) is explicitly out of scope here and would be its own future item if
and when a customer actually needs it; nothing in this pass builds toward
it.

- **Brand colour** — close it in this pass. Add `themeOverrides` to
  `configFromDraft()`'s return value (`{ dark: { "--color-accent":
  draft.brandColor } }`), run it through `validateConfigValue` exactly like
  every other key already is (line 138-141 already loops `Object.entries`,
  so this falls into the existing loop for free), and write it in the same
  `tenantConfigEntry.createMany` call. Needs a decision on whether the
  *light* theme role should be set too, or left to default — `StepBranding`
  only ever computes contrast against the dark ground
  (`themeGround("dark")`), so the wizard has no signal for what the light
  value should be; setting only `dark` and leaving `light` unset (falls back
  to `PLATFORM_ROLE_DEFAULTS.light`) is the conservative reading of what the
  visitor actually chose.
- **Logo upload** — do not fold into the colour fix. Either (a) scope a real
  upload path (storage target, `logoPublicPath` generation, validation) as
  its own piece of work, or (b) make the wizard honest about the current
  state the same way `StepStarter`/`StepPeople` already are: add an
  `InlineAlert` under the `FileDrop` saying the logo is recorded as a
  filename now and applied by the onboarding lead after launch, and add a
  matching line to `pendingWork()` so the launch screen says so too. (b) is
  the smaller, faster-to-ship option and matches the pattern this wizard
  already uses everywhere else it isn't fully built; (a) is the one that
  actually keeps the step's promise ("applied everywhere — screens, report
  packs, invitation emails").

## 2. Implementation (2026-09-08)

1. **Brand colour** — `configFromDraft()` (`lib/onboarding/provision.ts`) now
   returns `themeOverrides: { dark: { "--color-accent": draft.brandColor } }`
   alongside its existing keys. It falls into the function's existing
   `Object.entries(config)` validation loop for free — no new call site —
   and is written in the same `tenantConfigEntry.createMany` transaction as
   every other onboarding config row. Only `dark` is set, per §1a: the
   wizard never computes a contrast verdict for `light`, so setting it would
   be inventing a value the visitor never chose.
2. **Logo — stub disclosure, not upload.** `StepBranding.tsx` gained an
   `InlineAlert` (imported from `@/components/nocturne`, already used
   elsewhere in the wizard) shown once `draft.logoFileName` is non-empty,
   directly under the `FileDrop`: *"The file name is recorded, not the
   file. Uploading a logo is not built yet — your onboarding lead applies it
   to the workspace after launch."* Its header comment gained a "STATED
   PLAINLY" paragraph in the same voice `StepStarter.tsx`/`StepPeople.tsx`
   already use for their own stubs. `pendingWork()` (now exported from
   `lib/onboarding/provision.ts` so it's unit-testable without a database)
   gained a matching branch, so the launch screen repeats the disclosure the
   same way it already does for starter data and invites. The colour picker
   and its contrast check are untouched — only the logo field changed
   behavior.
3. **Tests.**
   - `tests/onboarding.test.ts`: new `describe("pendingWork — the
     disclosures shown on the launch screen")` block — asserts no logo note
     when `logoFileName` is empty, a logo note (matched by content, not
     exact string) when it isn't, and that the pre-existing sample-portfolio
     and invitation disclosures are unchanged by the new branch.
   - `scripts/check-http-smoke.mjs` (DB-backed, section F): the existing
     provisioning draft's `logoFileName` changed from `""` to
     `"smoke-crest.svg"` so the new branch is actually exercised end-to-end,
     not just at the unit level. Two new assertions: the provisioning
     response's `pending` array contains a logo-mentioning note, and —
     reading the real `tenantConfigEntry` rows back from the database — the
     newly created tenant's `themeOverrides` row is exactly `{ dark:
     { "--color-accent": draft.brandColor } }`, not merely that the request
     returned 200. This is the same "read the row back, don't trust the
     response" standard the rest of that leg already holds itself to.

**Out of scope, confirmed by §1a:** a real logo-upload pipeline (file
storage, `logoPublicPath` generation, server-side size/type enforcement).
Nothing in this pass moves toward it; `FileDrop` still discards the actual
`File` object and keeps only its name, exactly as before.

### Verification

```
$ npx tsc --noEmit
(no output — clean)

$ npx eslint lib/onboarding/provision.ts app/onboarding/steps/StepBranding.tsx \
    tests/onboarding.test.ts scripts/check-http-smoke.mjs
(0 errors, 2 pre-existing warnings unrelated to this change — confirmed via
git stash: both warnings reproduce on the unmodified files too)

$ npx vitest run tests/onboarding.test.ts
 Test Files  1 passed (1)
      Tests  35 passed (35)

$ npx vitest run
 Test Files  18 passed (18)
      Tests  335 passed (335)
```

**Full `node scripts/run-golden.mjs`, 11 of 12 legs green — the 12th
(`check-a11y`) fails on the same pre-existing, root-owned missing
`/opt/pw-browsers/chromium` binary documented in the Phase 2 section above,
not a regression from this change:**

```
▶ next build                    ✓ (compiled, TypeScript clean)
▶ vitest run                    ✓ 335/335 (332 + 3 new pendingWork tests)
▶ verify-behaviors               ✓ 9/9
▶ check-api-guards               ✓ (90 route files; 6 unauthenticated by design)
▶ check-no-hardcoded-color       ✓ (315 files checked)
▶ check-proxy-matcher            ✓ (130 routes, 2 matchers)
▶ check-route-module-map         ✓ (130 routes → 15 modules, 51 rules, none stale)
▶ check-capability-deps          ✓ (20 modules, no cycles)
▶ check-config-ui-coverage       ✓ (11 registry keys, 9 exempted with reasons)
▶ check-tenant-chokepoint        ✓
▶ check-tenant-integrity         ✓ (47 tables, 47 NULL checks, 83 cross-tenant FK checks)
▶ check-http-smoke               ✓ including the two new provisioning assertions:
                                    "the visitor is told the logo file name was
                                    recorded, not the file" and "the chosen brand
                                    colour reaches themeOverrides, not just the
                                    review screen"
▶ check-a11y                     ✗ blocked on missing /opt/pw-browsers/chromium
                                    (same pre-existing infra gap as Phase 2;
                                    human-confirmed out of scope there, not
                                    re-investigated here)

✗ GOLDEN FAILED at leg: check-a11y   (11/12 legs green)
```

## 3. What this plan deliberately does not touch

- The token gate, rate limiting, and transactional provisioning shape
  (`lib/onboarding/token.ts`, `lib/onboarding/provision.ts`'s transaction) —
  correct and tested, not being replaced.
- The People and Starter-data stubs — already deliberate, already named to
  the visitor, already tracked in `pendingWork()`; not reopened here.
- `logoPublicPath`'s and `labels`' total absence from every write surface —
  already known and recorded in `scripts/check-config-ui-coverage.ts`'s
  `NOT_YET_EXPOSED` map; this plan only adds the missing *reason context*
  (that onboarding collects a logo filename it cannot yet turn into a
  `logoPublicPath`) rather than reopening that script's decision.
- Any change to `MODULE_CATALOG`, `SELLABLE_MODULES`, or the tier ceiling —
  confirmed live and correct in §0, no work items follow from that finding.

---

# Phase 5 — Fleet Console — Investigation and Plan

> **STATUS: read-only investigation complete 2026-09-08. No code changed.
> Awaiting review before implementation.**
>
> Read `lib/tenant-context.ts`, `lib/tenant-scope-registry.ts`,
> `lib/prisma.ts`, `scripts/check-tenant-chokepoint.mjs`, `lib/server-rbac.ts`,
> `lib/onboarding/token.ts`, and `lib/entitlements/export.ts` first — this
> phase adds one screen on top of mechanisms that already exist; it does not
> introduce tenancy machinery.

## 0. Current-state audit

**No cross-tenant read path exists as a *feature* today — but the chokepoint
already has three cross-tenant-*capable* seams, all deliberate, none built
into a UI:**

1. **`GLOBAL_MODELS` bypass the extension entirely.** `Tenant`,
   `TenantConfigEntry`, `Permission`, `Module`, `Release`, `ChangelogEntry`,
   `OnboardingToken` (`lib/tenant-scope-registry.ts:40-48`) skip tenant
   filtering in `lib/prisma.ts:357` (`if (GLOBAL_MODELS.has(model)) return
   query(args)`) — on the ordinary scoped `prisma` client, not just
   `prismaUnscoped`. `prisma.tenant.findMany()` already returns every tenant
   from any authenticated route, gated by nothing but whatever
   `requirePermission()` call wraps it. Nobody currently calls it that way,
   but the chokepoint would not stop them.
2. **`lib/tenant-config/store.ts` takes an explicit `tenantId` argument**,
   not an ambient scope. `readTenantConfigEntries(otherTenantId)` reads that
   tenant's config from inside any request — no scope-switch needed, because
   `TenantConfigEntry` is a `GLOBAL_MODEL` and the store module is the
   allowlisted accessor (`check-tenant-chokepoint.mjs`'s
   `CONFIG_ENTRY_ALLOWLIST`).
3. **`withTenantContext(tenantId, fn)`** (`lib/tenant-context.ts:131`) is the
   sanctioned way to run code against a *specific, named* tenant from outside
   that tenant's own request — today used only by scripts, seeds and tests.
   It nests correctly on top of a route handler's own request scope
   (`AsyncLocalStorage.run` shadows for the callback's duration and restores
   after), so a route handler CAN already loop `for (const t of tenants)
   await withTenantContext(t.id, () => …)` and read genuinely tenant-scoped
   models (`TenantEntitlement`, and everything under it) for a tenant that
   isn't the caller's own — without touching `prismaUnscoped` or the
   chokepoint at all.

**No platform-staff / super-admin / cross-tenant role concept exists
anywhere.** Checked and confirmed empty-handed:
- `User`, `Role`, `RolePermission`, `UserRole` all carry `tenantId` and are
  tenant-scoped (`prisma/schema.prisma:166-307`) — the most powerful role
  seeded in one tenant (`prisma/seed_roles_core.cjs`'s `TASU`) cannot resolve
  or even name a row in another tenant, by construction, not by convention.
- `Permission` is the one global piece of RBAC, but it's a flat code
  registry (`VIEW_ALL_DATA`, `MANAGE_TENANT_CONFIG`, …,
  `prisma/seed_roles_core.cjs:14-49`) — "global" here means "the same 20
  codes are available to every tenant to grant," not "a permission that acts
  across tenants."
- `lib/server-rbac.ts`'s permission resolution (`getEffectivePermissionCodes`)
  is keyed off `getSessionUser()` → a `User` row → that row's tenant-scoped
  roles. There is no session shape, no JWT claim, no env var checked anywhere
  that means "this actor is Airawat staff, not a tenant."
- `lib/onboarding/token.ts` confirms the same absence from the other
  direction: the token that authorizes *creating* a tenant carries only a
  hash, a tier and an expiry (`judgeToken`, line 110) — no minted-by, no
  actor id, nothing that could seed a platform-staff identity later. Tenant
  creation is authorized by possession of a bearer token, not by an
  authenticated platform account.
- `app/platform/page.tsx` and `lib/platform/landing.ts` (the `/platform`
  route, already in use) are the public, unauthenticated marketing page —
  explicitly designed to read *no* session and *no* database, precisely to
  avoid being the first unscoped cross-tenant read (see the comment at
  `app/platform/page.tsx:14-23`). It has no admin/session concept to build
  on, and **the `/platform` path is already spoken for** — Fleet Console
  needs a different route.
- `docs/plan.md:613-615` (Phase 2, written before this phase existed) already
  named this exact gap and deferred it: *"A cross-tenant 'all tenants'
  customized-config report — no admin surface in this codebase spans tenants
  today; building the first one is a bigger decision than this plan's
  report."* Fleet Console is that bigger decision, arriving on schedule.

**No per-tenant deploy signal exists anywhere reachable by the app.** The
`Jenkinsfile` logs `${env.BRANCH_NAME} @ ${env.GIT_COMMIT}` to the Jenkins
console (line 22) and nowhere else — it is not written to a file the build
ships, not exposed via an API route, not stored in the database. There is
exactly one deploy target (`13.203.18.97`, pm2 process
`hudd-dashboard-test`) and one branch gated to deploy (`dev`) — "per-tenant"
deploy signal doesn't yet exist as a concept because there is one deployment
serving the one live tenant, not one deployment per tenant.
`.github/workflows/pr-gate.yml` is a PR gate only (lint, `check-tenant-
chokepoint`, `check-route-module-map`, etc.) — it never deploys and never
touches `GIT_COMMIT`/`GIT_SHA` as a persisted value. **Nothing needs
discovering here; there is nothing to discover.** Any SHA/branch/deploy-status
shown in Fleet Console would need a new, small mechanism (see §2).

## 1. What `check-tenant-chokepoint.mjs` would need to change

**Nothing, for the mechanism recommended in §2.** The three seams in §0 are
already allowlisted or unrestricted:
- `GLOBAL_MODELS` reads need no allowlist entry — they already bypass
  scoping for every caller.
- `readTenantConfigEntries(tenantId)` needs no new allowlist entry — Fleet
  Console's route calls into `lib/tenant-config/store.ts`, the existing
  sanctioned accessor, exactly like `tenant-config/route.ts` does today; it
  doesn't touch `tenantConfigEntry` directly itself.
- `withTenantContext()` needs no new allowlist entry — it's exported from
  `lib/tenant-context.ts` for exactly this kind of caller and carries no
  import restriction in `check-tenant-chokepoint.mjs` (that script only
  guards `prismaUnscoped` imports and raw SQL, neither of which this uses).

This is worth stating plainly because it's the main judgment call this
investigation surfaces (see §2's flag): **the narrow, deliberate exception
the task description anticipated may not need to exist yet.** Looping
`withTenantContext` over a `prisma.tenant.findMany()` list, from inside one
permission-gated route handler, stays entirely inside mechanisms already
reviewed and shipped for other purposes. It does not weaken the chokepoint's
guarantee anywhere — every underlying read is still tenant-scoped, just to a
tenant chosen by the platform-staff caller instead of derived from the host
header.

## 2. Gap list and recommended shape for the cross-tenant read path

**Gaps, in the order Fleet Console would hit them:**

1. No platform-staff identity or permission exists. Whatever `Permission`
   code gates Fleet Console needs a holder who is real today — see the
   judgment call below.
2. No route group outside `getTenantContext()`'s tenant-derived rendering
   exists for an authenticated, non-marketing page. Every screen under
   `app/admin/*` implicitly renders inside the resolved tenant's branding
   (`app/platform` explicitly does not, but is unauthenticated and static).
   Fleet Console is authenticated but must NOT resolve to "the current
   tenant" for its data — it needs to iterate every tenant while still using
   *a* session for its own permission check.
3. No SHA/branch/deploy-status signal exists to show (§0, last paragraph) —
   this is a real gap requiring new plumbing, not a read-path question.
4. `buildTenantExportPayload(tenantId)` (`lib/entitlements/export.ts:45`)
   already computes exactly the per-tenant capability + config snapshot
   Fleet Console wants, but it assumes it's called from *inside* that
   tenant's own resolved scope (it calls the scoped `prisma` for
   `TenantEntitlement`, which needs an active tenant scope to pass the
   chokepoint) — calling it once per tenant from Fleet Console means wrapping
   each call in `withTenantContext(tenant.id, () => buildTenantExportPayload(tenant.id))`,
   not calling it bare.

**Recommended mechanism:** no new Prisma client, no new chokepoint
exception. A platform route handler that:
  a. Authenticates the caller and checks one new permission code (§3) using
     the ordinary `requirePermission()` path — this still resolves against
     the CALLER's own tenant-scoped `User`/`Role` rows, because that's the
     only kind of identity this codebase has (see §0's platform-staff
     finding).
  b. Reads the tenant list with the ordinary scoped `prisma` client —
     `prisma.tenant.findMany()` — which already returns every tenant because
     `Tenant` is a `GLOBAL_MODEL`.
  c. For each tenant, calls `withTenantContext(tenant.id, () =>
     buildTenantExportPayload(tenant.id))` to get that tenant's capability +
     config snapshot, reusing the Phase 1/2 computation verbatim rather than
     recomputing it.

**The tradeoff, stated as asked:** this is narrower than a bypass but it
inherits `withTenantContext`'s original design assumption — one script,
one process, no concurrent tenant identities racing each other. A route
handler calling it in a loop is a new *caller category* for a mechanism
whose only prior callers were single-tenant-at-a-time scripts and tests. It
is provably safe under `Promise.all`/sequential iteration (each call gets
its own `AsyncLocalStorage.run()` frame, and Node's continuation-tracking
keeps concurrent frames separate), but it has never been exercised at
platform-staff-in-a-live-request cardinality before, and there's no test
today that pins "N concurrent `withTenantContext` calls inside one request
stay isolated" the way `tests/tenant-isolation.test.ts` pins the chokepoint
itself. **If this mechanism is adopted, that test gap should close before
Fleet Console ships**, not after.

The alternative — a dedicated `prismaPlatformRead` client extension with an
explicit allowlist of models it may read unscoped — would be more legible as
"the one hole" (one file, one export, easy to audit at a glance) but is more
machinery than one tenant's worth of data justifies today, and it would be a
second code path computing the same capability/config state
`buildTenantExportPayload` already computes correctly. Recommend deferring
it until Fleet Console needs either (a) a single aggregate query across many
tenants' scoped rows for performance, or (b) a read outside the
`TenantEntitlement`/`TenantConfigEntry` pair `buildTenantExportPayload`
already covers. Neither is true yet.

## 3. Fleet Console shape — judgment calls flagged, not decided

**What it shows, for the one live tenant:**
- Identity: slug, name, status (`prisma.tenant.findMany()` — already
  unrestricted).
- Capability + config state: `buildTenantExportPayload(tenant.id)` per
  tenant via `withTenantContext` (§2), reusing Phase 1's export and Phase
  2's `customized`/`customizedKeys` computation rather than re-deriving
  either.
- Config drift: the same `customized: boolean` / `customizedKeys` shape
  already returned by `GET /api/v1/admin/tenant-config`
  (`app/api/v1/admin/tenant-config/route.ts:90-103`) — Fleet Console should
  call the same comparison logic, not re-implement deep-equal-vs-`ODISHA_
  DEFAULTS` a second time. Whether that means factoring the entries-builder
  out of the route into a shared helper, or Fleet Console importing and
  calling it in a `withTenantContext` loop the same way it calls
  `buildTenantExportPayload`, is an implementation detail, not a design
  question.
- SHA / branch / deploy status: **no source exists (§0)**. Showing this at
  all means Jenkins writing something new — the cheapest option is a
  post-deploy `curl` to a new internal endpoint, or `pm2`/the app reading a
  `version.json` the build step generates from `$GIT_COMMIT`/`$BRANCH_NAME`.
  Recommend treating this as explicitly out of scope for a first cut rather
  than inventing the plumbing under this phase's time pressure — flagging,
  not deciding.
- CI status: same answer as deploy status — `pr-gate.yml` runs on GitHub,
  the deploy runs on Jenkins, and neither publishes a status the app can
  poll. Out of scope for the same reason.

**Judgment calls this investigation surfaces rather than resolves:**

1. **Who holds the new permission?** There is no platform-staff account
   type (§0). Options, none clearly right without a product decision:
   (a) grant the new permission code to specific `Role` rows in the
   Odisha tenant only — cheap, but "platform staff" becomes indistinguishable
   from "a very trusted Odisha user," which is a strange invariant to build
   on when tenant #2 exists; (b) introduce a real platform-staff concept
   (e.g. a `User` row with `tenantId` pointed at a reserved bootstrap
   tenant, or a new global flag) — more correct long-term, meaningfully
   bigger than this phase; (c) gate Fleet Console by something outside RBAC
   entirely (env-var allowlisted email, a separate auth realm) for now,
   accepting it's a stopgap. **This needs a decision before implementation,
   not an assumption.**
2. **Permission code name and semantics** — proposing `VIEW_FLEET_CONSOLE`
   (or similar) as a NEW code in the flat `Permission` registry
   (`prisma/seed_roles_core.cjs`), following the existing pattern
   (`VIEW_COMMAND_CENTRE`, `VIEW_ANALYTICS`). Whether it should be
   assignable at all while (1) is unresolved is part of the same question.
3. **Route group location** — `/platform` is taken by the public marketing
   page (§0) and must stay unauthenticated and static. Candidates:
   `app/admin/fleet` (consistent with every other admin screen, but
   semantically wrong — it isn't "this tenant's admin," it's "every
   tenant") vs. a new top-level group, e.g. `app/fleet` or
   `app/platform-console`, that deliberately does NOT sit under
   `app/admin/*`'s implied single-tenant framing. Leaning toward the latter
   given how deliberately this codebase has kept "current tenant" and
   "platform" apart everywhere else (`app/platform`'s own comments), but
   this is a naming/IA call, not decided here.
4. **The `withTenantContext`-in-a-request-loop concurrency gap** (§2) —
   whether to add the isolation test before or alongside Fleet Console's
   first implementation. Recommend before, given `tests/tenant-isolation
   .test.ts` is treated in this codebase as "the permanent core safety net"
   for exactly this class of risk.
5. **SHA/branch/deploy/CI signal** — explicitly deferred (see above), but
   flagging that "what Fleet Console shows" in the task description assumed
   it might already exist. It doesn't. Building it is a Jenkins + a new
   small endpoint, not a Fleet Console concern per se, and could be sliced
   into its own follow-up rather than blocking the console's first version.

## 4. What this investigation deliberately does not touch

- No code changed. No new permission, route, or schema field added.
- No opinion formed on `prismaPlatformRead` vs. the `withTenantContext`-loop
  approach beyond the recommendation in §2 — both remain viable, and the
  loop approach was preferred only because it reuses more of Phase 1/2's
  already-shipped, already-tested computation.
- Whether Fleet Console eventually needs pagination/aggregation once tenant
  count grows past "one" — not a design question worth answering against a
  single row.

## 5. Decisions (locked, not reopened) and implementation (2026-09-08)

The five judgment calls in §3 are resolved:

1. **Who holds access** — a new global `PlatformOperator` table
   (`userId`, `grantedAt`), not a new Role/Permission. Checked IN ADDITION TO
   normal session auth, never instead of it.
2. **Route** — `app/fleet`, not `app/admin/fleet`.
3. **Deploy/SHA/CI** — shown as explicitly "not available" in this first
   cut. Building the signal (Jenkins + a new small endpoint) is a scoped
   follow-up, not part of this phase.
4. **The `withTenantContext`-loop concurrency gap** — closed with a
   test written and passing BEFORE the route existed, per instruction.
5. **Content** — capability state, config state, and the Phase 2
   customized-vs-default report, all reused verbatim.

### What was built

- **`prisma/schema.prisma`** — `model PlatformOperator` (id, userId
  unique, grantedAt). No `@relation` to `User`, mirroring
  `OnboardingToken.tenantId`'s precedent: the grant must not depend on or
  cascade with the user's tenant-scoped row. Migration
  `20260908112408_add_platform_operator`, applied to the test DB first,
  then the dev DB (`npm run prisma:migrate:test` semantics via `migrate
  dev` against `.env.test.local`, generating the migration; `migrate
  deploy` against `.env.local` applied the same generated SQL to dev).
- **`lib/tenant-scope-registry.ts`** / **`scripts/check-tenant-integrity.mjs`**
  — `PlatformOperator` added to `GLOBAL_MODELS` in both copies (the second
  is a standalone mirror by design, per its own header comment). It exists
  to be read ACROSS tenants, so scoping it would defeat the feature —
  same argument as `Permission`/`Module`.
- **`tests/tenant-isolation.test.ts`** — ratchet test updated: 47
  tenant-scoped / 8 global (was 7), with a Phase 5 line in the running
  comment log.
- **`lib/platform/operators.ts`** (new) — `isPlatformOperator(userId)`.
  Trivial: `PlatformOperator` bypasses the chokepoint automatically as a
  `GLOBAL_MODEL`, so this needs no scope and no new client.
- **`prisma/seed_roles_core.cjs`** / **`prisma/seed_roles.js`** —
  `ensurePlatformOperator(prisma, userId)`, called after
  `ensureBootstrapTasuAdmin` so the seeded TASU bootstrap admin
  (`tasu.admin@hudd.bootstrap`) holds Fleet Console access on every
  freshly seeded database, test and dev alike. Idempotent by `userId`,
  same posture as every other function in that file.
- **`lib/tenant-config/registry.ts`** — `buildConfigEntriesReport()`
  extracted from `app/api/v1/admin/tenant-config/route.ts`'s `GET` handler
  verbatim (same logic, same output shape — the route's JSON response is
  unchanged). This is the "no new computation" requirement made concrete:
  Fleet Console and the existing admin route now both call the one
  function that decides what "customized" means, instead of the admin
  route being the only caller.
- **`tests/tenant-context-loop-isolation.test.ts`** (new) — written and
  green BEFORE `app/fleet/page.tsx` was added, per instruction. Exercises
  the exact shape Fleet Console's route uses (`withTenantContext(tenant.id,
  () => buildTenantExportPayload(tenant.id))` in a loop) against Odisha +
  the seeded `demo` tenant fixture: sequential order, reversed order,
  N=4 alternating, concurrent `Promise.all`, and a direct tenant-scoped
  read inside each iteration. All pass — no cross-tenant bleed under any of
  the five shapes.
- **`app/fleet/page.tsx`** (new) — the console itself. Two-part gate
  (`getDbUserBySession()` then `isPlatformOperator(user.id)`, 404 on
  either failure, matching `TenantResolutionError`'s posture of not
  confirming the route's existence to a caller who cannot use it). Lists
  every tenant (`prisma.tenant.findMany()`, already unrestricted), and for
  each one calls `withTenantContext(tenant.id, …)` once to compute
  `buildTenantExportPayload` (capabilities + config) and
  `buildConfigEntriesReport` (customized keys) together, reusing Phase
  1/2's computation with no re-derivation. Rendered with the existing
  Nocturne `Card`/`Tag`/`StatusTag`/`InlineAlert` components, no new UI
  primitives. Not tenant-themed (`NocturneRoot` with no overrides) — Fleet
  Console is Airawat's own surface, not any one tenant's, same posture as
  `app/platform`.
- **Two gaps the build caught, fixed alongside:**
  - `lib/entitlements/route-modules.ts` had no rule for `/fleet` —
    `check-route-module-map` failed closed on it (an unmapped route 404s
    for everyone, which is correct but not what was wanted). Mapped to
    `MOD-ADMIN` (core, never entitlement-gated) for the same reason
    `/admin` is core: gating a platform-staff screen on a tenant's own
    purchased modules would be incoherent. The real gate stays
    `PlatformOperator` membership, checked inside the page, not this map.
  - `lib/dev-path-routing.ts`'s `RESERVED_ROOT_SEGMENTS` didn't list
    `fleet` — `tests/dev-path-routing.test.ts`'s "every top-level route
    directory is reserved" assertion caught it immediately. Without the
    fix, a tenant whose slug happened to be `fleet` would have shadowed
    the console in dev path-routing mode. Added.

### Verification

```
$ npx tsc --noEmit
(clean)
```

`node scripts/run-golden.mjs` — 12 of 13 legs green (`next build`,
`vitest run` — 340 tests including the two files above, `verify-behaviors`,
`check-api-guards`, `check-no-hardcoded-color`, `check-proxy-matcher`,
`check-route-module-map`, `check-capability-deps`,
`check-config-ui-coverage`, `check-tenant-chokepoint`,
`check-tenant-integrity`, `check-http-smoke`). The one failure,
`check-a11y`, is `browserType.launch: Failed to launch chromium because
executable doesn't exist at /opt/pw-browsers/chromium` — the same
pre-existing, machine-local Playwright binary gap recorded during the
Phase 2 pass, unrelated to this change; every other leg touching this
phase's code (build, the new isolation test, the chokepoint/integrity
guards, http-smoke's cross-tenant sweep) is green.

### Out of scope, confirmed by §5's decisions

- Deploy/SHA/CI status — explicitly deferred; `app/fleet/page.tsx` shows a
  static "not available" notice rather than inventing partial plumbing.
- A real platform-staff account type, or folding `PlatformOperator` into
  RBAC — deliberately not built; the allowlist is the whole mechanism.
- Pagination/aggregation for tenant counts beyond "a handful" — not a
  design question worth answering against two rows (Odisha + the demo
  fixture used only by tests).
