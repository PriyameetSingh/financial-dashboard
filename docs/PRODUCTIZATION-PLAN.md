# HUDD Dashboard → Multi-Tenant Product: Adaptation Plan

> **Status:** Planning · 31 Jul 2026
> **Purpose:** Turn the HUDD-Odisha dashboard into a configurable master build deployable to multiple state departments.
> **Reference architecture:** the VMS `tenant.yaml` three-tier config model (declarative yaml → single write path → runtime/bootstrap surfaces, with drift detection, audit, and CI guards).

---

## Table of Contents

1. [Architecture Decision](#1-architecture-decision)
2. [Mental Model](#2-mental-model)
3. [Repo Structure](#3-repo-structure)
4. [Config Schema (the master inventory)](#4-config-schema-the-master-inventory)
5. [Single Write Path](#5-single-write-path)
6. [Admin UI Route](#6-admin-ui-route)
7. [Replace Hardcoded Values — Code Reference Map](#7-replace-hardcoded-values--code-reference-map)
8. [Per-Deployment Reference Data](#8-per-deployment-reference-data)
9. [Drift Detection, Audit, CI Guard](#9-drift-detection-audit-ci-guard)
10. [Net-New FRS Features (v1.0 Build Backlog)](#10-net-new-frs-features-v10-build-backlog)
11. [Deployment](#11-deployment)
12. [Conversational Client-Request Intake](#12-conversational-client-request-intake)
13. [Changelog: Dual Coverage](#13-changelog-dual-coverage)
14. [Sequencing](#14-sequencing)
15. [Open Questions](#15-open-questions)
16. [Notion Source Databases](#16-notion-source-databases)
17. [Key Code Reference Index](#17-key-code-reference-index)

---

## 1. Architecture Decision

**Separate deployments, not shared-schema.** Each state/department gets:
- Its own Postgres database
- Its own deployment on its own State Data Centre (SDC)
- The same master codebase + a tenant-specific `tenant.yaml` + `.env`

This is the VMS model: single-tenant-per-deployment, configured by a file. It satisfies government data-sovereignty requirements (each state's data stays in that state's SDC).

### What this means concretely
- **No `tenantId` columns** on rows.
- **No row-level security** policies.
- **No tenant-context resolution** from host headers.
- Each deployment seeds only the enum values it uses (enum stays the universe; seed picks the active subset + labels).
- "Multi-tenancy" = one master build + many config files.

### Master fields + tenant extensions
The config schema has two tiers:
1. **Master schema** — the guaranteed baseline of keys every deployment understands. Shipped with the codebase in `lib/tenant/config-schema.ts`.
2. **Tenant extensions** — a tenant's `tenant.yaml` can declare additional metadata keys beyond the master schema via an `extensions:` block. The `apply` command validates master keys strictly (fail on unknown master keys via CI check), accepts extension keys leniently (store + surface in UI under "Advanced / Tenant-specific"), but extension keys never affect core logic unless the codebase explicitly reads them.

This lets a state add a local "Municipal Commissioner" approval level or a state-specific finance head without forking the code.

---

## 2. Mental Model

```
tenant.yaml  (declarative intent, one file per client/department)
       │
       ▼
┌─────────────────────────────────────────────┐
│  applyTenantConfig()  — SINGLE WRITE PATH   │  ← lib/tenant/tenant-config-lib.ts
│  (CLI + Admin UI both call this; nothing     │
│   else upserts SystemConfig / env snippets)  │
└─────────────────────────────────────────────┘
       │                              │
       ▼ runtime.*                     ▼ bootstrap.*
  SystemConfig DB rows           env vars (process.env)
  (hot-reload, read per request)  (restart-required)
```

- `runtime.*` / `tenantSettings.*` → `SystemConfig` DB rows, hot-reloadable per request.
- `bootstrap.*` → env vars, restart-required (e.g. `KEYCLOAK_ISSUER`, `AUTH_URL`, `NEXTJS_BASE_PATH`).
- Secrets stay in env/secret-manager; explicitly excluded via `EXEMPT_ENV_KEYS` + `SECRET_ENV_PATTERNS`.
- `tenant-config diff` / `--check` is the drift detector (writes nothing).
- Guarded keys (module toggles, RBAC catalog changes, basePath) require `source: 'activate'`.

---

## 3. Repo Structure

**Single repo, no fork.** Forking creates drift; config-first customization is the principle. Fork only as a last resort (e.g., air-gapped SDC with a different auth provider), and treat it as debt to pay down.

```
hudd-dashboard/                    ← master build (current repo, refactored)
├── app/  lib/  components/  ...   ← master code (tenant-agnostic)
├── tenants/
│   ├── hudd-odisha/
│   │   ├── tenant.yaml            ← Odisha's config
│   │   ├── .env.example           ← Odisha's bootstrap env template
│   │   ├── seed.yaml              ← Odisha's reference data (verticals, ULBs, roles...)
│   │   └── CHANGELOG.md           ← Odisha tenant-specific changes
│   ├── <new-client>/
│   │   ├── tenant.yaml
│   │   └── ...
├── CHANGELOG.md                   ← master build changelog
├── lib/tenant/config-schema.ts   ← the master inventory
└── scripts/tenant-config.ts      ← the CLI
```

Each SDC deployment = `git clone` → `tenant-config apply tenants/<code>/tenant.yaml` → `npm run build` → `pm2 start`.

---

## 4. Config Schema (the master inventory)

Create `lib/tenant/config-schema.ts` — the machine-readable source of truth for every tunable knob. Mirrors the VMS `config-schema.ts` pattern.

### ConfigKeyDef shape

```typescript
export type ConfigKeyDef = {
  key: string;
  surface: ConfigSurface;        // 'runtime' | 'bootstrap'
  envName?: string;
  type: ConfigType;              // 'boolean' | 'number' | 'string' | 'enum' | 'json'
  default: boolean | number | string;
  hotReload: boolean;
  restartScope?: RestartScope;
  min?: number;
  max?: number;
  values?: string[];
  description?: string;
};
```

Also export `EXEMPT_ENV_KEYS` (infra/secrets out of scope) and `SECRET_ENV_PATTERNS` (regexes the CI check uses to reject secrets accidentally promoted into the schema). A generated `config-schema.yaml` is the human-readable view, produced by `scripts/generate-config-schema-yaml.ts`.

### Key enumeration (grouped)

Pull these from the "Hardcoded Values Found" + "What Would Need to Become Configurable" columns of the Notion Capability Registry.

#### Branding / white-label
| Key | Default | Source file |
|---|---|---|
| `branding.departmentName` | "Housing & Urban Development Department" | `components/AppShell.tsx:79`, `components/Sidebar.tsx:678` |
| `branding.shortName` | "HUDD Odisha" | `components/AppShell.tsx:78` |
| `branding.government` | "Government of Odisha" | `components/GovLoginBranding.tsx:21`, `lib/meeting-report-pdf-server.tsx:587` |
| `branding.logoAssetPath` | "/Frame 1.svg" | `lib/hudd-logo.ts:4` |
| `branding.loginCopy` | "HUDD Integrated Dashboard..." | `app/login/page.tsx` |
| `bootstrap.basePath` | "/hudd-dashboard" | `lib/next-base-path.ts:7`, `next.config.ts:6` |
| `branding.timezone` | "Asia/Kolkata" | `components/AppShell.tsx:45` |
| `branding.locale` | "en-IN" | `components/AppShell.tsx:39` |
| `branding.currency` | "₹" | `lib/templates.ts`, `lib/data.ts` |
| `branding.currencyUnit` | "Crore" | `lib/templates.ts:25-27`, `lib/data.ts` |
| `branding.pdfAuthor` | "HUDD Dashboard" | `lib/meeting-report-pdf-server.tsx:578` |
| `branding.pdfTitlePrefix` | "HUDD Meeting Pack" | `lib/meeting-report-pdf-server.tsx:578` |
| `branding.profileLabels` | ["HUDD Officer", "HUDD Nexus Dashboard"] | `app/profile/page.tsx:126,163` |
| `branding.kpiHeader` | "HUDD" | `app/kpis/page.tsx:472` |

#### Domain taxonomy — Finance
| Key | Default | Source file |
|---|---|---|
| `finance.fyCalendarConvention` | "APR_MAR" | `lib/finance-year-budget-allocation.ts`, `components/Sidebar.tsx:194-202` |
| `finance.fyLabelFormat` | "{start}-{endShort}" | `components/Sidebar.tsx:199-201` |
| `finance.budgetCategories` | [STATE_SCHEME, CENTRALLY_SPONSORED_SCHEME, CENTRAL_SECTOR_SCHEME, STATE_FINANCE_COMMISSION, UNION_FINANCE_COMMISSION, OTHER_TRANSFER_STAMP_DUTY, ADMIN_EXPENDITURE] | `prisma/schema.prisma:113-121` |
| `finance.sponsorshipTypes` | [STATE, CENTRAL, CENTRAL_SECTOR, NON_FINANCIAL] | `prisma/schema.prisma:14-23` |
| `finance.soLabel` | "SO Order" | `lib/templates.ts:25`, `components/schemes/SchemeModal.tsx` |
| `finance.ifmsLabel` | "IFMS Actual" | `lib/templates.ts:26`, `components/schemes/SchemeModal.tsx` |
| `finance.quarterTargetWeights` | [25, 15, 20, 40] | Scheme Budget vs Expense Board (hardcoded) |
| `finance.riskThresholds` | {critical: 20, warning: 60, onTrack: 60} | `lib/templates.ts:73-74` |
| `finance.ssAbbrev` / `finance.cssAbbrev` / `finance.csAbbrev` | "SS", "CSS", "CS" | Scheme Budget vs Expense Board |

#### Domain taxonomy — KPI / Monitoring
| Key | Default | Source file |
|---|---|---|
| `kpi.monitoringLevels` | [CS, ACS, CM] | `prisma/schema.prisma:79-83` |
| `kpi.types` | [OUTPUT, OUTCOME, BINARY] | `prisma/schema.prisma:49-53` |
| `kpi.escalationFlags` | [on_track, needs_coordination, needs_acs_decision] | `prisma/schema.prisma:73-77`, `app/kpis/page.tsx` |
| `kpi.overdueThresholdDays` | 5 | FRS FR-3.5 (configurable) |
| `kpi.selfApprovePolicy` | "allow" | `components/schemes/AddKpiModal.tsx`, `components/kpis/ReassignKpiModal.tsx` |
| `kpi.completionWorkflowEnabled` | true | `prisma/schema.prisma:547-554` |

#### Action items / TASU
| Key | Default | Source file |
|---|---|---|
| `actionItem.statusVocabulary` | [OPEN, IN_PROGRESS, PROOF_UPLOADED, UNDER_REVIEW, COMPLETED, OVERDUE] | `prisma/schema.prisma:103-110` |
| `actionItem.priorityVocabulary` | [Critical, High, Medium, Low] | `prisma/schema.prisma:96-101` |
| `actionItem.priorityMap` | {P0: Critical, P1: High, P2: Medium, P3: Low} | FRS uses P0–P3; enum uses words — config maps |
| `actionItem.defaultItemType` | "action_item" | `app/meetings/components/CreateActionItemMeetingModal.tsx` |
| `actionItem.overdueAutomation` | false | No job sets OVERDUE today (Capability Registry open question) |
| `actionItem.designationFallback` | "HUDD Officer" | `app/action-items/[id]/page.tsx:555,574` |

#### Roles & permissions
| Key | Default | Source file |
|---|---|---|
| `rbac.roleCatalog` | [ACS, VERTICAL_HEAD, FA, TASU, NODAL_OFFICER] | `src/types/index.ts:1-8`, `prisma/seed_roles_core.cjs:35-98` |
| `rbac.permissionCatalog` | (22 permission codes) | `src/types/index.ts:39-67`, `prisma/seed_roles_core.cjs:6-30` |
| `rbac.defaultRolePermissionMatrix` | (seed matrix) | `prisma/seed_roles_core.cjs:35-98` |
| `rbac.fallbackRole` | "NODAL_OFFICER" | `app/api/v1/rbac/me/route.ts` |
| `rbac.usernameFormat` | "phone-10-digit" | `app/api/v1/admin/users/route.ts`, `lib/keycloak-admin.ts` |
| `rbac.bootstrapAdminEmail` | "tasu.admin@hudd.bootstrap" | `prisma/seed_roles_core.cjs:160` |
| `rbac.navAdminRole` | "TASU" (should be permission-gated) | `components/Sidebar.tsx:133`, Capability Registry `ACL-PUNCH-001` |

#### Modules / feature flags (FR-13.1)
| Key | Default | Notes |
|---|---|---|
| `modules.financial.enabled` | true | Toggle FA module per department |
| `modules.kpi.enabled` | true | Toggle KPI module |
| `modules.actionItems.enabled` | true | Toggle TASU module |
| `modules.reports.enabled` | true | Toggle Reports |
| `modules.commandCentre.enabled` | true | Toggle dashboard landing |
| `modules.aiAssistant.enabled` | true | Conversational Urban Assistant |
| `modules.meetingNotetaker.enabled` | false | FR-11, not built |
| `modules.anomalyDetection.enabled` | false | FR-7, not built |
| `modules.lapseRisk.enabled` | false | FR-8, not built |
| `modules.commandCentre.useMockCards` | false | `lib/data.ts` mock figures |

#### Approval workflows (FR-5.1, 5.2 — net-new)
| Key | Default | Notes |
|---|---|---|
| `approvals.chainDefinitions` | {} | Per-module + per-scheme, 1..N levels |
| `approvals.sequentialEnforcement` | true | FR-5.2 |
| `approvals.delegationEnabled` | false | FR-5.3 |
| `approvals.gracePeriodDays` | 7 | FR-8.2 |

#### Notifications (FR-6.1 — partially in dev)
| Key | Default | Source file |
|---|---|---|
| `notifications.eventTriggers` | (FR-6.1 event→recipient→channel table) | `lib/services/NotificationService.ts` (currently hardcoded) |
| `notifications.quietHoursEnabled` | false | `prisma/schema.prisma:1027-1035` (`SystemNotificationConfig`) |
| `notifications.quietHoursStart` | "18:00" | `SystemNotificationConfig` |
| `notifications.quietHoursEnd` | "09:00" | `SystemNotificationConfig` |
| `notifications.digestMode` | false | FR-6.3 |

#### AI agent
| Key | Default | Source file |
|---|---|---|
| `ai.llmProvider` | "airawat" | `lib/llm.ts:18` |
| `ai.llmModel` | "qwen3-30b-a3b-instruct" | `lib/llm.ts:4` |
| `ai.llmApiUrl` | (env `LLM_API_URL`) | `lib/llm.ts:2` |
| `ai.llmApiKey` | (env `LLM_API_KEY`, secret — exempt) | `lib/llm.ts:3` |
| `ai.systemPrompt` | "senior administrative advisor for HUDD" | `lib/agent-runner.ts:655` |
| `ai.scheduleRunDay` | "Monday" | `prisma/schema.prisma:936` (`AgentConfig.runDay`) |
| `ai.redactionEnabled` | true | FR-9.5 |

#### Reports (FR-10.2)
| Key | Default | Notes |
|---|---|---|
| `reports.templateSections` | (toggle sections per template) | FR-10.2 |
| `reports.schedule` | "monthly,quarterly" | FR-10.1 |

#### Storage / files
| Key | Default | Source file |
|---|---|---|
| `storage.backend` | "local" | `lib/local-file-storage.ts` |
| `storage.maxUploadBytes` | 52428800 (50MB) | `next.config.ts:15`, `lib/meeting-materials.ts` |
| `storage.allowedMimeTypes` | (default set) | `lib/meeting-materials.ts` |

#### Operations
| Key | Default | Source file |
|---|---|---|
| `ops.fastApiEnabled` | true | `lib/api-client.ts:1`, `app/api/v1/test/route.ts` |
| `ops.fastApiUrl` | "http://localhost:8000" | `lib/api-client.ts:1` |

---

## 5. Single Write Path

Create `lib/tenant/tenant-config-lib.ts` with `applyTenantConfig(yaml, opts)`. Contract mirrors the VMS `applyConfig`:

- `validateConfig(yaml)` → errors array
- `readAppliedRuntimeConfig()` → current DB state
- `readAppliedBootstrapConfig()` → current env state
- `diffConfig(yaml, applied, partial)` → diff
- `--check` / `--dry-run` writes nothing
- **Atomicity:** all `SystemConfig` upserts + all `ConfigChangeLog` inserts in one Prisma `$transaction` (failed audit write rolls back config writes — no half-applied changes without attribution)
- **Two modes:** `partial: false` (CLI full declarative — absent keys reset to default) vs `partial: true` (UI patch — absent keys left alone)
- **Bootstrap keys** emit an env snippet, never auto-overwrite the running `.env` — operator merges then restarts
- **Guarded keys:** module toggles (`modules.*.enabled`), `rbac.roleCatalog`, `bootstrap.basePath` require `source: 'activate'`

### Prisma models to add

```prisma
model SystemConfig {
  id        String   @id @default(uuid()) @db.Uuid
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt
  updatedById String? @db.Uuid
  updatedBy   User?   @relation(fields: [updatedById], references: [id], onDelete: SetNull)
  @@map("system_config")
}

model ConfigChangeLog {
  id        String   @id @default(uuid()) @db.Uuid
  key       String
  oldValue  String?
  newValue  String?
  actor     String
  source    String   // 'cli' | 'ui' | 'activate'
  createdAt DateTime @default(now())
  @@index([createdAt])
  @@map("config_change_log")
}
```

Note: `SystemNotificationConfig` (`prisma/schema.prisma:1027-1035`) already exists for notification-specific config and can be referenced as a pattern, but the new `SystemConfig` is the generic key-value store for all `runtime.*` keys.

### CLI — `scripts/tenant-config.ts`

Six subcommands, all sharing the lib:

| Command | Purpose |
|---|---|
| `init` | Probe Keycloak realm + existing DB reference data, write a starter `tenant.yaml` |
| `validate` | Schema-validate a yaml (exit 0/1) |
| `show` | Dump current applied state (DB + env) as yaml/json |
| `apply` | Reconcile yaml → DB + emit env snippet. `--dry-run`/`--check` write nothing |
| `diff` | Intent vs applied drift (exit 1 on drift) |
| `activate --confirm` | The only path that may flip guarded keys (uses `source: 'activate'`) |

---

## 6. Admin UI Route

Create `app/api/v1/admin/system-config/route.ts` with four endpoints, all `requirePermission('MANAGE_SYSTEM_CONFIG')` (new permission code to add to the catalog):

- `GET /api/v1/admin/system-config` → applied state + schema metadata (UI renders typed inputs from this)
- `GET /api/v1/admin/system-config/schema` → the schema
- `POST /api/v1/admin/system-config/apply` → writes a yaml patch into `tenant.yaml` on disk, then calls `applyTenantConfig(partial: true)`. **Never touches `prisma.systemConfig` directly.** Actor from session (`human:<email>`), `source: 'ui'`. Guard rejections → `409 CONFIG_GUARDED` with the specific message.
- `POST /api/v1/admin/system-config/check` → drift check (writes nothing)

Build `components/admin/SystemConfigPage.tsx` consuming those endpoints: live applied config, typed inputs for hot-reloadable keys, "restart required" badges for cold keys, drift-check button. Follow AGENTS.md — no native `<select>`, use `CustomSelect`-style components; mobile-first with `flex-col md:flex-row` toolbars.

Add a "System Configuration" admin section to the sidebar (`components/Sidebar.tsx:130-160`) gated by `MANAGE_SYSTEM_CONFIG` permission, not by a hardcoded `UserRole` (this also fixes the existing TASU-vs-ACS nav bug flagged in the Capability Registry as `ACL-PUNCH-001`).

---

## 7. Replace Hardcoded Values — Code Reference Map

This is the sweep list. Every file below has HUDD/Odisha-specific hardcoded values that must read from `SystemConfig` via typed accessors in `lib/tenant/config.repository.ts` (cached per-request).

### Branding sweep
| File | Lines | What's hardcoded |
|---|---|---|
| `app/layout.tsx` | 9-12 | `title: "HUDD — Odisha Urban Governance"`, description |
| `components/AppShell.tsx` | 78-79 | "HUDD Odisha" / "Housing & Urban Development Department" |
| `components/GovLoginBranding.tsx` | 12-25 | logo alt text, "Government of Odisha", department name |
| `lib/hudd-logo.ts` | 4 | `HUDD_LOGO_PUBLIC_PATH = "/Frame 1.svg"` |
| `components/Sidebar.tsx` | 538-539, 678 | logo src/alt, default department string |
| `app/login/page.tsx` | 8-10, 48-52 | "HUDD Integrated Dashboard" login copy |
| `app/profile/page.tsx` | 126, 163 | "HUDD Officer" / "HUDD Nexus Dashboard" labels |
| `app/kpis/page.tsx` | 472 | "HUDD" header |
| `app/meetings/page.tsx` | 128, 168 | "HUDD dashboard meetings" copy |
| `app/action-items/page.tsx` | 407, 550 | "across HUDD schemes" copy |
| `app/action-items/[id]/page.tsx` | 555, 574 | "HUDD Officer" designation fallback |
| `components/WhatsNewNotification.tsx` | — | "What's New in HUDD" |
| `lib/meeting-report-pdf-server.tsx` | 578, 587-588 | PDF title "HUDD Meeting Pack", author "HUDD Dashboard", "Government of Odisha" / "Housing & Urban Development Department" headers |
| `lib/pendance-report-pdf-server.tsx` | — | "Government of Odisha", "HUDD Pendance Report" filename |
| `lib/templates.ts` | 47, 79, 111, 142 | `HUDD_Financial_Template.xlsx`, `HUDD_NEXUS_Schemes_Template.xlsx`, `HUDD_NEXUS_ActionPoints_Template.xlsx`, `HUDD_NEXUS_ULB_Template.xlsx` filenames |
| `lib/data.ts` | 1-60 | Mock Odisha financial figures (gate behind `modules.commandCentre.useMockCards`) |
| `lib/agent-runner.ts` | 655 | "senior administrative advisor for HUDD" system prompt |
| `components/command-centre/AiAlertsCard.tsx` | — | Hardcoded `/hudd-dashboard/api/v1/dashboard/ai-alerts` fetch path |
| `components/ConversationalAI.tsx` | — | "Urban Assistant" label, HUDD suggested queries |

### Auth / basePath sweep
| File | Lines | What's hardcoded |
|---|---|---|
| `lib/next-base-path.ts` | 7 | `NEXTJS_BASE_PATH = "/hudd-dashboard"` (bootstrap, restart-required) |
| `next.config.ts` | 6 | `basePath: NEXTJS_BASE_PATH` |
| `proxy.ts` | 16 | `PUBLIC_PATHS = new Set(["/login"])` |
| `auth.ts` | 66-80 | Keycloak issuer/clientId/clientSecret from env |
| `lib/keycloak-admin.ts` | 64, 73 | `KEYCLOAK_ROLE_CLIENT_ID`, realm resolution |
| `.env.example` | — | All bootstrap env vars (template) |

### RBAC sweep
| File | Lines | What's hardcoded |
|---|---|---|
| `src/types/index.ts` | 1-8 | `UserRole` enum (ACS, VERTICAL_HEAD, FA, TASU, NODAL_OFFICER) |
| `src/types/index.ts` | 39-67 | `Permission` enum (22 codes) |
| `prisma/seed_roles_core.cjs` | 6-30 | `PERMISSIONS` array |
| `prisma/seed_roles_core.cjs` | 32-98 | `ROLES` array + `NODAL_LIKE_PERMISSIONS` |
| `prisma/seed_roles_core.cjs` | 105 | `legacyCodes = ["AS", "PS_HUDD", "DIRECTOR", "VIEWER"]` |
| `prisma/seed_roles_core.cjs` | 160 | bootstrap email `tasu.admin@hudd.bootstrap` |
| `lib/server-rbac.ts` | 88-146 | `getEffectivePermissionCodesFromUserId` (permission resolution — no change needed, but consumes the catalog) |
| `src/lib/route-guards.ts` | — | Per-page `UserRole` and `Permission` arrays |
| `components/Sidebar.tsx` | 57-167 | Nav items with hardcoded `roles: [UserRole.TASU, ...]` |

### Domain taxonomy sweep
| File | Lines | What's hardcoded |
|---|---|---|
| `prisma/schema.prisma` | 14-23 | `SponsorshipType` enum (STATE/CENTRAL/CENTRAL_SECTOR/NON_FINANCIAL) |
| `prisma/schema.prisma` | 49-53 | `KPIType` enum (OUTPUT/OUTCOME/BINARY) |
| `prisma/schema.prisma` | 73-83 | `KpiEscalationFlag` + `KpiMonitoringLevel` enums |
| `prisma/schema.prisma` | 96-110 | `ActionItemPriority` + `ActionItemStatus` enums |
| `prisma/schema.prisma` | 113-121 | `FinanceYearBudgetCategory` enum (Odisha-specific set) |
| `lib/templates.ts` | 23-47 | Financial template rows with Odisha plan-type names |
| `lib/data.ts` | 1-60 | `financialData`, `verticals` with Odisha scheme names |
| `components/schemes/SchemeFormModal.tsx` | 415, 426-428 | Vertical examples, sponsorship labels |

### Approach for enums
Keep each Prisma enum as the **universe** of possible values. Add a config key (e.g. `finance.budgetCategories`, `kpi.monitoringLevels`) that selects the active subset + display labels per deployment. The seed script (`prisma/seed_roles_core.cjs` and a new `prisma/seed_reference_data.cjs`) reads the config and inserts only the active rows. This preserves type safety without schema migrations per tenant.

---

## 8. Per-Deployment Reference Data

Each deployment seeds its own verticals, ULBs, sections, designations, organisations, schemes, roles, and financial categories. No `tenantId` needed — the deployment's DB only contains that deployment's data.

### `seed.yaml` format (sibling to `tenant.yaml`)

```yaml
referenceData:
  verticals:
    - { code: WATER, name: "SUJALA / WATCO" }
    - { code: SWM, name: "Swachha Odisha / SBM" }
  ulbs:
    - { name: "Bhubaneswar" }
    - { name: "Cuttack" }
  sections:
    - { name: "Accounts" }
    - { name: "PHE" }
  designations:
    - { name: "Additional Chief Secretary" }
  organisations:
    - { name: "Technical & Advisory Support Unit" }
  roles:
    - code: ACS
      name: "Additional Chief Secretary"
      permissions: [VIEW_ALL_DATA, ENTER_FINANCIAL_DATA, ...]
  financialCategories:
    - STATE_SCHEME
    - CENTRALLY_SPONSORED_SCHEME
```

### Action items
- Define `seed.yaml` format (above).
- Refactor `prisma/seed_roles_core.cjs` to read role/permission catalog from `seed.yaml` instead of hardcoded `PERMISSIONS` / `ROLES` constants (`prisma/seed_roles_core.cjs:6-98`).
- Create `prisma/seed_reference_data.cjs` for verticals/ULBs/sections/designations/organisations.
- Build the **Department Onboarding Wizard (FR-13.2)** as the UI that generates `tenant.yaml` + `seed.yaml`. Maps to Capability Registry "Department Onboarding Wizard" and FRS `FR-ADMIN-006`.

---

## 9. Drift Detection, Audit, CI Guard

### Drift detector
`tenant-config diff` (CLI) and `POST /admin/system-config/check` (UI) compare `tenant.yaml` intent vs applied state. Exit 1 on drift in CI.

### Audit trail
Every `SystemConfig` change writes a `ConfigChangeLog` row (`actor`, `source`, `oldValue`, `newValue`) inside the same transaction as the upsert. This is the config analog of the existing `AuditLog` model (`prisma/schema.prisma:813-828`, `lib/audit.ts`) which covers FR-15.1.

### CI convention check — `scripts/check-config-convention.ts`
Mirror the VMS `check-config-convention.ts`. Fail the build if:
- A new env var appears in `.env.example` / `auth.ts` / `proxy.ts` but isn't in the schema or `EXEMPT_ENV_KEYS`.
- A new hardcoded string appears in the branding sweep files (lint rule over `AppShell.tsx`, `GovLoginBranding.tsx`, `layout.tsx`, `hudd-logo.ts`).
- A secret pattern leaks into the schema (`SECRET_ENV_PATTERNS`).

### Unit tests
Mirror the VMS `reconciler-active-guard.test.ts` and `single-write-path.test.ts`:
- **Guarded-key test:** full apply including a guarded key in its diff is rejected unless `source: 'activate'`; `--check` still reports it honestly.
- **Single-write-path test:** assert the route file has no direct `prisma.systemConfig` / `prisma.configChangeLog` reference.

### Auto-append to tenant changelog
Add a `tenant-config apply` step that auto-appends to `tenants/<code>/CHANGELOG.md` whenever a config diff is applied. The `ConfigChangeLog` DB row is the audit trail; the file is the human-readable summary.

---

## 10. Net-New FRS Features (v1.0 Build Backlog)

From the Notion FRS/Requirements DB, these are `Classification: Net-new` + `Status: Draft` (or `Extension` + `Draft` for incomplete ones). Each becomes its own epic.

### Net-new (not built)
| # | FRS ref | Requirement ID | Title | Notes |
|---|---|---|---|---|
| 1 | FR-5.1 | `FR-APR-001` | Configurable Approval Chains | Per-module + per-scheme, 1..N levels |
| 2 | FR-5.2 | `FR-APR-002` | Sequential Approval Enforcement | Block skipping levels |
| 3 | FR-6.1 | `FR-NOTIF-001` | Notification Engine — Event-Based Triggers | UAT 1.4.5 lists as In Development — verify before cold start |
| 4 | FR-6.2 | `FR-NOTIF-002` | Notification Preferences (User-Level) | Depends on #3 |
| 5 | FR-7.1 | `FR-ANOM-003` | Anomaly Detection — Nightly Batch Job | |
| 6 | FR-7.2 | `FR-ANOM-001` | Rule-Based Anomaly Checks | Duplicate, 2x-average, window, late-proof |
| 7 | FR-7.4 | `FR-ANOM-002` | Anomaly Dashboard | |
| 8 | FR-8.1 | — | Lapse-Risk Alert Generation | KPI/TASU/FA threshold detection |
| 9 | FR-8.2 | — | Grace-Period Escalation | Configurable grace period |
| 10 | FR-8.3 | — | Lapse-Risk Dashboard | |
| 11 | FR-10.1 | `FR-RPT-004` | Scheduled ACS Reports (Monthly/Quarterly) | |
| 12 | FR-10.3 | `FR-RPT-005` | On-Demand Date-Range Reports | |
| 13 | FR-12.1 | `FR-EXP-001` | Data Export — CSV/XLSX | UAT 1.4.2 lists as Pending — verify |
| 14 | FR-12.2 | `FR-EXP-002` | Data Export — Dashboard PDF | |
| 15 | FR-1.2 | `FR-CC-002` | Dashboard Quick Filters | This Month/Quarter/FY |
| 16 | FR-1.3 | `FR-CC-003` | Dashboard Advanced Filters | Date range, scheme, dept, officer, status |
| 17 | FR-15.2 | `FR-AUD-001` | Audit Log Viewer & Export (Admin) | Write path exists (`FR-SEC-004`); build read/export side |
| 18 | FR-15.3 | `FR-AUD-002` | Audit Log Retention Rule (1 Year) | Retention job |
| 19 | FR-13.2 | `FR-ADMIN-006` | Department Onboarding Wizard | UI on top of `tenant.yaml` + `seed.yaml` |
| 20 | FR-11 | — | Meeting Notetaker | In FRS-Odisha HUDD page §5.11 — **confirm v1.0 vs v1.1** |

### Extension items still in Draft (incomplete existing features)
| FRS ref | Requirement ID | Title | Notes |
|---|---|---|---|
| FR-2.1 | `FR-FIN-001` | Scheme-wise Financial Entry | Config: SO/IFMS fields, meeting linkage, approval decision |
| FR-3.1 | `FR-KPI-001` | KPI Definition Create & Edit | Config: type, units, monitoring level, self-approval policy |
| FR-3.2 | `FR-KPI-002` | KPI Measurement Entry | Config: validation rules, progress status rules |
| FR-4.1 | `FR-ACT-001` | Action Item Lifecycle & Review | Config: status machine, overdue automation, designation fallback |
| FR-1.1 | `FR-CC-001` | Command Centre Overview Dashboard | Remove/replace mock cards, dept labels |
| FR-9 | `FR-AI-001` | Conversational Urban Assistant | Config: assistant name, suggested prompts, dept framing |
| FR-7.3 | `FR-AI-004` | AI-Augmented Anomaly Checks | Extension of existing AI Alerts (progress-agent only today) |

### FRS-vs-build vocabulary mismatches to resolve
| FRS | Build | Resolution |
|---|---|---|
| Priority P0/P1/P2/P3 | `ActionItemPriority` Critical/High/Medium/Low | Config mapping `actionItem.priorityMap` (recommended) |
| Roles Officer/Reviewer/TASU Manager/Administrator/ACS Viewer | `UserRole` ACS/VERTICAL_HEAD/FA/TASU/NODAL_OFFICER | Config mapping (recommended), enum stays universe |
| FR-2.2–2.5 (financial approval workflow) | "Not required by design" for HUDD | Confirm whether new approval engine should cover FA for non-HUDD tenants |

---

## 11. Deployment

**Master build artifact.** `npm run build` produces one `.next` bundle. No tenant-specific code paths in the build.

### Per-tenant deploy mechanism
Recommend **one process per tenant** (matches existing PM2 model in `ecosystem.config.cjs`):
- Add a tenant code per instance, inject `TENANT_CODE` + that tenant's `bootstrap.*` env vars.
- Simplest, matches the VMS approach.
- Single-process-multi-tenant-by-host is a v2 optimization.

### Action items
- Update `Jenkinsfile` to deploy per-tenant: parameterize `TENANT_CODE`, pull the matching `tenants/<code>/tenant.yaml`, run `tenant-config apply` post-deploy.
- Per-tenant `.env.<tenant-code>` holds `bootstrap.*` keys (Keycloak realm, AUTH_URL, basePath, DATABASE_URL). Keep secrets out of git.
- Per-tenant Keycloak realm/client provisioning — automate via existing `lib/keycloak-admin.ts`.

### Key deploy files
| File | Purpose |
|---|---|
| `Jenkinsfile` | CI/CD pipeline — parameterize by `TENANT_CODE` |
| `ecosystem.config.cjs` | PM2 config — one instance per tenant |
| `scripts/deploy-test.sh` | Test deploy script |
| `scripts/deploy-prod.sh` | Prod deploy script |
| `nginx-proxy.conf` | Reverse proxy config |
| `docker-compose.yml` | Local docker compose |
| `docs/DEPLOYMENT.md` | Existing deployment docs |

---

## 12. Conversational Client-Request Intake

The user reports this is already built (the diff-calculation + personnel-notification agent for client feature requests). **Verify wiring** — do not rebuild.

### Action item
- Verify the existing intake agent integrates with `tenant.yaml`: a client request like "add a new scheme vertical" or "change KPI escalation labels" should produce a *proposed `tenant.yaml` patch*, route to the right personnel for approval, and on approval flow through `applyTenantConfig`. No new code expected — just confirm the integration point is the `apply` write path, not direct DB writes.

---

## 13. Changelog: Dual Coverage

Two files, two audiences:

### Master `CHANGELOG.md` (root)
- **Audience:** every tenant team + product/engineering.
- **Content:** changes to the codebase — new features, fixes, config schema additions, breaking changes.
- **Format:** existing Keep-a-Changelog format, plain-language per AGENTS.md.
- **Versioning:** master semver (`2.0.0`, `2.1.0`, ...). Bump only on explicit instruction per AGENTS.md.

### Tenant `tenants/<code>/CHANGELOG.md`
- **Audience:** that tenant's officers + client SPOC.
- **Content:** changes to that tenant's `tenant.yaml` / `seed.yaml` / `.env` — branding updates, new verticals, approval chain changes, module toggles, threshold tweaks.
- **Format:** same plain-language style. Example: *"Added 'Municipal Commissioner' as an approval level for the financial module per the department's delegation order dated 15 July."*
- **Versioning:** tenant config version, independent of master semver. Suggest `<master-version>+tenant-<n>` (e.g. `2.0.0+odisha-3`) so you always know which master build a tenant config is pinned to.

### Action items
- Add a `tenant-config apply` step that auto-appends to `tenants/<code>/CHANGELOG.md` whenever a config diff is applied.
- Add a CI check that fails if a `tenant.yaml` change doesn't come with a corresponding `CHANGELOG.md` entry in that tenant's folder.
- Master release process: when a master release is cut, every tenant's `CHANGELOG.md` should get a short "Master update available: <version> — <summary>" entry once they upgrade, so officers see what changed in their deployment.

---

## 14. Sequencing

| Phase | Why first | Blocks |
|---|---|---|
| A. Config schema (`lib/tenant/config-schema.ts`) | Inventory must exist before write path or UI | B, C, D |
| B. Single write path (`tenant-config-lib.ts` + models) | Single source of truth | C, D, E |
| C. Replace hardcoded values | Makes the master build actually tenant-agnostic | F, G |
| D. Per-deployment reference data (`seed.yaml`) | Tenants can't onboard without it | F, G |
| E. Admin UI + drift + audit + CI | Quality gates; ship alongside C | — |
| F. Net-new FRS features | Largest effort; can parallelize across epics | G |
| G. Deploy | Once master build is tenant-agnostic | — |
| H. Intake agent wiring | Last, depends on `apply` path existing | — |

### Consolidated action-item order (suggested)
1. Create `lib/tenant/config-schema.ts` — the master inventory.
2. Support `extensions:` in `tenant.yaml` for tenant-specific metadata.
3. Create `lib/tenant/tenant-config-lib.ts` — the single `applyTenantConfig` write path.
4. Add `SystemConfig` + `ConfigChangeLog` Prisma models.
5. Build `scripts/tenant-config.ts` CLI.
6. Create typed accessors `lib/tenant/config.repository.ts`.
7. Sweep and replace every hardcoded value flagged in §7.
8. Make enums config-subset-driven at seed time.
9. Define `seed.yaml` format.
10. Refactor `prisma/seed_roles_core.cjs` to read from `seed.yaml`.
11. Build the Department Onboarding Wizard (FR-13.2).
12. `app/api/v1/admin/system-config/route.ts` — four endpoints.
13. `components/admin/SystemConfigPage.tsx`.
14. Drift detector + `ConfigChangeLog` audit.
15. CI convention check + unit tests.
16. Auto-append to `tenants/<code>/CHANGELOG.md` on apply.
17. Configurable Approval Chains + Sequential Enforcement (FR-5.1, 5.2).
18. Notification Engine event triggers (FR-6.1) + user preferences (FR-6.2).
19. Anomaly Detection — nightly batch, rules, AI-augmented, dashboard (FR-7.1–7.4).
20. Lapse Risk Alerts — generation, escalation, dashboard (FR-8.1–8.3).
21. Scheduled ACS Reports (FR-10.1, 10.2) + On-Demand Date-Range Reports (FR-10.3).
22. Data Export CSV/XLSX (FR-12.1) + Dashboard PDF (FR-12.2).
23. Dashboard Quick + Advanced Filters (FR-1.2, 1.3).
24. Audit Log Viewer & Export (FR-15.2) + Retention (FR-15.3).
25. Meeting Notetaker (FR-11) — confirm v1.0 vs v1.1.
26. Parameterize `Jenkinsfile` by `TENANT_CODE`.
27. Per-tenant `.env.<code>` + Keycloak realm provisioning.
28. Verify intake agent wiring.

---

## 15. Open Questions

1. **Meeting Notetaker (FR-11):** v1.0 or defer to v1.1? It's in the FRS-Odisha HUDD page (§5.11) but not in the FRS/Requirements DB rows. Affects v1.0 scope.
2. **Financial approval workflow scope:** FR-2.2–2.5 is "not required by design" for HUDD. When the new approval engine (FR-5.1) ships, should it retroactively cover financial entries for new tenants that *do* want approval gates? This determines whether the engine is FA-aware or FA-agnostic.
3. **Config storage split:** Recommendation is **both** — the master repo holds `tenants/<code>/tenant.yaml` as the source of truth (version-controlled, reviewable, CI-checked), and a Notion database mirrors the applied state + change log for non-technical stakeholders. The repo is authoritative; Notion is a read-only view. Confirm this split works.
4. **Priority vocabulary:** FRS says P0/P1/P2/P3; enum says Critical/High/Medium/Low. Config mapping (recommended) or enum rename?

---

## 16. Notion Source Databases

All three live under the "HUDD Product Ops" page: https://app.notion.com/p/d5a295a25147492292b84ac718b1784d

| Database | URL | Data source ID | Purpose |
|---|---|---|---|
| **Capability Registry** | https://app.notion.com/p/370a9332a3e5493499cd900b24eb8d72 | `collection://0fdec912-c5c6-4cb2-ac3d-bffdac588312` | 65 capabilities with hardcoded values flagged, what needs to become configurable, RBAC, dependencies, open questions |
| **FRS / Requirements** | https://app.notion.com/p/55d9b22736de443b9ebd7e6837e12449 | `collection://6632070b-c81f-467d-9a27-7c1fcd661ed6` | Requirement rows mapping internal capabilities to official FRS FR-IDs, with classification (Config-only / Extension / Net-new), priority, status, version |
| **V1.0 Reconciliation Matrix — HUDD** | https://app.notion.com/p/dc11ba9e94d0425caef38a43c2fb63b8 | `collection://bf08423c-e2a0-467d-aab3-38a5eaafe71c` | Currently empty (no rows). Intended to map official FR-IDs to internal refs + reconciled status (Verified / Partial / Not built / Built beyond FRS scope) |

### FRS-Odisha HUDD page (the official FRS document)
- URL: https://app.notion.com/p/3ae1b3c0ffb28059aafdc90d53bcbc1f
- Contains the full Functional Requirements Specification, Version 1.0, Draft, April 2026.
- Sections: 5.1 Dashboard KPIs, 5.2 Financial Module, 5.3 KPI Module, 5.4 Action Items (TASU), 5.5 Approval Workflows, 5.6 Notification Engine, 5.7 Anomaly Detection, 5.8 Lapse Risk Alerts, 5.9 AI Assistant, 5.10 Auto-Generated Reports, 5.11 Meeting Notetaker, 5.12 Data Export, 5.13 Department Configuration, 5.14 User Management, 5.15 Audit Trail, 6. NFRs.
- Querying via MCP: use `notion-query-data-sources` with the data source IDs above and SQL syntax. See `.cursor/skills/fix-hudd-bugs/SKILL.md` for an example query pattern.

### How to query the Notion DBs from a future agent
```typescript
// Example: query the Capability Registry
CallMcpTool({
  server: "user-Notion",
  toolName: "notion-query-data-sources",
  arguments: {
    data: {
      data_source_urls: ["collection://0fdec912-c5c6-4cb2-ac3d-bffdac588312"],
      query: "SELECT \"Title\", \"Module/Category\", \"Hardcoded Values Found\", \"What Would Need to Become Configurable\" FROM \"collection://0fdec912-c5c6-4cb2-ac3d-bffdac588312\" ORDER BY \"Module/Category\""
    }
  }
});
```

---

## 17. Key Code Reference Index

A quick lookup table for future agents. Grouped by concern.

### Top-level config / build
| File | Lines | What |
|---|---|---|
| `next.config.ts` | 1-22 | Next.js config, `basePath`, `serverExternalPackages`, `proxyClientMaxBodySize` |
| `lib/next-base-path.ts` | 1-19 | `NEXTJS_BASE_PATH = "/hudd-dashboard"`, `withNextBasePath()` helper |
| `lib/hudd-logo.ts` | 1-5 | `HUDD_LOGO_PUBLIC_PATH = "/Frame 1.svg"` |
| `package.json` | 1-79 | Scripts, dependencies, Prisma seed config |
| `tsconfig.json` | — | TypeScript config |
| `eslint.config.mjs` | — | ESLint config |

### Auth
| File | Lines | What |
|---|---|---|
| `auth.ts` | 1-192 | NextAuth + Keycloak config, JWT callbacks, role extraction, redirect logic |
| `proxy.ts` | 1-119 | Auth middleware, `PUBLIC_PATHS`, token validation, session invalidation |
| `lib/auth-api-path.ts` | 1-19 | Auth.js basePath resolution |
| `lib/server-auth.ts` | 1-? | `getSessionUser()` |
| `lib/server-rbac.ts` | 1-262 | `requirePermission`, `requireAnyPermission`, effective permission resolution (role grants + allow overrides - deny overrides) |
| `lib/keycloak-admin.ts` | 1-? | Keycloak Admin API client (user CRUD, role sync, password reset) |
| `lib/session-invalidation.ts` | — | `isSessionInvalidated()` |
| `app/api/auth/[...nextauth]/route.ts` | — | NextAuth route handler |
| `app/api/v1/rbac/me/route.ts` | — | Session profile hydration endpoint |
| `src/lib/auth.ts` | 1-? | Client-side `UserRole`, `hasPermission`, localStorage key `hudd_session_user` |
| `src/lib/route-guards.ts` | — | Per-page client route guards (role + permission arrays) |
| `src/lib/read-only-watermark.ts` | — | Read-only watermark logic |

### Branding / UI shell
| File | Lines | What |
|---|---|---|
| `app/layout.tsx` | 1-31 | Root layout, metadata title/description, providers |
| `components/AppShell.tsx` | 1-133 | App shell, header, sidebar toggle, branding strings, AI assistant FAB |
| `components/Sidebar.tsx` | 1-167+ | Nav items with hardcoded `UserRole` arrays, logo, department string, meeting scope select |
| `components/GovLoginBranding.tsx` | 1-28 | Login page branding (logo, government name, department name) |
| `components/ThemeProvider.tsx` | — | Theme provider |
| `components/FontScaleProvider.tsx` | — | Text size accessibility (localStorage key `hudd-text-scale`) |
| `components/TextSizeToolbarControl.tsx` | — | Text size toolbar control |
| `components/WhatsNewNotification.tsx` | — | "What's New in HUDD" popup |
| `components/ConversationalAI.tsx` | — | Urban Assistant chat UI |
| `components/AgentPanel.tsx` | — | Agent panel |
| `app/login/page.tsx` | — | Login page |

### Prisma schema (full)
| File | Lines | What |
|---|---|---|
| `prisma/schema.prisma` | 1-1036 | Full schema — all models, enums, relations |
| `prisma/schema.prisma` | 14-23 | `SponsorshipType` enum |
| `prisma/schema.prisma` | 25-29 | `WorkflowType` enum |
| `prisma/schema.prisma` | 39-47 | `PermissionEffect`, `KPICategory`, `KPIType` enums |
| `prisma/schema.prisma` | 49-53 | `KPIType` enum |
| `prisma/schema.prisma` | 55-94 | Financial/KPI workflow + progress + escalation + monitoring + completion enums |
| `prisma/schema.prisma` | 96-110 | `ActionItemPriority`, `ActionItemStatus` enums |
| `prisma/schema.prisma` | 113-121 | `FinanceYearBudgetCategory` enum (Odisha-specific set) |
| `prisma/schema.prisma` | 124-127 | `OfficerType` enum (GOVERNMENT/PMU) |
| `prisma/schema.prisma` | 129-198 | `User` model |
| `prisma/schema.prisma` | 200-263 | `Role`, `Permission`, `RolePermission`, `UserRole`, `UserPermissionOverride` |
| `prisma/schema.prisma` | 265-342 | `Vertical`, `Section`, `Organisation`, `Designation`, `Ulb`, `UserSection`, `UserOrganisation` |
| `prisma/schema.prisma` | 344-445 | `FinancialYear`, `Scheme`, `Subscheme`, `SchemeAssignment`, `SchemeWorkflowConfig` |
| `prisma/schema.prisma` | 447-530 | `FinanceBudget`, `FinanceBudgetRevision`, `FinanceExpenditureSnapshot`, `FinanceSummaryHead` |
| `prisma/schema.prisma` | 532-643 | `KpiDefinition`, `KpiDefinitionPerformer`, `KpiDefinitionReviewerUser`, `KpiTarget`, `KpiMeasurement` |
| `prisma/schema.prisma` | 645-811 | `DashboardMeeting`, `MeetingTopic`, `MeetingMaterial`, `ActionItem`, `ActionItemPerformer`, `ActionItemReviewerUser`, `ActionItemUpdate`, `File`, `ActionItemProof` |
| `prisma/schema.prisma` | 813-828 | `AuditLog` |
| `prisma/schema.prisma` | 830-885 | `FinanceBudgetSupplement`, `FinanceYearBudgetAllocation`, `FinanceYearBudgetCategoryLine` |
| `prisma/schema.prisma` | 887-931 | `Release`, `ChangelogEntry`, `UserSeenRelease` |
| `prisma/schema.prisma` | 933-955 | `AgentConfig`, `AgentInsight` |
| `prisma/schema.prisma` | 957-1036 | `Notification`, `NotificationDispatch`, `UserNotificationPreference`, `SystemNotificationConfig` |

### Seed scripts
| File | Lines | What |
|---|---|---|
| `prisma/seed.js` | — | Main seed entry (calls `seed_roles_core.cjs`) |
| `prisma/seed_roles_core.cjs` | 1-221 | `PERMISSIONS`, `ROLES`, `NODAL_LIKE_PERMISSIONS`, `migrateLegacyRoles`, `seedRolesAndPermissions`, `ensureBootstrapTasuAdmin`, `ensureKnownUserRoleLinks` |
| `prisma/seed_roles.js` | — | RBAC-only seed |
| `prisma/seed_dashboards.ts` | — | Dashboard seed data (71KB) |
| `prisma/clear_mock_data.ts` | — | Mock data clearer |

### Types
| File | Lines | What |
|---|---|---|
| `src/types/index.ts` | 1-8 | `UserRole` enum |
| `src/types/index.ts` | 10-37 | `SessionUser`, `OfficerType` |
| `src/types/index.ts` | 39-67 | `Permission` enum (22 codes) |
| `src/types/index.ts` | 69-407 | Action item, KPI, financial, scheme types |

### Domain logic (lib/)
| File | What |
|---|---|
| `lib/data.ts` | Mock financial/vertical/scheme data (Odisha-specific) |
| `lib/templates.ts` | Excel template generators (HUDD filenames) |
| `lib/dashboardSpec.ts` | Dashboard spec |
| `lib/financial-budget-entries.ts` | Financial budget entry logic |
| `lib/finance-year-budget-allocation.ts` | FY budget allocation helpers |
| `lib/finance-summary-asof.ts` | Finance summary as-of logic |
| `lib/financial-status.ts` | Financial status helpers |
| `lib/scheme-fy-bucket-metrics.ts` | Scheme FY bucket metrics |
| `lib/scheme-dashboard-priority.ts` | Scheme dashboard priority |
| `lib/scheme-api.ts` | Scheme API client |
| `lib/kpi-access.ts` | KPI access rules |
| `lib/meeting-report.ts` | Meeting report logic |
| `lib/meeting-report-pdf.ts` | Meeting report PDF generator |
| `lib/meeting-report-pdf-server.tsx` | Meeting report PDF server renderer (Odisha headers) |
| `lib/pendance-report.ts` | Pendance report logic |
| `lib/pendance-report-pdf-server.tsx` | Pendance report PDF server renderer |
| `lib/agent-runner.ts` | Agent runner (HUDD system prompt at line 655) |
| `lib/assistant-query.ts` | Conversational assistant query builder |
| `lib/llm.ts` | LLM client (env-driven) |
| `lib/local-file-storage.ts` | Local file storage |
| `lib/meeting-materials.ts` | Meeting materials helpers |
| `lib/release-sync.ts` | Release sync from `data/releases.json` |
| `lib/audit.ts` | Audit log writer |
| `lib/api-client.ts` | FastAPI client |
| `lib/prisma.ts` | Prisma client singleton |

### Services
| File | What |
|---|---|
| `lib/services/NotificationService.ts` | Notification dispatch service (hardcoded event triggers) |
| `src/lib/services/` | Client-side services (actionItem, kpi, meeting, approval) |

### API routes (app/api/v1/)
| Path | What |
|---|---|
| `action-items/` | Action item CRUD |
| `admin/` | Admin endpoints (users, roles, etc.) |
| `assistant/` | Conversational assistant |
| `dashboard/` | Dashboard data + AI alerts |
| `directory/` | User directory |
| `financial/` | Financial entry/approval |
| `financial-years/` | FY CRUD |
| `kpis/` | KPI CRUD + review |
| `meeting-materials/` | Meeting file upload/preview |
| `meeting-topics/` | Meeting topic CRUD |
| `meetings/` | Meeting CRUD |
| `notifications/` | Notification dispatch + prefs |
| `profile/` | Officer profile + password change |
| `rbac/` | RBAC (me, permissions) |
| `releases/` | Release/changelog |
| `reports/` | Meeting + pendance report PDFs |
| `schemes/` | Scheme CRUD + overview |
| `subschemes/` | Subscheme CRUD |
| `test/` | Health check |
| `uploads/` | File uploads |

### Deploy / ops
| File | What |
|---|---|
| `Jenkinsfile` | CI/CD pipeline |
| `ecosystem.config.cjs` | PM2 config |
| `scripts/deploy-test.sh` | Test deploy |
| `scripts/deploy-prod.sh` | Prod deploy |
| `scripts/migrate-prod.sh` | Prod migration |
| `scripts/backup-prod-db.sh` | Prod DB backup |
| `scripts/update-nginx-config.sh` | Nginx config updater |
| `nginx-proxy.conf` | Reverse proxy config |
| `docker-compose.yml` | Local docker compose |
| `auto-deploy.service` | Auto-deploy systemd service |
| `webhook-server.js` | GitHub webhook listener |
| `docs/DEPLOYMENT.md` | Deployment docs |

### Existing skills / docs
| File | What |
|---|---|
| `AGENTS.md` | Workspace rules (Next.js, Prisma, changelog, mobile, UI, bug workflow) |
| `CLAUDE.md` | Points to `AGENTS.md` |
| `.cursor/skills/fix-hudd-bugs/SKILL.md` | HUDD bug-fixing workflow (Notion bug tracker) |
| `docs/PRODUCTIZATION-PLAN.md` | **This file** |
| `artifacts/capability_register_hudd.csv` | CSV export of the Notion Capability Registry (65 rows) |
| `CHANGELOG.md` | Master changelog |
| `QUICK-START.md` | Quick start guide |
| `TESTING-CHECKLIST.md` | Testing checklist |
| `ACCEPTANCE_CHECKLIST.txt` | Acceptance checklist |
| `WEBHOOK-SETUP.md` | Webhook setup |
| `design.md` | Design doc |

---

## End

This document is the single reference for the productization effort. Future agents should:
1. Read this file first before sweeping the codebase.
2. Use the code reference index (§17) to jump directly to relevant files.
3. Use the Notion data source IDs (§16) to query live capability/FRS data.
4. Follow the sequencing (§14) and the consolidated action-item order.
5. Resolve the open questions (§15) with the user before starting net-new feature work.

For the VMS reference architecture (the source of the `tenant.yaml` three-tier pattern), see the user's description in the original planning conversation — the key files there are `vms-config-lib.ts` (single write path), `config-schema.ts` (inventory), `vms-config.ts` (CLI), `system-config.ts` (UI route), and `AdminOpsPage.tsx` (frontend).
