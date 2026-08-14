# Tenancy Extraction Backlog

> **What this is:** the named, tracked debt from Phase 0/1 Step 3 — the hardcoded
> Odisha literals that are **mandatory to extract** but were **deferred** because
> converting them now would change rendered output that the golden net does not yet
> pin. This file is the single source of truth for that debt. It does not scroll away.
>
> **Not in scope here:** items that are *true-leave* (internal identifiers) or
> *route-to-seed-data* (demo content) — those are listed at the bottom for completeness
> but carry a different procedure (or no procedure).
>
> **Companion docs:** `docs/PRODUCTIZATION-PLAN.md` (architecture), `scripts/check-tenancy-lint.mjs`
> (the detector that re-surfaces this backlog in CI), `scripts/run-golden.mjs` (the
> regression harness that gates every discharge).

---

## The Rule (discharge procedure for every item below)

**Extend the golden to the call site, then convert.** Do not convert a deferred
literal until the golden net would catch the change.

1. **Pin first.** Add an assertion to `tests/core-surfaces.test.ts` or
   `tests/tenant-config-render.test.ts` that pins the **exact rendered string**
   the call site produces today (for the Odisha defaults). For UI text, assert on
   the rendered output; for PDF/XLSX, extract text from the rendered buffer; for
   metadata, snapshot the exact string.
2. **Confirm golden green** with the new assertion (`node scripts/run-golden.mjs`).
   The assertion must pass against the *current* (un-converted) code.
3. **Convert.** Replace the literal with a read from `lib/tenant-config/`
   (`tenantConfig()`, `formatCurrency()`, `formatNumber()`, `tenantLocale()`,
   `tenantTimezone()`, or a new key added to `ODISHA_DEFAULTS` with the current
   Odisha value as its default).
4. **Re-run golden. It must stay green.** Green-before-and-green-after is the proof
   that the conversion preserved the rendered form bit-for-bit. If it goes red after
   conversion, the helper's output does not match the prior inline form — fix the
   helper/precision/spacing, do not loosen the assertion.
5. **Strike the item** from this file (or move it to *Discharged* with the commit SHA).

> **Why this order:** the residual items are deferred precisely because their inline
> form (toFixed precision, spacing, embedded labels) differs from the centralized
> helper's output. Converting without a prior pin risks a *silent* rendered change
> the golden cannot catch. Pin-then-convert makes every change audible.

**Anti-rule (do not do):** never loosen an existing golden assertion to make a
conversion pass. The assertion is the spec; the conversion is the change.

---

## A. Currency values — toFixed / spacing variants (rendered)

These render money to the screen/PDF with `toFixed` (no thousands separators) or
with a space after `₹` — forms that `formatCurrency()` (toLocaleString-based, no
space) does **not** reproduce. Discharge = pin the exact string, then convert (likely
needs a `grouped: false` / precision option on `formatCurrency`, or a dedicated
toFixed variant in `lib/tenant-config/format.ts`).

