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
> one gap verified missing — audit logging — and asks the reviewer to settle
> what "config schema" and "drift detection" mean in a codebase that already
> made a locked decision (Phase 1 §0c) against a file+CLI pattern.
>
> **STOP CONDITION:** do not start any step below until the two judgment
> calls in §0 are resolved by the human reviewer.

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

## 1. Gap list, ordered by what blocks the rest

1. **Audit logging on `tenant-config` and `entitlements` write paths** — no
   design decision needed, mechanical (reuse `logAudit`, mirror
   `notification-config/route.ts`'s call shape). Do first; every later
   drift-detection idea in §2 is more useful once before/after rows exist.
2. **Decide what "config schema" should mean going forward** (§2a) — blocks
   nothing mechanically, but changes how new keys get added, so settle before
   the next storable key is added rather than after.
3. **Decide what "drift detection" should mean for this codebase** (§2b) —
   blocks any drift-detector implementation; depends partly on §2a (a
   generated schema file gives drift-detection something to check *against*
   beyond "what changed since when").

## 2. Judgment calls requiring sign-off before work starts

### 2a. Is the TypeScript-embedded schema in `registry.ts` sufficient, or does this need a generated, declarative artifact?

`docs/PRODUCTIZATION-PLAN.md` describes a `config-schema.yaml` generated from
`lib/tenant/config-schema.ts` — a schema independent of any tenant, listing
every key/type/constraint, reviewable in a PR diff without reading
TypeScript. HUDD's actual schema is `STORABLE_KEYS` +
`validateConfigValue`'s switch statement: equally strict at runtime, but not
independently inspectable — reading "what are the valid config keys and their
constraints" today means reading the validator function, not a data file.

**This is not obviously a gap.** The task brief's own words acknowledge
Phase 1 needed no such thing; config differs from entitlements exactly in
needing value-level validation, which is done. A generated schema file adds
value only if something *external* to this codebase needs to read it
(a docs generator, a different service, a human reviewing config changes
without reading TypeScript). Needs the reviewer to say whether that
consumer exists or is anticipated, or whether `registry.ts` as written is
the intended final shape.

### 2b. What should "drift detection" mean here, given §0c's locked decision?

The task brief asks to bring over "drift detection against a known-good
state," mirroring VMS's `tenant-config diff` (file-intent vs applied-state).
HUDD has no file-intent to diff against — Phase 1 explicitly decided the
exported YAML is not read back in, to avoid a second write path becoming a
second source of truth. Three different things could satisfy "drift
detection" without reopening that decision, and they are not equivalent:

- **(a) Audit trail** (§1 item 1): "what changed, when, by whom" — reconstructs
  history but does not compare against any *target* state.
- **(b) Customized-vs-default signal**: already exists per-key
  (`GET /api/v1/admin/tenant-config`'s `isSet`/`default` fields) but is not
  exposed as a single "this tenant has N unreviewed customizations" report
  and has no concept of a target *other than* the hardcoded Odisha defaults.
- **(c) Live-state vs last-committed-export diff**: would require reading a
  git-committed YAML back in for comparison — the exact shape §0c rejected
  as a second source of truth. Could be done read-only (compare, never
  write) without reversing §0c, but needs explicit confirmation that a
  read-only comparison doesn't count as the hazard §0c was avoiding.

**Needs the human reviewer to pick (a), (b), (c), or some combination** —
implementing the wrong one either under-delivers against "drift detection"
or reopens a decision Phase 1 already locked.

## 3. What this plan deliberately does not touch

- `lib/tenant-config/registry.ts`'s existing validation logic — correct and
  tested, not being replaced.
- The `lib/onboarding/provision.ts` write-path exception — already
  deliberate, documented, and CI-checked; not a target for consolidation.
- Phase 1's entitlements plan (above) — audit logging for
  `app/api/v1/admin/entitlements/route.ts` is flagged in §1 because it shares
  the exact gap, but fixing it is this plan's item, not a reopening of Phase
  1's scope.
