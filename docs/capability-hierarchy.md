# Capability hierarchy — three layers, three files, one truth each

> **Decision (2026-09-08, locked — do not re-open):** the three capability
> counts in this codebase (65 / 20 / 12) are not competing reconciliations of
> the same list. They are three different layers of one hierarchy, each with
> its own unit of granularity and its own authoritative file. This document
> makes the hierarchy explicit; it does not merge or renumber anything.

```
Capability (65)                     Module (20)                  Group (12)
FRS-level requirement rows    →     enforcement unit        →    onboarding/menu-card
Notion "Capability Registry"        lib/entitlements/catalog.ts  presentation unit
                                                                  lib/menu-card/capabilities.ts
```

## Layer 1 — Capability (65 rows, FRS-level)

**Source of truth:** the Notion "Capability Registry" database
(`collection://0fdec912-c5c6-4cb2-ac3d-bffdac588312`, see
`docs/PRODUCTIZATION-PLAN.md` §16), mirrored locally as
`artifacts/capability_register_hudd.csv`.

This is the widest-granularity list: one row per distinct product capability
as tracked against the official FRS (Functional Requirements Specification).
It answers "what does this product do, at requirement granularity" and feeds
the config-key sweep in `docs/PRODUCTIZATION-PLAN.md` §4–§7. It is **not**
the same list as the ~50 `Capability` rows inside
`lib/menu-card/capabilities.ts` (layer 3, below) — those are a *different*,
smaller reconciliation sourced from the Menu Card design, not from this
Notion database. Do not assume a 1:1 mapping between the two without checking.

## Layer 2 — Module (20 rows, the enforcement unit)

**Source of truth:** `lib/entitlements/catalog.ts` (`MODULE_CATALOG`).

This is the unit `TenantEntitlement` actually gates: `proxy.ts` resolves
every route to exactly one of these 20 codes and denies (404) when it is
gated and not enabled for the tenant. Reconciled from the Notion "Modules"
database (23 rows) — `MOD-EXP` folds into `MOD-RPT`, `MOD-TASK` folds into
the core shell, `MOD-NFR` is excluded (cross-cutting, not a UI module) — see
the reconciliation note at the top of `catalog.ts` itself.

**This is the only layer with real enforcement behind it.** Layers 1 and 3
are presentational/documentation; toggling a Layer 2 module is the only
action that changes what a tenant can actually reach.

## Layer 3 — Group (12 catalog-backed groups from 14 design groups, the onboarding/menu-card presentation unit)

**Source of truth:** `lib/menu-card/capabilities.ts` (`CAPABILITY_GROUPS` +
`PLATFORM_STANDARD`).

This is what an administrator or a buyer actually sees on the menu-card
configurator (`app/admin/menu-card/Configurator.tsx`) and the onboarding
wizard's module-selection step (`app/onboarding/steps/StepModules.tsx`): one
group per module (mostly), each listing the individual capabilities
(~50 rows, id/name/description/status) that module actually contains.
Sourced verbatim from `design-reference/Menu Card.dc.html`'s 14 groups,
reconciled to the 12 catalog modules that have a group representation
(`MOD-SEC` and `MOD-OPS` are catalog-only roadmap codes with no group at all).

Each group also carries a `category` (`core | intelligence | automation |
enterprise`) — a presentational classification, **not** a commercial tier.
See the `CapabilityCategory` doc comment in `capabilities.ts` for why this is
deliberately a separate axis from `ModuleTier`.

## How the layers relate — and don't

| | Capability (65) | Module (20) | Group (12) |
|---|---|---|---|
| Grain | FRS requirement | enforcement unit | menu-card presentation |
| Source | Notion Capability Registry | `lib/entitlements/catalog.ts` | `lib/menu-card/capabilities.ts` |
| Gates anything? | No | **Yes — the only layer that does** | No |
| Authoritative for | requirement tracking, config-key sweep | route/nav/job gating | admin UI, onboarding UI |

**Each file is authoritative for its own layer only.** A count mismatch
between layers (65 vs 20 vs 12, or the ~50 `Capability` rows inside
`capabilities.ts` vs the 65-row Notion registry) is expected, not a bug to
reconcile — they are answering different questions at different grain. If a
future change needs a capability to move between layers (e.g. a new FRS
requirement needs its own enforcement module), that is a deliberate design
decision to record in `docs/PHASE3-ENTITLEMENTS-PLAN.md`, not a drift to
silently fix by renumbering one of the three files.

## Known drift, corrected

`MTG-05` (Data-Entry Window & Closure) was marked `status: "live"` in
`lib/menu-card/capabilities.ts` but `docs/audit/hudd-v1-verification.md` (an
independent code sweep) found no closure field and no enforcement built —
corrected to `"plan"`. `docs/audit/hudd-v1-verification.md` is the
tie-breaker for any future status disagreement between the capability catalog
and the actual code; a one-line note to that effect is in
`capabilities.ts`'s file header.
