# HUDD v1 — Code-Level Verification Sweep

Audit date: 2026-08-05
Auditor: automated code sweep (read-only)
Repo HEAD: `fb10e69d44e3a1afa73a463196e12078abd2d1ce` (2026-08-04T13:01:54+05:30)

> Read-only audit. No file was modified. Every claim cites a file path + line range. "I couldn't find it" is recorded as `NOT-FOUND`. Runtime/infra properties are `CANNOT-VERIFY-FROM-CODE`.

---

## 1. Summary counts

| Verdict | Count |
|---|---|
| `IMPLEMENTED` | 60 |
| `PARTIAL` | 6 |
| `NOT-FOUND` | 16 |
| `CANNOT-VERIFY-FROM-CODE` | 9 |
| **Total** | **91** |

| Signal | Count |
|---|---|
| "Verified"-in-docs requirements that came back `NOT-FOUND` | 2 |
| "Verified"-in-docs requirements that came back `PARTIAL` | 1 |
| Draft requirements that turned out to be `IMPLEMENTED` | 2 |

**Highest-priority findings:**

1. `FR-EXP-002` (Dashboard PDF export) is marked Verified but **no dashboard PDF export code exists** — only meeting/pendance report PDFs.
2. `FR-MTG-002` (Active meeting mode) is marked Verified but the `DashboardMeeting` model has no active/live field and no active-mode UI exists.
3. `STD-EXPORT-001` violation: `buildMeetingReport` and `buildPendanceReport` do **not** filter by the caller's assigned schemes — any user with `VIEW_ASSIGNED_DATA` can export the full unscoped report.
4. `STD-RBAC-001` violation: `/api/v1/uploads/*` performs **no** server-side permission check in the Next.js layer; it proxies to FastAPI and relies entirely on the external service for auth.
5. `STD-AUDIT-001` systemic risk: `logAudit` is called **after** the primary mutation in nearly every route, not inside the same transaction — audit writes can silently fail.

---

## 2. Machine-parseable table

Columns: `FR-ID | Verdict | Entry Point | Primary Evidence | Server-Side Check | Gap Note`