| # | Location | Current literal (form) | Target | Discharge pin |
|---|----------|------------------------|--------|---------------|
| A1 | `app/financial/FinancialOverviewClient.tsx:707` | `` `₹${Number(v??0).toFixed(1)} Cr` `` (tooltip) | `formatCurrency` toFixed variant | assert tooltip string |
| A2 | `app/financial/FinancialOverviewClient.tsx:741` | `` `₹${Number(v??0).toFixed(1)} Cr` `` | same | assert tooltip string |
| A3 | `app/financial/entry/scheme/page.tsx:586` | `₹${totalSO.toFixed(2)} Cr` / `₹${activeEffectiveBudgetCr.toFixed(2)} Cr` (warning msg) | `formatCurrency` toFixed variant | assert warning text |
| A4 | `app/financial/entry/scheme/page.tsx:669` | `₹${row.ifms.toFixed(2)} Cr` (confirm msg) | same | assert confirm text |
| A5 | `app/financial/entry/scheme/page.tsx:896,907,1002,1011` | `₹ {value.toLocaleString(...)} Cr` (space after ₹) | `formatCurrency` space variant or normalize | assert rendered cell string |
| A6 | `app/financial/entry/scheme/page.tsx:1017,1139` | `₹ {(sum).toFixed(2)} Cr` | toFixed variant | assert rendered string |
| A7 | `app/financial/entry/scheme/page.tsx:1094,1101` | `₹{value.toLocaleString(...)}` (no unit) | `formatCurrency({withUnit:false})` | assert rendered string |
| A8 | `app/financial/entry/summary/page.tsx:248,252,256` | `₹ {totals.x.toFixed(2)} Cr` | toFixed variant | assert totals cell string |
| A9 | `app/financial/schemes-board/SchemesBoardClient.tsx` (12 sites: 425,443,805,876,921,923,1063,1066,1133,1179,1181) | `₹{fmtCr(...)} Cr` (fmtCr = toFixed 0/1) | toFixed variant reading symbol/unit | assert each rendered string |
| A10 | `app/meetings/components/FinancialMeetingPanel.tsx:110,116,122` | `₹{totals.x.toFixed(1)} Cr` | toFixed variant | assert KPI string |
| A11 | `app/meetings/components/FinancialMeetingPanel.tsx:161,194` | `₹${n.toFixed(2)} Cr` (tooltip) | toFixed variant | assert tooltip string |
| A12 | `app/meetings/components/FinancialMeetingPanel.tsx:219,220,221` | `₹{r.x.toFixed(1)}` (no unit) | `formatCurrency({withUnit:false})` toFixed | assert cell string |
| A13 | `app/schemes/page.tsx:17` | `` `₹${value.toFixed(1)} Cr` `` (local helper) | toFixed variant | assert helper output |
| A14 | `components/CommandCentre.tsx:94,95` | `₹${value.toFixed(0)} Cr` / `₹${value.toFixed(2)} Cr` | toFixed variant | assert rendered string |
| A15 | `lib/agent-runner.ts:512,576,578,586,588` | `₹${delta.toFixed(2)} Cr` (agent insight copy) | toFixed variant | assert insight string |
| A16 | `lib/assistant-query.ts:81,86,87,88,195,196,198,201,204,207` | `₹${...toFixed(1)} Cr` (LLM prompt text) | toFixed variant | assert prompt string |

## B. Currency symbol/unit embedded in static labels (heading copy)

`₹` and `Cr`/`Crores` appear inside static heading/label strings, not as a formatted
value. Discharge = pin the label string, then compose it from
`tenantConfig().currencySymbol` / `currencyUnit` (or a `currencyAxisLabel()` helper).

| # | Location | Current literal | Target |
|---|----------|-----------------|--------|
| B1 | `app/financial/FinancialOverviewClient.tsx:544,547,679,683,721` | `₹ in Crores`, `Amount (₹ Crores)`, `IFMS expenditure (₹ Crores)` | compose from config symbol/unit |
| B2 | `app/financial/FinancialOverviewClient.tsx:709,744,745,786,787,788` | `IFMS Expenditure (₹ Cr)`, `Baseline IFMS (₹ Cr)`, `Budget (₹ Cr)`, `SO (₹ Cr)`, `IFMS (₹ Cr)` | compose from config |
| B3 | `app/financial/entry/bulk/page.tsx:581,587,590,593,596,605,608` | `Total Budget (₹ Cr)`, `Current SO (₹ Cr)`, `Add to SO (₹ Cr)`, `Current IFMS (₹ Cr)`, `Add to IFMS (₹ Cr)`, `Current Budget (₹ Cr)`, `Supplement (₹ Cr)` | compose from config |
| B4 | `app/financial/entry/scheme/page.tsx:869,953,1014,1136,1171,1172,1242,1253` | `New Budget (₹ Cr)`, `Amount (₹ Cr)`, `Amount to add (₹ Cr)`, `Add IFMS Expenditure (₹ Cr)`, `IFMS (₹ Cr)`, `SO (₹ Cr)` | compose from config |
| B5 | `app/financial/entry/summary/page.tsx:169,183,184,185,207,218,229` | `Budget estimate (₹ Cr)`, `SO expenditure (₹ Cr)`, `IFMS expenditure (₹ Cr)` | compose from config |
| B6 | `app/meetings/components/FinancialMeetingPanel.tsx:134,177` | `By budget category — IFMS (₹ Cr)`, `IFMS trend by snapshot date (₹ Cr)` | compose from config |
| B7 | `components/schemes/SchemeModal.tsx:489` | `IFMS (₹ Cr)` (chart series name) | compose from config |
| B8 | `lib/templates.ts:25,26,27,40,54,55,56,72` | `Budget (₹ Cr)`, `SO Order (₹ Cr)`, `IFMS Actual (₹ Cr)`, `…in ₹ Crore…` (LLM template copy) | compose from config |