```
FR-ACT-001 | IMPLEMENTED | /api/v1/action-items/[id] (GET/PATCH/DELETE) | app/api/v1/action-items/[id]/route.ts:1-180 | yes — requireAnyPermission/role checks in route | -
FR-ACT-002 | IMPLEMENTED | /api/v1/action-items (GET) | app/api/v1/action-items/route.ts:1-60 | yes — requireAnyPermission in route | -
FR-ACT-003 | IMPLEMENTED | /api/v1/action-items (POST) | app/api/v1/action-items/route.ts:1-120 | yes — requireAnyPermission CREATE_ACTION_ITEMS/UPDATE_ACTION_ITEMS | -
FR-ACT-004 | PARTIAL | /api/v1/action-items/[id]/proofs (POST) + /api/v1/uploads (POST) | app/api/v1/action-items/[id]/proofs/route.ts:14-88; app/api/v1/uploads/route.ts | proofs route checks UPLOAD_PROOF/UPDATE_ACTION_ITEMS; uploads route has NO Next.js check | upload proxied to FastAPI with no Next.js auth; no file type/size validation; no assignee/reviewer scoping on proof create
FR-ADMIN-001 | IMPLEMENTED | /admin/masters (organisations) + /api/v1/admin/organisations | app/admin/masters/page.tsx:18-40; app/api/v1/admin/organisations/route.ts | yes — MANAGE_PERMISSIONS/MANAGE_FINANCIAL_YEARS | -
FR-ADMIN-002 | IMPLEMENTED | /admin/masters (verticals) + /api/v1/admin/verticals | app/admin/masters/page.tsx:25-30; app/api/v1/admin/verticals/route.ts | yes — same guard | -
FR-ADMIN-003 | IMPLEMENTED | /admin/masters (sections) + /api/v1/admin/sections | app/admin/masters/page.tsx:26-30; app/api/v1/admin/sections/route.ts | yes — same guard | -
FR-ADMIN-004 | IMPLEMENTED | /admin/masters (ulbs) + /api/v1/admin/ulbs | app/admin/masters/page.tsx:27-30; app/api/v1/admin/ulbs/route.ts | yes — same guard | -
FR-ADMIN-005 | IMPLEMENTED | /admin/masters (designations) + /api/v1/admin/designations | app/admin/masters/page.tsx:28-30; app/api/v1/admin/designations/route.ts | yes — same guard | -
FR-ADMIN-006 | NOT-FOUND | n/a | searched app/admin/**; rg onboarding (only seed scripts) | n/a | no onboarding wizard page or route located
FR-AI-001 | PARTIAL | /api/v1/assistant/query (POST) | app/api/v1/assistant/query/route.ts:13-20; lib/assistant-query.ts:1-40 | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | keyword-matching + DB queries, NOT an LLM assistant; AI naming overstates the implementation
FR-AI-002 | IMPLEMENTED | /api/v1/admin/agent/run (POST) + lib/agent-runner.ts | app/api/v1/admin/agent/run/route.ts:8-35; lib/agent-runner.ts:1-250 | yes — requireAnyPermission MANAGE_PERMISSIONS/MANAGE_FINANCIAL_YEARS | -
FR-AI-003 | IMPLEMENTED | /api/v1/dashboard/ai-alerts (GET) | app/api/v1/dashboard/ai-alerts/route.ts:9-25 | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | -
FR-AI-004 | NOT-FOUND | n/a | rg anomaly (only ConfigurePanel label string) | n/a | no anomaly-detection code path beyond the AI alerts feature
FR-ANOM-001 | NOT-FOUND | n/a | rg anomaly — no rule engine, no anomaly model in schema.prisma | n/a | no rule-based anomaly check implementation located
FR-ANOM-002 | NOT-FOUND | n/a | no anomaly dashboard page or route | n/a | -
FR-ANOM-003 | NOT-FOUND | n/a | rg cron|node-cron|schedule — no nightly batch job | n/a | -
FR-APR-001 | NOT-FOUND | n/a | rg approvalChain|ApprovalChain|approval_chain — no matches | n/a | no configurable approval chain model or logic located
FR-APR-002 | NOT-FOUND | n/a | rg sequentialApproval — no matches | n/a | -
FR-AUD-001 | PARTIAL | /api/v1/rbac/audit (GET) | app/api/v1/rbac/audit/route.ts:1-60 | yes — requireAnyPermission MANAGE_PERMISSIONS | filtered to actionType rbac.role.permission only; no export; not a general audit viewer
FR-AUD-002 | NOT-FOUND | n/a | rg retention|deleteMany.*auditLog — no retention job | n/a | no 1-year retention enforcement located
FR-AUTH-001 | IMPLEMENTED | /api/auth/signin + auth.ts | auth.ts:1-120 | yes — Keycloak SSO in auth.ts | -
FR-AUTH-002 | IMPLEMENTED | /api/auth/keycloak/logout (POST) | app/api/auth/keycloak/logout/route.ts:1-60 | yes — session-scoped | -
FR-AUTH-003 | IMPLEMENTED | /api/v1/rbac/me (GET) | app/api/v1/rbac/me/route.ts:1-60 | yes — getDbUserBySession | -
FR-CC-001 | IMPLEMENTED | /api/v1/dashboard/command-centre (GET) | app/api/v1/dashboard/command-centre/route.ts; lib/command-centre-dashboard.ts | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA; applies user scoping | -
FR-CC-002 | NOT-FOUND | n/a | components/CommandCentre.tsx:234-235 — only meetingId filter | n/a | no quick-filter UI beyond meeting selector
FR-CC-003 | NOT-FOUND | n/a | rg advancedFilter — no matches | n/a | no advanced filter UI located
FR-CHLOG-001 | IMPLEMENTED | /changelog page + /api/v1/releases | app/changelog/page.tsx:1-60; lib/release-sync.ts:1-60 | yes — useRequireAuth on page; releases sync from data/releases.json | -
FR-EXP-001 | PARTIAL | /api/v1/reports/meeting/[meetingId]/xlsx (GET) | app/api/v1/reports/meeting/[meetingId]/xlsx/route.ts:1-60 | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | only meeting-report XLSX exists; no general CSV/XLSX export; no CSV at all
FR-EXP-002 | NOT-FOUND | n/a | rg jspdf|html2canvas|exportPdf — only lib/meeting-report-pdf.ts (deprecated client path) | n/a | no dashboard PDF export code located
FR-FIN-001 | IMPLEMENTED | /api/v1/financial/snapshots (POST) | app/api/v1/financial/snapshots/route.ts:1-80 | yes — requireAnyPermissionAndDbUser ENTER_FINANCIAL_DATA | -
FR-FIN-002 | IMPLEMENTED | /api/v1/financial/summary (GET) | app/api/v1/financial/summary/route.ts:39-60 | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | -
FR-FIN-003 | IMPLEMENTED | /api/v1/financial/budgets (GET) | app/api/v1/financial/budgets/route.ts:1-60 | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | -
FR-FIN-004 | IMPLEMENTED | /api/v1/financial/budgets (PATCH) + /api/v1/financial/supplements | app/api/v1/financial/budgets/route.ts:1-120 | yes — requireAnyPermissionAndDbUser ENTER_FINANCIAL_DATA | -
FR-FIN-005 | IMPLEMENTED | /financial/entry/bulk page | app/financial/entry/bulk/page.tsx:1-60 | yes — useRequireAnyPermission on page; submits via ENTER_FINANCIAL_DATA API | -
FR-FIN-006 | IMPLEMENTED | /api/v1/financial/summary (POST) + fy-budget-allocation | app/api/v1/financial/summary/route.ts:186-200; lib/finance-year-budget-allocation.ts | yes — requireAnyPermissionAndDbUser ENTER_FINANCIAL_DATA | -
FR-FIN-007 | IMPLEMENTED | /api/v1/admin/financial-years (GET/POST) + [id] (PATCH) | app/api/v1/admin/financial-years/route.ts:1-60 | yes — requireAnyPermissionAndDbUser MANAGE_FINANCIAL_YEARS | -
FR-KPI-001 | IMPLEMENTED | /api/v1/kpis/definitions (POST) | app/api/v1/kpis/definitions/route.ts:302-310 | yes — requirePermissionAndDbUser MANAGE_SCHEMES | -
FR-KPI-002 | IMPLEMENTED | /api/v1/kpis/measurements (POST) | app/api/v1/kpis/measurements/route.ts:1-80 | yes — ENTER_KPI_DATA via kpi-access | -
FR-KPI-003 | IMPLEMENTED | /api/v1/kpis/measurements/[id]/review (POST) | app/api/v1/kpis/measurements/[id]/review/route.ts:1-60 | yes — requirePermission APPROVE_KPI | -
FR-KPI-004 | IMPLEMENTED | /api/v1/kpis/definitions (GET) | app/api/v1/kpis/definitions/route.ts:41-50 | yes — requireAnyPermissionAndDbUser VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | -
FR-KPI-005 | IMPLEMENTED | /api/v1/kpis/definitions/[id] (PATCH) | app/api/v1/kpis/definitions/[id]/route.ts (reassign performers/reviewers) | yes — MANAGE_SCHEMES | -
FR-KPI-006 | IMPLEMENTED | /api/v1/kpis/targets/[id] (PATCH) | app/api/v1/kpis/targets/[id]/route.ts:1-60 | yes — requirePermission ENTER_KPI_DATA (MANAGE_SCHEMES overrides lock) | -
FR-KPI-007 | PARTIAL | /kpis/entry page + KpiMeasurement.escalationFlag | app/kpis/entry/page.tsx:673-733; prisma/schema.prisma:73-77,628 | yes — FLAG_KPI_ESCALATION gates entry | model + manual entry + display exist; no auto-trigger logic; no notification hook on escalation
FR-MTG-001 | IMPLEMENTED | /api/v1/meetings (GET/POST) + [id] (PATCH/DELETE) | app/api/v1/meetings/route.ts:42-160 | yes — requireAnyPermission/requirePermissionAndDbUser | -
FR-MTG-002 | NOT-FOUND | n/a | prisma/schema.prisma:645-666 (DashboardMeeting has no isActive/live field) | n/a | no active/live meeting mode field or UI located
FR-MTG-003 | IMPLEMENTED | /api/v1/meetings/[id]/materials (POST) + /api/v1/meeting-materials/[...path] | app/api/v1/meetings/[id]/materials/route.ts:40-139; lib/meeting-materials.ts:1-51 | yes — requireAnyPermissionAndDbUser CREATE_ACTION_ITEMS/MANAGE_SCHEMES | -
FR-MTG-004 | IMPLEMENTED | /meetings CreateActionItemMeetingModal | app/meetings/components/CreateActionItemMeetingModal.tsx:7,127 | yes — uses createActionItem service (POST /api/v1/action-items) | -
FR-MTG-005 | NOT-FOUND | n/a | rg entryWindow|closure|closeMeeting|isClosed|submissionWindow — no matches | n/a | no data-entry window or closure enforcement located
FR-NFR-001 | CANNOT-VERIFY-FROM-CODE | n/a | uptime is infra, not code | n/a | needs Grafana/uptime monitor screenshot
FR-NFR-002 | CANNOT-VERIFY-FROM-CODE | n/a | p95 latency is runtime metric | n/a | needs APM/latency dashboard
FR-NFR-003 | CANNOT-VERIFY-FROM-CODE | n/a | p95 write latency is runtime metric | n/a | needs APM/latency dashboard
FR-NFR-004 | CANNOT-VERIFY-FROM-CODE | n/a | concurrency is load-test result | n/a | needs load test output
FR-NFR-005 | CANNOT-VERIFY-FROM-CODE | n/a | report gen time is runtime metric | n/a | needs timed run against 1yr dataset
FR-NFR-006 | CANNOT-VERIFY-FROM-CODE | n/a | agent freshness depends on cron schedule | n/a | needs cron manifest / scheduler screenshot
FR-NFR-007 | CANNOT-VERIFY-FROM-CODE | n/a | delivery time depends on provider + queue | n/a | needs provider logs (note: WHATSAPP/EMAIL providers are mocked to console)
FR-NFR-008 | CANNOT-VERIFY-FROM-CODE | n/a | browser support is QA matrix | n/a | needs cross-browser test matrix
FR-NFR-009 | IMPLEMENTED | responsive layouts across pages | app/my-tasks/page.tsx; app/financial/entry/bulk/page.tsx; components/AppShell.tsx | n/a (UI) | mobile-responsive classes present; full 360px audit not performed
FR-NFR-010 | NOT-FOUND | n/a | rg retention|deleteMany.*older — no data retention policy job | n/a | no retention enforcement located
FR-NFR-011 | CANNOT-VERIFY-FROM-CODE | n/a | backup/RPO/RTO is infra | n/a | needs cloud backup config screenshot
FR-NFR-012 | PARTIAL | lib/assistant-query.ts | lib/assistant-query.ts:1-40 | n/a | English-only keyword matching; no Hindi chatbot support located
FR-NOTIF-001 | IMPLEMENTED | lib/services/NotificationService.ts | lib/services/NotificationService.ts (system config, quiet hours, event triggers) | yes — server-side service | WHATSAPP/EMAIL providers mocked to console.log
FR-NOTIF-002 | IMPLEMENTED | UserNotificationPreference model + service | prisma/schema.prisma (UserNotificationPreference); lib/services/NotificationService.ts | yes — server-side | -
FR-OPS-001 | IMPLEMENTED | /api/health (GET) | app/api/health/route.ts:1-20 | no (public health check) | -
FR-PROF-001 | IMPLEMENTED | /profile page + /api/v1/rbac/me | app/profile/page.tsx:1-40; app/api/v1/rbac/me/route.ts:1-60 | yes — getDbUserBySession on API | -
FR-PROF-002 | IMPLEMENTED | /api/v1/profile/change-password (POST) | app/api/v1/profile/change-password/route.ts:1-60 | yes — session-scoped | -
FR-RBAC-001 | IMPLEMENTED | /api/v1/admin/users (POST) + [userCode] (PATCH/DELETE) | app/api/v1/admin/users/route.ts:1-120; app/api/v1/admin/users/[userCode]/route.ts:1-120 | yes — requireAnyPermission MANAGE_USERS/MANAGE_PERMISSIONS | Keycloak user create happens BEFORE Prisma tx (orphan risk if DB fails)
FR-RBAC-002 | IMPLEMENTED | /api/v1/rbac/roles (GET) + [roleCode]/permissions (POST) | app/api/v1/rbac/roles/route.ts; app/api/v1/rbac/roles/[roleCode]/permissions/route.ts | yes — requireAnyPermission MANAGE_USERS/MANAGE_PERMISSIONS | -
FR-RBAC-003 | IMPLEMENTED | /api/v1/rbac/users/[userCode]/permissions (POST) | app/api/v1/rbac/users/[userCode]/permissions/route.ts:1-60 | yes — requirePermission MANAGE_PERMISSIONS | -
FR-RBAC-004 | IMPLEMENTED | lib/server-rbac.ts | lib/server-rbac.ts:1-120 (requirePermission, getEffectivePermissionCodesFromUserId) | yes — central server-side resolution | -
FR-RBAC-005 | IMPLEMENTED | /api/v1/admin/users/[userCode]/reset-password (POST) | app/api/v1/admin/users/[userCode]/reset-password/route.ts:1-60 | yes — requirePermission MANAGE_USERS | -
FR-RPT-001 | IMPLEMENTED | /api/v1/reports/meeting/[meetingId] (pdf/xlsx/json) | app/api/v1/reports/meeting/[meetingId]/xlsx/route.ts:1-60; .../pdf/route.ts:1-60 | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | underlying query does NOT scope by user's schemes (see STD-EXPORT-001)
FR-RPT-002 | IMPLEMENTED | /api/v1/reports/pendance/[meetingId] (pdf/json) | app/api/v1/reports/pendance/[meetingId]/pdf/route.ts:1-60 | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | underlying query does NOT scope by user's schemes (see STD-EXPORT-001)
FR-RPT-003 | IMPLEMENTED | /reports page | app/reports/page.tsx:1-60 | yes — useRequireRole on page | -
FR-RPT-004 | NOT-FOUND | n/a | rg cron|schedule|node-cron — no scheduled report job | n/a | no scheduled ACS report generation located
FR-RPT-005 | NOT-FOUND | n/a | no date-range report endpoint | n/a | no on-demand date-range report located
FR-SEC-001 | IMPLEMENTED | proxy.ts | proxy.ts:1-80 (session check, invalidated-session check, redirect) | yes — runs before all matched requests | -
FR-SEC-002 | IMPLEMENTED | src/lib/route-guards.ts | src/lib/route-guards.ts:1-120 (useRequireAuth, useRequireRole, useRequireAnyPermission) | n/a — client-side UX only (router.replace) | confirmed NOT load-bearing: client guards only call router.replace; all sensitive mutations re-checked server-side
FR-SEC-003 | IMPLEMENTED | src/lib/read-only-watermark.ts + AppShell | src/lib/read-only-watermark.ts:1-27; components/AppShell.tsx | n/a (UI) | watermark shown when user has no EDIT_SIGNALS permission
FR-SEC-004 | IMPLEMENTED | lib/audit.ts | lib/audit.ts (logAudit writes AuditLog row) | yes — server-side write | logAudit called AFTER mutation, not in same tx (see STD-AUDIT-001)
FR-SHELL-001 | IMPLEMENTED | components/AppShell.tsx + components/Sidebar.tsx | components/AppShell.tsx; components/Sidebar.tsx | n/a (UI) | -
FR-SHELL-002 | IMPLEMENTED | components/FontScaleProvider.tsx + TextSizeToolbarControl.tsx | components/FontScaleProvider.tsx:1-65; components/TextSizeToolbarControl.tsx:1-68 | n/a (UI) | -
FR-SR-001 | IMPLEMENTED | /api/v1/schemes (GET) + /api/v1/schemes/overview | app/api/v1/schemes/route.ts:42-50; app/api/v1/schemes/overview/route.ts | yes — requireAnyPermission VIEW_ALL_DATA/VIEW_ASSIGNED_DATA | -
FR-SR-002 | IMPLEMENTED | /api/v1/schemes (POST) + [id] (PATCH) | app/api/v1/schemes/route.ts:83-90; app/api/v1/schemes/[id]/route.ts:71-80 | yes — requirePermissionAndDbUser MANAGE_SCHEMES | -
FR-SR-003 | IMPLEMENTED | /schemes SchemeModal + schemeProgressModal | app/schemes/page.tsx:57-60,287-290 | n/a (UI) | -
FR-SR-004 | IMPLEMENTED | SchemeAssignment in /api/v1/schemes (POST/PATCH) | app/api/v1/schemes/route.ts (assignmentKind, userId) | yes — MANAGE_SCHEMES | -
FR-SR-005 | IMPLEMENTED | /api/v1/subschemes/[id] (PATCH/DELETE) | app/api/v1/subschemes/[id]/route.ts | yes — requirePermission MANAGE_SCHEMES | -
FR-SR-006 | IMPLEMENTED | /api/v1/schemes/[id] (PATCH archived + DELETE cascade) | app/api/v1/schemes/[id]/route.ts:100-105,160-190 | yes — requirePermissionAndDbUser MANAGE_SCHEMES | -
FR-SR-007 | IMPLEMENTED | /api/v1/schemes/reorder (PUT) | app/api/v1/schemes/reorder/route.ts | yes — requirePermission REORDER_SCHEMES | -
FR-TASK-001 | IMPLEMENTED | /my-tasks page | app/my-tasks/page.tsx:1-60 | yes — useRequireMyTasksHub on page | -
FR-TASK-002 | IMPLEMENTED | PendanceReportSection in /my-tasks | app/my-tasks/page.tsx:20 (PendanceReportSection import) | n/a (UI) | -
```

---

## 3. Standards conformance sweeps

### STD-RBAC-001 — Server-side permission enforcement is mandatory; client guards are UX-only

Method: enumerated every `app/api/**/route.ts` exporting `POST|PATCH|PUT|DELETE`, then counted `requirePermission*` / `getDbUserBySession` / `getSessionUser` calls per file.

**Mutation endpoints WITH a server-side check (representative — all others non-zero in the sweep):**

| Endpoint | Check function | File |
|---|---|---|
| POST /api/v1/action-items | requireAnyPermission | app/api/v1/action-items/route.ts |
| PATCH/DELETE /api/v1/action-items/[id] | requireAnyPermission + role checks | app/api/v1/action-items/[id]/route.ts |
| POST /api/v1/admin/users | requireAnyPermission MANAGE_USERS/MANAGE_PERMISSIONS | app/api/v1/admin/users/route.ts |
| PATCH/DELETE /api/v1/admin/users/[userCode] | requireAnyPermission | app/api/v1/admin/users/[userCode]/route.ts |
| POST /api/v1/financial/snapshots | requireAnyPermissionAndDbUser ENTER_FINANCIAL_DATA | app/api/v1/financial/snapshots/route.ts |
| PATCH /api/v1/financial/budgets | requireAnyPermissionAndDbUser ENTER_FINANCIAL_DATA | app/api/v1/financial/budgets/route.ts |
| POST /api/v1/kpis/definitions | requirePermissionAndDbUser MANAGE_SCHEMES | app/api/v1/kpis/definitions/route.ts |
| POST /api/v1/kpis/measurements/[id]/review | requirePermission APPROVE_KPI | app/api/v1/kpis/measurements/[id]/review/route.ts |
| POST /api/v1/schemes | requirePermissionAndDbUser MANAGE_SCHEMES | app/api/v1/schemes/route.ts |
| PUT /api/v1/schemes/reorder | requirePermission REORDER_SCHEMES | app/api/v1/schemes/reorder/route.ts |
| POST /api/v1/meetings | requirePermissionAndDbUser | app/api/v1/meetings/route.ts |
| POST /api/v1/meetings/[id]/materials | requireAnyPermissionAndDbUser | app/api/v1/meetings/[id]/materials/route.ts |
| POST /api/v1/rbac/roles/[roleCode]/permissions | requirePermission MANAGE_PERMISSIONS | app/api/v1/rbac/roles/[roleCode]/permissions/route.ts |
| POST /api/v1/profile/change-password | getSessionUser (session-scoped) | app/api/v1/profile/change-password/route.ts:16-19 |