## C. Compound metadata / brand copy (Government of Odisha, HUDD brand)

Standalone header line `Government of Odisha` and the SO/IFMS labels were extracted
in Step 3. What remains is *compound* sentences (SEO/meta descriptions, alt text)
and the `HUDD` brand string scattered across titles/branding. Discharge = pin the
exact string, then compose from `tenantConfig().pdfHeaderLine` / `productName` /
a new `departmentFullName` key.

| # | Location | Current literal | Target |
|---|----------|-----------------|--------|
| C1 | `app/layout.tsx:9,10` | `title: "HUDD — Odisha Urban Governance"`, `description: "…Government of Odisha"` | `productName` + `pdfHeaderLine` compose |
| C2 | `app/login/page.tsx:9,11,68` | `"Secure Login \| HUDD Dashboard"`, `"Official access portal for the Housing & Urban Development Department, Government of Odisha…"`, `HUDD Integrated Dashboard` | `productName` + `pdfHeaderLine` + `departmentFullName` |
| C3 | `components/GovLoginBranding.tsx:13` | `alt="Housing and Urban Development Department, Government of Odisha"` | `departmentFullName` key |
| C4 | `components/AppShell.tsx:102` | `<span>HUDD Odisha</span>` | `productName` (short brand) |
| C5 | `app/auth/error/page.tsx:9`, `app/changelog/page.tsx:117`, `app/kpis/page.tsx:703`, `app/meetings/page.tsx:168`, `app/page.tsx:16`, `app/profile/page.tsx:132,169` | `HUDD Dashboard` / `HUDD` brand copy | `productName` |
| C6 | `app/action-items/[id]/page.tsx:556,575`, `app/action-items/page.tsx:551,795,818` | `"HUDD Officer"` designation fallback, `…across HUDD schemes…` copy | `defaultDesignation` / `productName` label keys |
| C7 | `components/WhatsNewNotification.tsx:120`, `components/ConversationalAI.tsx:64,137` | `What's New in HUDD`, `…live HUDD data…` | `productName` |
| C8 | `lib/agent-runner.ts:659`, `lib/assistant-query.ts:47`, `lib/llm.ts:22` | LLM system prompts mention `HUDD` / `Housing and Urban Development Department` | `productName` / `departmentFullName` in prompt builder |

## D. Report filename prefixes (tenant-visible download names)

| # | Location | Current literal | Target |
|---|----------|-----------------|--------|
| D1 | `app/api/v1/reports/meeting/[meetingId]/pdf/route.ts:53` | `` `HUDD-meeting-report-${date}.pdf` `` | `reportFilenamePrefix` key |
| D2 | `app/api/v1/reports/meeting/[meetingId]/xlsx/route.ts:57` | `` `HUDD-meeting-report-${date}.xlsx` `` | same |
| D3 | `app/api/v1/reports/pendance/[meetingId]/pdf/route.ts:41` | `` `HUDD-pendance-report-${date}.pdf` `` | same |
| D4 | `app/reports/meeting/[meetingId]/page.tsx:82,117` | client download filenames `HUDD-meeting-report-…` | same |
| D5 | `app/reports/pendance/[meetingId]/page.tsx:62` | client download filename `HUDD-pendance-report-…` | same |
| D6 | `lib/meeting-report-pdf-server.tsx:580`, `lib/pendance-report-pdf-server.tsx:238` | `<Document title="HUDD …" author="HUDD Dashboard">` | `productName` |
| D7 | `lib/meeting-report-xlsx-server.tsx:61` | `["Report", "HUDD Dashboard Meeting Pack"]` | `productName` |

---

## Discharged (extracted in Step 3 — for traceability)