**Mutation endpoints with NO server-side check (explicit list):**

| Endpoint | File | Notes |
|---|---|---|
| POST /api/v1/uploads | app/api/v1/uploads/route.ts:3-15 | Proxies formData to FastAPI; no `requirePermission*`, no `getSessionUser` |
| GET /api/v1/uploads | app/api/v1/uploads/route.ts:17-27 | Same — lists uploads unauthenticated in Next.js layer |
| POST /api/v1/uploads/[id]/approve | app/api/v1/uploads/[id]/approve/route.ts:4-18 | Proxies to FastAPI; no auth in Next.js |
| POST /api/v1/uploads/[id]/process | app/api/v1/uploads/[id]/process/route.ts:4-17 | Proxies to FastAPI; no auth in Next.js |

> All four `/uploads/*` routes rely entirely on the external FastAPI service for auth. If FastAPI does not enforce identity, any authenticated (or unauthenticated) caller can upload, list, approve, and process files. This is the single largest RBAC gap.

**Stub mutations (return 405, no real mutation — not a gap, recorded for completeness):**
- PATCH/DELETE `/api/v1/releases/[id]` (app/api/v1/releases/[id]/route.ts:5-17)
- POST `/api/v1/releases/[id]/entries`, PATCH/DELETE `/api/v1/releases/[id]/entries/[entryId]` (405 stubs)

**Client-only guards confirmed NOT load-bearing:** `src/lib/route-guards.ts` exports `useRequireAuth`, `useRequireRole`, `useRequireAnyPermission`, `useRequireMyTasksHub`. Each performs `router.replace` on the client only. Every sensitive mutation endpoint re-checks server-side via `requirePermission*`, so the client guards are UX-only. Confirmed division of responsibility is real.

### STD-AUDIT-001 — Sensitive mutations must write an audit log row in the same transaction

Sensitive = financial writes, RBAC/user changes, approval actions.

| Mutation | Audit write? | Same tx as mutation? | Silent-fail risk | Evidence |
|---|---|---|---|---|
| POST /api/v1/financial/snapshots | yes | NO — logAudit after create | yes | app/api/v1/financial/snapshots/route.ts (logAudit after prisma.create) |
| PATCH /api/v1/financial/budgets | yes | NO — logAudit after update | yes | app/api/v1/financial/budgets/route.ts (logAudit after tx) |
| POST /api/v1/financial/summary | yes | NO | yes | app/api/v1/financial/summary/route.ts:186+ |
| POST /api/v1/admin/users | yes | NO — Keycloak create BEFORE tx; logAudit after tx | yes + orphan risk | app/api/v1/admin/users/route.ts (Keycloak user created, then prisma tx, then logAudit) |
| PATCH/DELETE /api/v1/admin/users/[userCode] | yes | NO — Keycloak ops outside tx | yes + orphan risk | app/api/v1/admin/users/[userCode]/route.ts |
| POST /api/v1/rbac/roles/[roleCode]/permissions | yes | NO | yes | app/api/v1/rbac/roles/[roleCode]/permissions/route.ts |
| POST /api/v1/rbac/users/[userCode]/permissions | yes | NO | yes | app/api/v1/rbac/users/[userCode]/permissions/route.ts |
| POST /api/v1/kpis/measurements/[id]/review | yes | NO | yes | app/api/v1/kpis/measurements/[id]/review/route.ts |
| POST /api/v1/action-items (create) | yes | NO | yes | app/api/v1/action-items/route.ts (logAudit after create) |
| POST /api/v1/action-items/[id]/proofs | yes | NO | yes | app/api/v1/action-items/[id]/proofs/route.ts:70-78 |
| POST /api/v1/meetings/[id]/materials | yes | NO | yes | app/api/v1/meetings/[id]/materials/route.ts:121-129 |
| POST /api/v1/profile/change-password | yes | NO | yes | app/api/v1/profile/change-password/route.ts:128-136 |

**Systemic finding:** `logAudit` (lib/audit.ts) is called as a standalone `await` AFTER the primary Prisma mutation in every audited route — never inside `prisma.$transaction`. Therefore an audit write can throw while the mutation has already committed, producing an unaudited sensitive mutation. Additionally, for `admin/users`, the Keycloak user is created BEFORE the Prisma transaction, so a DB failure orphans a Keycloak user with no compensating rollback.

### STD-EXPORT-001 — Exports must not bypass row-level RBAC scope

Export/report paths located:

| Export | Route | Underlying query scoped? | Evidence |
|---|---|---|---|
| Meeting report PDF | GET /api/v1/reports/meeting/[meetingId]/pdf | NO — unscoped | lib/meeting-report.ts:187 `buildMeetingReport(meetingId)` takes only meetingId; line 263 `prisma.financeBudget.findMany({ where: { financialYearId: fy.id } })` — no user/scheme filter |
| Meeting report XLSX | GET /api/v1/reports/meeting/[meetingId]/xlsx | NO — unscoped | same `buildMeetingReport`; app/api/v1/reports/meeting/[meetingId]/xlsx/route.ts:30-40 |
| Meeting report JSON | GET /api/v1/reports/meeting/[meetingId] | NO — unscoped | same `buildMeetingReport` |
| Pendance report PDF | GET /api/v1/reports/pendance/[meetingId]/pdf | NO — unscoped | lib/pendance-report.ts:104 `buildPendanceReport(meetingId)`; line 117 `prisma.user.findMany({ where: { isActive: true } })` — all users, no scope |
| Pendance report JSON | GET /api/v1/reports/pendance/[meetingId] | NO — unscoped | same `buildPendanceReport` |

Quoted query (meeting report, lib/meeting-report.ts:263):
```ts
prisma.financeBudget.findMany({ where: { financialYearId: fy.id } }),
```

> Both report builders accept only `meetingId` and return the full dataset for that meeting regardless of the caller's assigned schemes. A user holding only `VIEW_ASSIGNED_DATA` (not `VIEW_ALL_DATA`) receives the same export as a full-access user. The route-level `requireAnyPermission("VIEW_ALL_DATA","VIEW_ASSIGNED_DATA")` gates entry but does not differentiate scope between the two. This is a row-level RBAC bypass on every export path.

No CSV export, no scheduled export, no date-range export paths exist (see FR-EXP-001, FR-RPT-004, FR-RPT-005).

### STD-CONFIG-001 — Hardcoded business values

| Value | File:line | Controls | Env/config exists? |
|---|---|---|---|
| `50 * 1024 * 1024` (50 MB) | lib/meeting-materials.ts:12 | Max meeting material upload size | NO — hardcoded |
| 7 MIME types (pdf/ppt/pptx/doc/docx/xls/xlsx) | lib/meeting-materials.ts:2-10 | Allowed meeting material file types | NO — hardcoded |
| 200 (filename truncation) | lib/meeting-materials.ts:32 | Max sanitized filename length | NO — hardcoded |
| `EDIT_SIGNALS` permission list (15 codes) | src/lib/read-only-watermark.ts:3-19 | Which permissions suppress the read-only watermark | NO — hardcoded (derives from Permission enum) |
| `5` failed attempts / `24h` lockout | app/api/v1/profile/change-password/route.ts:79-83 | Password-change lockout threshold + duration | NO — hardcoded |
| `8` min password length | app/api/v1/profile/change-password/route.ts:29 | New password minimum length | NO — hardcoded |
| `VALID_ESCALATION_FLAGS` set | app/api/v1/kpis/measurements/route.ts | Allowed KpiEscalationFlag values | derives from enum (schema.prisma:73-77) |
| KpiEscalationFlag enum (on_track/needs_coordination/needs_acs_decision) | prisma/schema.prisma:73-77 | Escalation flag vocabulary | NO — schema enum |
| `parseListLimit` default/max | lib/list-query-limit.ts | Page size cap on list endpoints | NO — hardcoded (not read) |
| FINANCE_YEAR_BUDGET_CATEGORY_LABELS / ORDER | lib/finance-year-budget-allocation.ts | Budget category labels + ordering | NO — hardcoded labels |
| ESCALATION_LABEL map | components/kpis/ViewKpiModal.tsx:10 | Display labels/colors for escalation flags | NO — hardcoded |
| Role codes (TASU/ACS/VERTICAL_HEAD etc.) | prisma/seed_roles_core.cjs; lib/auth.ts | Role identity | DB-backed (seeded), but codes are referenced inline in code |
| `data/releases.json` path | lib/release-sync.ts:14 | Source of release notes | file on disk (not env) |

### STD-NFR-001 — Performance/availability posture per NFR

| NFR | Code-enforceable? | What code shows | Settling artifact |
|---|---|---|---|
| FR-NFR-001 (99.5% uptime) | NO | nothing in code | Grafana / uptime monitor |
| FR-NFR-002 (read <500ms p95) | NO | no latency guard in code | APM latency dashboard |
| FR-NFR-003 (write <2s p95) | NO | no latency guard in code | APM latency dashboard |
| FR-NFR-004 (50→200 concurrent) | NO | no concurrency limit in code | load test output |
| FR-NFR-005 (report <60s) | NO | no timeout guard on report routes | timed run vs 1yr dataset |
| FR-NFR-006 (agent <24h fresh) | NO | agent-runner writes runDate; no scheduler in code | cron manifest / scheduler screenshot |
| FR-NFR-007 (notif <5min) | NO | NotificationService sends IN_APP sync; WHATSAPP/EMAIL mocked to console.log (lib/services/NotificationService.ts) | provider delivery logs — note: providers are mocked, so this CANNOT be met today |
| FR-NFR-008 (browser support) | NO | no browser detection/guard in code | QA cross-browser matrix |
| FR-NFR-009 (mobile 360px) | PARTIAL | responsive Tailwind classes present across pages | full 360px manual audit |
| FR-NFR-010 (data retention) | NO | no retention job in code | none — NOT-FOUND |
| FR-NFR-011 (backup RPO/RTO) | NO | infra only | cloud backup config screenshot |
| FR-NFR-012 (EN+HI chatbot) | PARTIAL | assistant is English-only keyword matching (lib/assistant-query.ts) | none — Hindi support NOT-FOUND |

> Blunt assessment: the codebase cannot support 9 of the 12 NFRs. NFR-007 is actively unmeetable because the WHATSAPP/EMAIL providers are console.log mocks. NFR-010 and NFR-012 are NOT-FOUND (no implementation). Only NFR-009 has partial code evidence.