- `basePath` → `lib/next-base-path.ts` chokepoint (raw fetches routed via `withNextBasePath()`).
- `logo` → `lib/hudd-logo.ts` reads `tenantConfig().logoPublicPath`.
- `timezone` (`Asia/Kolkata`) → `tenantTimezone()` (2 sites).
- `locale` (`en-IN`) → `tenantLocale()` (35 sites: date + number formatters).
- `pdfHeaderLine` (`Government of Odisha`) standalone header → `tenantConfig().pdfHeaderLine` (5 sites).
- `labels.soExpenditure` / `labels.ifmsExpenditure` → `tenantConfig().labels` (display + bulk-entry error matching).
- Clean toLocaleString currency → `formatCurrency` / `formatNumber` (chart tick formatters, report fmtCr).
- Two toFixed-based local `formatCurrency` helpers → read `currencySymbol`/`currencyUnit` from config.

---

## Not debt — true-leave (internal identifiers, no action)

Recording so they are not re-litigated every pass. Renaming these risks dropping
saved browser state or breaks symbol contracts; they carry no tenant-identity branch.

- `components/AppShell.tsx:36,46` — `hudd-sidebar-collapsed` localStorage key
- `components/ThemeProvider.tsx:14` — `hudd-theme` localStorage key
- `components/FontScaleProvider.tsx:5` — `hudd-text-scale` localStorage key
- `tests/helpers/seed-scope.ts:130,139,148` — `@hudd.test` fixture emails
- `HUDD_LOGO_PUBLIC_PATH` import lines (lint false positives — importing the centralized symbol)

## Not config debt — route to seed data (demo-tenant phase)

Odisha demo content that belongs in the demo tenant seed, not in config keys.
Procedure: move into the demo-tenant seed dataset when that phase opens; do **not**
extract to `lib/tenant-config/`. Tracked separately from the discharge rule above.

- `lib/data.ts`, `lib/mock-data.ts`, `src/lib/mock-data.ts` — demo schemes
  (`Swachha Odisha / SBM`), demo figures (`₹280 Cr`, `₹9,882 Cr`), demo officers (`FA HUDD`)
- `lib/templates.ts:94,97` — demo action-item rows
- `app/financial/execution-efficiency/ExecutionEfficiencyClient.tsx:193-249,265` — demo `valueDisplay` strings
- `components/AgentPanel.tsx:13,49`, `components/CommandCentre.tsx:40` — demo alert/status strings

---

## H. Human decisions — not agent-dischargeable

Items that need an explicit human call. An agent must **document and exclude**
them, never resolve them unilaterally.

### H1. `tenantId` column-default drift (`current_setting('app.tenant_id')`)

**State.** `prisma/schema.prisma` declares
`@default(dbgenerated("(current_setting('app.tenant_id', true))::uuid"))` on the
`tenantId` of 46 tenant-scoped models. **No migration has ever created that
default, and no database has it.** So `prisma migrate dev` proposes 46
`ALTER TABLE … ALTER COLUMN "tenantId" SET DEFAULT …` statements on *every* new
migration, and will keep doing so until someone decides.

**Why an agent must not just apply it.** Per `docs/PHASE2-TENANCY-PLAN.md` §2,
the standing hazard runs in the direction of *adding* the default:

- **Today (no default):** a write that bypasses the chokepoint hits `NOT NULL`
  and fails loudly. That is the safe failure.
- **With the default, and nothing binding the GUC:** identical behaviour — the
  setting is unset, the default evaluates to NULL, `NOT NULL` still rejects.
- **With the default, once anything binds `app.tenant_id`** (RLS is the obvious
  candidate): the same bypassing write silently succeeds, stamped with whatever
  tenant the pooled connection last had. A silent cross-tenant write.

So the two mechanisms must never be half-live together, and materialising the
default is a step toward exactly that.

**The decision needed.** One of:
1. **Drop the defaults from `schema.prisma`.** The chokepoint stays the only
   writer, `NOT NULL` stays the backstop, and migrate stops proposing them.
   Lowest risk; loses a type-level affordance that was never actually live.
2. **Materialise them in a dedicated migration**, with a written commitment that
   RLS/GUC binding will not be introduced without dropping them in the same
   change.

**Excluded so far by:** `prisma/migrations/20260814062230_phase3_entitlements`
(header records the removal). Any future migration must do the same until this
is decided.

---

## Re-surfacing

`scripts/check-tenancy-lint.mjs` re-emits sections A–D every CI run (currently
non-blocking). When an item is discharged, its line disappears from the lint output;
this file's *Discharged* section grows. The lint count is the cross-check: it should
trend toward the true-leave + test-pin floor (~11) as A–D drain.