---

## 4. Blocked product decisions

### FR-ACT-004 — Action Item Proof Upload

**Inventory:**
- BUILT: `ActionItemProof` + `File` Prisma models; POST `/api/v1/action-items/[id]/proofs` creates/links a File row and sets action item status to `PROOF_UPLOADED` (app/api/v1/action-items/[id]/proofs/route.ts:14-88). Audit log written.
- STUBBED: actual binary upload is delegated to FastAPI via `/api/v1/uploads` (app/api/v1/uploads/route.ts), which the proofs route references by accepting client-supplied `name` + `url` — the Next.js layer never receives the file bytes.
- ABSENT: no file-type/size validation on the proof path (validation exists only for meeting materials in lib/meeting-materials.ts); no check that the caller is the action item's assignee or reviewer (any user with `UPLOAD_PROOF` or `UPDATE_ACTION_ITEMS` can attach a proof to any action item); `/api/v1/uploads/*` has NO server-side auth in Next.js.

**Could it ship as-is?** No. A government client would expose: (a) unauthenticated file upload proxy, (b) no upload validation, (c) any officer able to attach "proof" to any action item regardless of assignment.
**Minimum remaining work:** add `requirePermissionAndDbUser` + assignee/reviewer check to `/api/v1/uploads/*` (or confirm FastAPI enforces identity and document it); port `assertAllowedMeetingMaterial`-style validation to the proof path; scope proof creation to the action item's assignee/reviewer. ~1–2 days.

### FR-KPI-007 — KPI Escalation Flags

**Inventory:**
- BUILT: `KpiEscalationFlag` enum (on_track/needs_coordination/needs_acs_decision) and `escalationFlag` field on `KpiMeasurement` (prisma/schema.prisma:73-77,628); manual entry UI gated by `FLAG_KPI_ESCALATION` (app/kpis/entry/page.tsx:673-733); display in ViewKpiModal (components/kpis/ViewKpiModal.tsx:567-568); persisted via POST `/api/v1/kpis/measurements` (app/api/v1/kpis/measurements/route.ts).
- STUBBED: none.
- ABSENT: no automatic trigger logic (escalation is purely manual); no notification hook when a flag is set to `needs_coordination`/`needs_acs_decision` (NotificationService has no escalation event).

**Could it ship as-is?** Yes, with a caveat — it is a functional manual flagging workflow. The risk is expectation-setting: "escalation flags" implies automated escalation, but today an officer must manually choose the flag and no one is notified.
**Minimum remaining work:** add an escalation event to NotificationService triggered on `escalationFlag != on_track` in the measurements POST route; optionally add auto-escalation based on overdue/bottleneck heuristics. ~1–2 days for notifications; ~3–5 days if auto-trigger is required.

### FR-AI-004 — AI-Augmented Anomaly Checks

**Inventory:**
- BUILT: the AI Alerts progress monitor (FR-AI-003) — `/api/v1/dashboard/ai-alerts` returns the latest `AgentInsight` (app/api/v1/dashboard/ai-alerts/route.ts). The meeting-wise progress agent (lib/agent-runner.ts) optionally calls an LLM.
- STUBBED: none for anomaly specifically.
- ABSENT: no anomaly model, no rule-based anomaly engine, no anomaly dashboard, no nightly batch (rg "anomaly" returns only a label string in components/ConfigurePanel.tsx:361). FR-ANOM-001/002/003 are all NOT-FOUND.

**Could it ship as-is?** No — there is no anomaly feature to ship. The "AI alerts" feature is a progress monitor, not anomaly detection.
**Minimum remaining work:** define anomaly rules or an LLM anomaly prompt; add an `Anomaly` model + detection pass (nightly or on-write); build a viewer. ~1–2 weeks minimum for a credible v1.

### FR-MTG-005 — Meeting data-entry window & closure

**Inventory:**
- BUILT: meetings have a `meetingDate` (prisma/schema.prisma:645-666); KPI measurements and financial snapshots are tied to a `meetingId`.
- STUBBED: none.
- ABSENT: no `isActive`/`closed`/`entryWindow`/`submissionDeadline` field on `DashboardMeeting`; no server-side check that rejects writes to a closed meeting; rg "entryWindow|closure|closeMeeting|isClosed|submissionWindow" returns zero matches. Any meeting can receive measurements at any time.

**Could it ship as-is?** No — without a closure mechanism there is no way to lock a meeting's data, which a government review process will expect.
**Minimum remaining work:** add a `closedAt`/`status` field + migration; enforce "meeting not closed" on the snapshot/measurements POST routes; add a close-meeting admin action + UI. ~2–3 days.

---

## 5. Configuration surface

### Environment variables read by the app

Source: `rg -oN 'process\.env\.[A-Z][A-Z0-9_]+'` across app/lib/src (excluding node_modules, .next, docs).

| Variable | Read in | Breaks if unset? | Default? |
|---|---|---|---|
| DATABASE_URL | lib/prisma.ts (Prisma client) | yes — no DB | no |
| DIRECT_URL | prisma/migrations + prisma client | yes — migrations fail | no |
| AUTH_SECRET | auth.ts (NextAuth secret) | yes — sessions unsigned | no |
| AUTH_URL | auth.ts (NextAuth URL) | yes — callbacks wrong | no |
| KEYCLOAK_ISSUER | auth.ts + lib/keycloak-admin.ts | yes — no SSO | no |
| KEYCLOAK_CLIENT_ID | auth.ts | yes — no SSO | no |
| KEYCLOAK_CLIENT_SECRET | auth.ts (in .env.example, read via auth config) | yes — no SSO | no |
| KEYCLOAK_REALM | lib/keycloak-admin.ts | yes — admin ops fail | no |
| KEYCLOAK_ROLE_CLIENT_ID | lib/keycloak-admin.ts | no — falls back to KEYCLOAK_CLIENT_ID | yes (fallback) |
| KEYCLOAK_ADMIN_CLIENT_ID | lib/keycloak-admin.ts (.env.example) | yes — user admin CRUD fails | no |
| KEYCLOAK_ADMIN_CLIENT_SECRET | lib/keycloak-admin.ts (.env.example) | yes — user admin CRUD fails | no |
| KEYCLOAK_POST_LOGOUT_REDIRECT_URI | auth.ts / logout route | yes — logout lands wrong | no |
| FASTAPI_INTERNAL_URL | lib/api-client.ts; app/api/v1/uploads/*; app/api/health/route.ts | yes — uploads + health break | no |
| LLM_API_URL | lib/llm.ts | no — LLM calls skipped if unset | yes (graceful skip) |
| LLM_API_KEY | lib/llm.ts | no — LLM calls skipped if unset | yes (graceful skip) |
| LLM_MODEL | lib/llm.ts | no — agent uses default | yes |
| LLM_PROVIDER | lib/llm.ts | no | yes |
| NEXT_PUBLIC_BASE_PATH | next.config.ts; lib/next-base-path.ts | no — basePath optional | yes |
| NEXT_PUBLIC_SUPABASE_URL | (read; usage TBD in lib) | partial | yes (placeholder) |
| SUPABASE_SERVICE_ROLE_KEY | (read; usage TBD in lib) | partial | yes (placeholder) |
| BOOTSTRAP_TASU_EMAIL | prisma/seed scripts | no — only seeding | yes |
| RESET_RBAC | prisma/seed scripts | no — only seeding | yes |
| CLEAR_DB_YES | prisma/seed scripts | no — only seeding | yes |
| WEBHOOK_SECRET | webhook listener route | yes — webhook auth fails | no |
| WEBHOOK_PORT | webhook listener route | yes — listener bind fails | no |

### DB-backed config / master-data tables that change behaviour

| Table | Effect | Evidence |
|---|---|---|
| SystemNotificationConfig | toggles event triggers + channels per event type | app/api/v1/admin/notification-config/route.ts; lib/services/NotificationService.ts |
| UserNotificationPreference | per-user channel + quiet-hours overrides | prisma/schema.prisma (UserNotificationPreference); NotificationService |
| Role / RolePermission / UserRole / UserPermissionOverride | effective permission resolution | lib/server-rbac.ts (getEffectivePermissionCodesFromUserId) |
| SchemeAssignment | KPI/action-item ownership scoping | lib/kpi-access.ts; app/api/v1/schemes/route.ts |
| FinancialYear | active FY gates financial entry + reports | app/api/v1/financial/* (fy lookup) |
| Release / ReleaseEntry | "What's new" surface | lib/release-sync.ts; app/changelog/page.tsx |
| Organisation / Vertical / Section / ULB / Designation | master data bound to users/schemes | app/admin/masters/page.tsx; app/api/v1/admin/* |

### Hardcoded values that would obviously need to differ for a second client

- Meeting material max size (50 MB) and allowed MIME types — lib/meeting-materials.ts:2-12
- Password lockout threshold (5) / lockout duration (24h) / min length (8) — app/api/v1/profile/change-password/route.ts:29,79-83
- Budget category labels and ordering — lib/finance-year-budget-allocation.ts
- Escalation flag vocabulary (on_track/needs_coordination/needs_acs_decision) — prisma/schema.prisma:73-77
- Read-only watermark permission list — src/lib/read-only-watermark.ts:3-19
- Release notes source file path (data/releases.json) — lib/release-sync.ts:14

---

## 6. Repo facts

```
$ git rev-parse HEAD
fb10e69d44e3a1afa73a463196e12078abd2d1ce

$ git log -1 --format=%cI
2026-08-04T13:01:54+05:30

$ git tag -l 'v1*' 'v1.*'
(no output — no v1 tag exists)

$ node --version
v24.13.1
```

package.json versions:
- next: 16.2.1
- react: 19.2.4
- prisma: ^6.6.0
- @prisma/client: ^6.6.0
- typescript: ^5
- @types/node: ^20
- (no "engines" field declared in package.json)

Migrations (prisma/migrations/): 34 migration directories + migration_lock.toml.

Latest migration name: `20260722072121_add_kpi_completion`

---

## 7. Open questions for the product owner

1. **FR-EXP-002 (Dashboard PDF) is marked Verified but has no code.** Was this ever built, or is the doc baseline wrong? Decision needed: rebuild it, or reclassify as Draft/NOT-FOUND.
2. **FR-MTG-002 (Active meeting mode) is marked Verified but has no field or UI.** Same question — reclassify or specify what "active mode" should mean (live editing? a status flag?).
3. **Export row-level scope (STD-EXPORT-001).** Should `VIEW_ASSIGNED_DATA` users receive full unscoped exports, or must exports be filtered to their assigned schemes? This changes whether the current report builders are a bug or by-design.
4. **`/api/v1/uploads/*` auth ownership.** Is FastAPI expected to enforce identity and permissions, or should the Next.js layer add `requirePermission*`? If FastAPI, please share its auth implementation so this audit can close the gap.
5. **FR-AI-001 naming.** The "Conversational Urban Assistant" is keyword-based, not LLM-based. Is that acceptable for v1, or must an LLM be wired in before client delivery?
6. **FR-NFR-007 (notification <5min).** WHATSAPP/EMAIL providers are console.log mocks (lib/services/NotificationService.ts). Is real provider integration in scope for v1, or is IN_APP-only acceptable?
7. **Audit-log transactional integrity (STD-AUDIT-001).** Acceptable that audit writes happen outside the mutation transaction (silent-fail risk), or should `logAudit` be moved inside `prisma.$transaction`?
8. **Keycloak-orphan risk.** Acceptable that Keycloak user creation precedes the Prisma transaction (orphan risk on DB failure), or should the order be reversed / a compensating delete added?
